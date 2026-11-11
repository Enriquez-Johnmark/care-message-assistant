/**
 * Measuring the assistant on the 80 labelled made-up messages (I2, I3):
 * red-flag recall and false alarms, how well the model sorts, and Claude's
 * draft of every unflagged clinical message put through the same checks a
 * clinician's inbox relies on, with its cost at list price. Replayed from the
 * recordings, every run gives the same result.
 */

import { check, type Problem } from "./core/checks.ts"
import { redFlags } from "./core/red-flags.ts"
import type { DemoMessage } from "./demo.ts"
import type { PatientRecord, PortalMessage } from "./fhir/reader.ts"
import { DEFAULT_GUIDANCE } from "./guidance.ts"
import { parseAnswer, type Model } from "./model/client.ts"
import { DraftAnswer, SortAnswer, draftQuestion, sortQuestion, type Question } from "./model/questions.ts"

/** List prices in US dollars per million tokens (input, output). */
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [3, 15],
  "claude-haiku-5-5": [1, 5],
}

export interface Measured {
  model: string
  redFlags: { labelled: number; caught: number; missed: string[]; falseAlarms: string[] }
  sorting: { asked: number; right: number; wrong: { id: string; label: string; model: string }[] }
  drafts: { id: string; passed: boolean; problems: Problem[]; error?: string }[]
  tokens: { input: number; output: number; calls: number }
}

export interface Labelled {
  label: DemoMessage
  message: PortalMessage
  record: PatientRecord
}

export async function measure(model: Model, labelled: Labelled[]): Promise<Measured> {
  const result: Measured = {
    model: model.name,
    redFlags: { labelled: 0, caught: 0, missed: [], falseAlarms: [] },
    sorting: { asked: 0, right: 0, wrong: [] },
    drafts: [],
    tokens: { input: 0, output: 0, calls: 0 },
  }
  const ask = async (question: Question): Promise<string> => {
    const answer = await model.ask(question)
    result.tokens.input += answer.inputTokens
    result.tokens.output += answer.outputTokens
    result.tokens.calls++
    return answer.text
  }
  for (const { label, message, record } of labelled) {
    const flagged = redFlags(`${message.subject}\n${message.text}`).length > 0
    if (label.redFlag) {
      result.redFlags.labelled++
      if (flagged) result.redFlags.caught++
      else result.redFlags.missed.push(label.id)
    } else if (flagged) {
      result.redFlags.falseAlarms.push(label.id)
    }
    // As in the clinic: a flagged message never reaches the model.
    if (flagged) continue
    let sort: SortAnswer | undefined
    try {
      sort = parseAnswer(SortAnswer, await ask(sortQuestion(message, record.person)))
    } catch {
      sort = undefined
    }
    result.sorting.asked++
    if (sort?.type === label.type) result.sorting.right++
    else result.sorting.wrong.push({ id: label.id, label: label.type, model: sort?.type ?? "unreadable" })
    // Admin messages are answered from the clinic's template, never drafted.
    if (sort === undefined || sort.type === "admin") continue
    try {
      const draft = parseAnswer(DraftAnswer, await ask(draftQuestion(message, record, DEFAULT_GUIDANCE)))
      if (draft === undefined) {
        result.drafts.push({
          id: label.id,
          passed: false,
          problems: [],
          error: "the answer couldn't be read",
        })
        continue
      }
      const checked = check(draft.reply.trim(), {
        facts: record.facts,
        message: `${message.subject}\n${message.text}`,
      })
      result.drafts.push({ id: label.id, passed: checked.problems.length === 0, problems: checked.problems })
    } catch (error) {
      result.drafts.push({
        id: label.id,
        passed: false,
        problems: [],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

export function costUsd(measured: Measured): number | undefined {
  const price = PRICES[measured.model]
  if (!price) return undefined
  return (measured.tokens.input * price[0] + measured.tokens.output * price[1]) / 1_000_000
}

const percent = (n: number, of: number) => (of === 0 ? "–" : `${String(Math.round((n / of) * 100))}%`)

/** The report, as Markdown. */
export function report(measured: Measured): string {
  const passed = measured.drafts.filter((d) => d.passed).length
  const cost = costUsd(measured)
  const perDraft =
    cost === undefined || measured.drafts.length === 0
      ? "unknown"
      : `US$${(cost / measured.drafts.length).toFixed(4)}`
  const failed = measured.drafts.filter((d) => !d.passed)
  return [
    "# Measurement",
    "",
    "On the 80 labelled made-up messages in `evalset/messages.json`, with the clinic's default guidance. Claude's answers are replayed from `evalset/recorded/`; `pnpm cli eval --record` asks Claude again with the owner's key. Costs are at list price. The model never sees who the patient is, and never sees a flagged message.",
    "",
    "| Measure | Result |",
    "|---|---|",
    `| Red flags caught in code | ${String(measured.redFlags.caught)} of ${String(measured.redFlags.labelled)} (${percent(measured.redFlags.caught, measured.redFlags.labelled)}) |`,
    `| False alarms (flagged, labelled not urgent) | ${String(measured.redFlags.falseAlarms.length)}: ${measured.redFlags.falseAlarms.join(", ") || "none"} |`,
    `| Messages sorted to their labelled type (${measured.model}) | ${String(measured.sorting.right)} of ${String(measured.sorting.asked)} (${percent(measured.sorting.right, measured.sorting.asked)}) |`,
    `| Drafts passing every check (${measured.model}) | ${String(passed)} of ${String(measured.drafts.length)} (${percent(passed, measured.drafts.length)}) |`,
    `| Model calls, and cost per draft | ${String(measured.tokens.calls)} calls; ${perDraft} |`,
    "",
    "The red-flag list was written before these messages were read and caught 12 of 19 on that blind run; it was then widened, so this set no longer measures recall on new wording (`evalset/README.md`).",
    "",
    "## Messages sorted to another type",
    "",
    ...(measured.sorting.wrong.length === 0
      ? ["None."]
      : measured.sorting.wrong.map((w) => `- **${w.id}**: labelled ${w.label}, sorted as ${w.model}`)),
    "",
    "## Drafts that failed a check",
    "",
    ...(failed.length === 0
      ? ["None."]
      : failed.flatMap((d) => [
          `- **${d.id}**`,
          ...d.problems.map((p) => `  - ${p.check}: ${p.found}`),
          ...(d.error ? [`  - ${d.error}`] : []),
        ])),
    "",
  ].join("\n")
}
