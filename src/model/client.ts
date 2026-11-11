/**
 * The model, behind one interface with three versions:
 * - `ClaudeModel` asks Claude with the owner's key (`OWNER_ANTHROPIC_API_KEY`,
 *   never `ANTHROPIC_API_KEY`);
 * - `RecordedModel` replays saved answers, so tests, CI and the demo need no
 *   key and cost nothing; a question nobody recorded is an error;
 * - `RecordingModel` asks Claude only for what isn't recorded yet, and saves it.
 * A recording is keyed by the exact question, so a changed prompt is never
 * answered with an old answer.
 */

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"

import { DraftAnswer, SortAnswer, type Question } from "./questions.ts"

export interface Answer {
  /** The raw answer: untrusted until parsed. */
  text: string
  inputTokens: number
  outputTokens: number
}

export interface Model {
  readonly name: string
  ask(question: Question): Promise<Answer>
}

export class ModelError extends Error {}

/** Where the project's recordings are committed. */
export const RECORDINGS = join(import.meta.dirname, "../../evalset/recorded")

const Saved = z.strictObject({
  model: z.string(),
  purpose: z.string(),
  text: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
})

/** The same question always gives the same key. */
export function recordingKey(question: Question): string {
  return createHash("sha256").update(JSON.stringify(question)).digest("hex").slice(0, 24)
}

export class ClaudeModel implements Model {
  readonly name: string
  readonly #client: Anthropic

  constructor(name: string, apiKey = process.env["OWNER_ANTHROPIC_API_KEY"]) {
    if (!apiKey) throw new ModelError("OWNER_ANTHROPIC_API_KEY is not set")
    this.name = name
    this.#client = new Anthropic({ apiKey })
  }

  async ask(question: Question): Promise<Answer> {
    const schema = question.purpose === "sort" ? SortAnswer : DraftAnswer
    const response = await this.#client.messages.parse({
      model: this.name,
      max_tokens: 16_000,
      output_config: {
        effort: question.purpose === "sort" ? "low" : "medium",
        format: zodOutputFormat(schema),
      },
      system: question.system,
      messages: [{ role: "user", content: question.user }],
    })
    // A refusal or a cut-off answer has no usable text; parsing refuses it.
    const text =
      response.stop_reason === "end_turn"
        ? response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
        : ""
    return { text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  }
}

export class RecordedModel implements Model {
  constructor(
    readonly name: string,
    private readonly dir = RECORDINGS,
  ) {}

  ask(question: Question): Promise<Answer> {
    const file = join(this.dir, `${recordingKey({ ...question, model: this.name })}.json`)
    if (!existsSync(file))
      return Promise.reject(new ModelError(`no recorded answer for this ${question.purpose} question`))
    const saved = Saved.parse(JSON.parse(readFileSync(file, "utf8")))
    return Promise.resolve({
      text: saved.text,
      inputTokens: saved.inputTokens,
      outputTokens: saved.outputTokens,
    })
  }
}

export class RecordingModel implements Model {
  readonly name: string
  liveCalls = 0
  /** The recordings asked for, by key. */
  readonly used = new Set<string>()

  constructor(
    private readonly live: Model,
    private readonly dir = RECORDINGS,
  ) {
    this.name = live.name
  }

  async ask(question: Question): Promise<Answer> {
    const asked = { ...question, model: this.name }
    this.used.add(recordingKey(asked))
    const file = join(this.dir, `${recordingKey(asked)}.json`)
    if (existsSync(file)) return new RecordedModel(this.name, this.dir).ask(question)
    this.liveCalls++
    const answer = await this.live.ask(asked)
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(
      file,
      `${JSON.stringify({ model: this.name, purpose: question.purpose, ...answer }, null, 2)}\n`,
    )
    return answer
  }
}

/** Parses an answer strictly; `undefined` if it isn't the agreed shape (C1). */
export function parseAnswer<T>(schema: z.ZodType<T>, text: string): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** Deletes every recording in `dir` that none of `used` names; returns how many. */
export function removeUnused(used: Set<string>, dir = RECORDINGS): number {
  let removed = 0
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".json") && !used.has(file.slice(0, -".json".length))) {
      rmSync(join(dir, file))
      removed++
    }
  }
  return removed
}
