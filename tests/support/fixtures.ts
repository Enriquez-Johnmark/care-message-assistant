/** What several test files share: a fixed clock, a fake model, and the made-up
 *  patients and messages as the app reads them. */

import { FixedClock } from "../../src/clock.ts"
import { demoMessages, demoPatients } from "../../src/demo.ts"
import { messageResource, patientResources } from "../../src/fhir/build.ts"
import { read, type PatientRecord, type PortalMessage } from "../../src/fhir/reader.ts"
import type { Answer, Model } from "../../src/model/client.ts"
import type { Question } from "../../src/model/questions.ts"

/** 10 November 2026, 9 am in the clinic's time (Pacific). */
export const clock = () => new FixedClock(new Date("2026-11-10T17:00:00Z"))

/** The demo patients and every labelled message, read as from the FHIR server. */
export function clinic(): { records: PatientRecord[]; messages: PortalMessage[] } {
  const result = read([...demoPatients().flatMap(patientResources), ...demoMessages().map(messageResource)])
  return { records: result.records, messages: result.messages }
}

export function messageAndRecord(key: string): { message: PortalMessage; record: PatientRecord } {
  const { records, messages } = clinic()
  const message = messages.find((m) => m.key === key)
  const record = records.find((r) => r.person.fhirId === message?.patientFhirId)
  if (!message || !record) throw new Error(key)
  return { message, record }
}

export const GOOD_REPLY =
  "Hi {first_name}, thank you for writing to us. Your care team has your message and will look at it with your record. " +
  "If you feel worse, please call the clinic."

/** A stand-in for Claude: sorts as told, drafts `reply`, and counts every call. */
export class FakeModel implements Model {
  readonly name = "claude-test"
  readonly asked: Question[] = []

  constructor(
    private readonly sort: { type: string; urgency: string } | "broken" = {
      type: "medication",
      urgency: "routine",
    },
    /** The reply to draft; "broken" for an answer of the wrong shape. */
    private readonly reply: string = GOOD_REPLY,
  ) {}

  ask(question: Question): Promise<Answer> {
    this.asked.push(question)
    const answer =
      question.purpose === "sort"
        ? this.sort === "broken"
          ? "not json"
          : JSON.stringify(this.sort)
        : this.reply === "broken"
          ? '{"text":"wrong shape"}'
          : JSON.stringify({ reply: this.reply })
    return Promise.resolve({ text: answer, inputTokens: 400, outputTokens: 80 })
  }
}

/** A model the test fails if anything calls. */
export const noCallsAllowed: Model = {
  name: "must-not-be-called",
  ask: () => Promise.reject(new Error("the model was called")),
}
