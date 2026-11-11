import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { measure, report } from "../src/eval.ts"
import { demoMessages } from "../src/demo.ts"
import { takeIn } from "../src/intake.ts"
import { RecordedModel } from "../src/model/client.ts"
import { MODEL } from "../src/model/questions.ts"
import { approve, contentHash, discard, edit, latestDraft } from "../src/review.ts"
import { reviewReport } from "../src/review-report.ts"
import { freshDb } from "./support/db.ts"
import { clinic, clock, FakeModel, messageAndRecord } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

function labelled() {
  const { records, messages } = clinic()
  return demoMessages().flatMap((label) => {
    const message = messages.find((m) => m.key === label.id)
    const record = records.find((r) => r.person.fhirId === message?.patientFhirId)
    return message && record ? [{ label, message, record }] : []
  })
}

describe("i measurement", () => {
  it("i2 at least 90% of Claude's recorded drafts pass, and the report lists every one that didn't", async () => {
    const measured = await measure(new RecordedModel(MODEL), labelled())
    const passed = measured.drafts.filter((d) => d.passed).length
    const text = report(measured)

    expect(
      measured.drafts.every((d) => d.error === undefined),
      "every question is recorded",
    ).toBe(true)
    expect(passed / measured.drafts.length).toBeGreaterThanOrEqual(0.9)
    for (const failed of measured.drafts.filter((d) => !d.passed)) expect(text).toContain(`**${failed.id}**`)
    expect(
      readFileSync("evalset/report.md", "utf8"),
      "evalset/report.md is out of date: run pnpm cli eval",
    ).toBe(text)
  })

  it("i3 the report gives red-flag recall and false alarms on the labelled set", async () => {
    const measured = await measure(new RecordedModel(MODEL), labelled())

    expect(measured.redFlags.caught).toBe(measured.redFlags.labelled)
    expect(report(measured)).toContain(`Red flags caught in code | ${String(measured.redFlags.labelled)} of`)
    expect(report(measured)).toContain("False alarms")
  })

  it("i3 the review report counts replies sent as drafted, edited and discarded, and the time to approval", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const time = clock()
    const deps = { db, clock: time }
    const asDrafted = messageAndRecord("m01")
    const toEdit = messageAndRecord("m06")
    const first = await takeIn({ ...deps, model: new FakeModel() }, asDrafted.message, asDrafted.record)
    const second = await takeIn({ ...deps, model: new FakeModel() }, toEdit.message, toEdit.record)
    time.advance(20 * 60_000)
    const draft = await latestDraft(db, first.id)
    if (!draft) throw new Error("no draft")
    await approve(deps, clinician, draft.id, contentHash(draft.text))
    const other = await latestDraft(db, second.id)
    if (!other) throw new Error("no draft")
    await discard(deps, clinician, other.id, "Not right for her")
    const mine = await edit(
      deps,
      clinician,
      second.id,
      "Hi {first_name}, please book a visit so we can talk about this.",
    )
    time.advance(20 * 60_000)
    await approve(deps, clinician, mine.id, contentHash(mine.text))

    expect(await reviewReport(db)).toEqual({
      sent: 2,
      asDrafted: 1,
      edited: 1,
      discardedDrafts: 1,
      medianMinutesToApproval: 30,
    })
  })
})
