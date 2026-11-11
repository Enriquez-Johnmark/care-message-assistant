import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { parseAnswer, RecordedModel, RecordingModel, type Answer, type Model } from "../src/model/client.ts"
import { DraftAnswer, SortAnswer, type Question } from "../src/model/questions.ts"

const question: Question = {
  purpose: "sort",
  model: "claude-sonnet-5-5",
  system: "Sort.",
  user: "<message>hi</message>",
}

class Counting implements Model {
  readonly name = "claude-sonnet-5-5"
  calls = 0
  ask(): Promise<Answer> {
    this.calls++
    return Promise.resolve({
      text: '{"type":"admin","urgency":"routine"}',
      inputTokens: 100,
      outputTokens: 10,
    })
  }
}

describe("c1 the model's answers", () => {
  it("c1 an answer is parsed into strict types, and anything else is refused", () => {
    expect(parseAnswer(SortAnswer, '{"type":"admin","urgency":"routine"}')).toEqual({
      type: "admin",
      urgency: "routine",
    })
    for (const broken of [
      "admin",
      '{"type":"admin"}',
      '{"type":"emergency","urgency":"routine"}',
      '{"type":"admin","urgency":"urgent"}',
      '{"type":"admin","urgency":"routine","note":"x"}',
      "",
    ]) {
      expect(parseAnswer(SortAnswer, broken), broken).toBeUndefined()
    }
    expect(parseAnswer(DraftAnswer, '{"reply":""}')).toBeUndefined()
  })

  it("c1 a recorded answer is replayed; a question nobody recorded fails instead of reaching a model", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recorded-"))
    const live = new Counting()
    const recording = new RecordingModel(live, dir)

    await recording.ask(question)
    await recording.ask(question)
    const replayed = await new RecordedModel("claude-sonnet-5-5", dir).ask(question)

    expect(live.calls).toBe(1)
    expect(replayed.text).toBe('{"type":"admin","urgency":"routine"}')
    await expect(
      new RecordedModel("claude-sonnet-5-5", dir).ask({ ...question, user: "other" }),
    ).rejects.toThrow("no recorded answer")
  })
})
