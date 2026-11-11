import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { check } from "../src/core/checks.ts"
import { demoMessages, demoPatients } from "../src/demo.ts"
import { patientResources } from "../src/fhir/build.ts"
import { read } from "../src/fhir/reader.ts"

interface BadDrafts {
  good: string
  drafts: { id: string; message: string; check: string; draft: string }[]
}
const set = JSON.parse(readFileSync("evalset/bad-drafts.json", "utf8")) as BadDrafts

/** The record and message a draft answers, as the app reads them from FHIR. */
function contextOf(messageId: string) {
  const message = demoMessages().find((m) => m.id === messageId)
  const patient = demoPatients().find((p) => p.id === message?.patient)
  if (!message || !patient) throw new Error(messageId)
  const facts = read(patientResources(patient)).records[0]?.facts
  if (!facts) throw new Error(patient.id)
  return { facts, message: message.text }
}

describe("i1 the 40 bad drafts", () => {
  it("i1 the good draft they start from passes every check", () => {
    expect(check(set.good, contextOf("m32")).problems).toEqual([])
  })

  it("i1 all 40 are blocked, each by exactly the check it was written to trip", () => {
    expect(set.drafts).toHaveLength(40)
    for (const draft of set.drafts) {
      const failed = [...new Set(check(draft.draft, contextOf(draft.message)).problems.map((p) => p.check))]
      expect(failed, `${draft.id}: ${draft.draft}`).toEqual([draft.check])
    }
  })
})
