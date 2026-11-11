import { describe, expect, it } from "vitest"

import { clinicLog, timeline } from "../src/activity.ts"
import { changeGuidance } from "../src/guidance.ts"
import { takeIn } from "../src/intake.ts"
import { approve, contentHash, discard, edit, latestDraft } from "../src/review.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord, noCallsAllowed } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

describe("g the activity log", () => {
  it("g1 every step is logged with who and when", async () => {
    const db = await freshDb()
    const { clinician, admin } = await addStaff(db)
    const deps = { db, clock: clock() }
    const one = messageAndRecord("m01")
    const flagged = messageAndRecord("m02")
    const taken = await takeIn({ ...deps, model: new FakeModel() }, one.message, one.record)
    await takeIn({ ...deps, model: noCallsAllowed }, flagged.message, flagged.record)
    const first = await latestDraft(db, taken.id)
    if (!first) throw new Error("no draft")
    await discard(deps, clinician, first.id, "Too vague")
    const mine = await edit(
      deps,
      clinician,
      taken.id,
      "Hi {first_name}, please book a visit so we can talk about this.",
    )
    await approve(deps, clinician, mine.id, contentHash(mine.text))
    await changeGuidance(db, "Shorter replies.", admin.email, clock())

    const actions = (await clinicLog(db, {})).map((e) => e.action)

    for (const step of [
      "message.received",
      "message.flagged",
      "message.sorted",
      "draft.written",
      "draft.checked",
      "draft.discarded",
      "draft.approved",
      "reply.sent",
      "guidance.changed",
    ]) {
      expect(actions, step).toContain(step)
    }
    const log = await clinicLog(db, {})
    expect(log.every((e) => e.actor !== "" && e.at instanceof Date)).toBe(true)
  })

  it("g3 a message has its own timeline, and the whole log filters by person and by step", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const deps = { db, clock: clock() }
    const a = messageAndRecord("m01")
    const b = messageAndRecord("m06")
    const first = await takeIn({ ...deps, model: new FakeModel() }, a.message, a.record)
    await takeIn({ ...deps, model: new FakeModel() }, b.message, b.record)
    await edit(deps, clinician, first.id, "Hi {first_name}, please book a visit.")

    const own = await timeline(db, first.id)
    const byClinician = await clinicLog(db, { actor: clinician.email })
    const received = await clinicLog(db, { action: "message.received" })

    expect(own.every((e) => e.subjectId === first.id)).toBe(true)
    expect(own.map((e) => e.action)).toContain("draft.edited")
    expect(byClinician.map((e) => e.action)).toEqual(["draft.edited"])
    expect(received).toHaveLength(2)
  })
})
