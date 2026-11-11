import { describe, expect, it } from "vitest"

import { approve, contentHash, discard, edit, latestDraft, ReviewError } from "../src/review.ts"
import { queue } from "../src/queue.ts"
import { takeIn } from "../src/intake.ts"
import type { Db } from "../src/store/db.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord, noCallsAllowed } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

async function received(db: Db, key: string, model = new FakeModel()) {
  const { message, record } = messageAndRecord(key)
  const taken = await takeIn({ db, clock: clock(), model }, message, record)
  const draft = await latestDraft(db, taken.id)
  if (!draft) throw new Error(`no draft for ${key}`)
  return { id: taken.id, draft }
}

const deps = (db: Db) => ({ db, clock: clock() })

describe("e review", () => {
  it("e1 only a clinician can approve a clinical reply; the front desk and the administrator are refused", async () => {
    const db = await freshDb()
    const { clinician, frontDesk, admin } = await addStaff(db)
    const { draft } = await received(db, "m01")

    for (const who of [frontDesk, admin]) {
      await expect(approve(deps(db), who, draft.id, contentHash(draft.text))).rejects.toThrow(ReviewError)
    }
    await approve(deps(db), clinician, draft.id, contentHash(draft.text))
  })

  it("e1 the front desk can approve an admin template", async () => {
    const db = await freshDb()
    const { frontDesk } = await addStaff(db)
    const { draft } = await received(db, "m57", new FakeModel({ type: "admin", urgency: "routine" }))

    await approve(deps(db), frontDesk, draft.id, contentHash(draft.text))
  })

  it("e2 an approval binds the exact text: a hash of other text, or a draft that isn't the latest, is refused", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { id, draft } = await received(db, "m01")

    await expect(approve(deps(db), clinician, draft.id, contentHash(`${draft.text} `))).rejects.toThrow(
      "changed",
    )
    await edit(deps(db), clinician, id, "Hi {first_name}, your care team has your message.")
    await expect(approve(deps(db), clinician, draft.id, contentHash(draft.text))).rejects.toThrow("changed")
  })

  it("e2 a draft that failed a check can't be approved", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { draft } = await received(
      db,
      "m01",
      new FakeModel(undefined, "Hi {first_name}, stop taking your metformin."),
    )

    await expect(approve(deps(db), clinician, draft.id, contentHash(draft.text))).rejects.toThrow("check")
  })

  it("e3 a clinician's edit is checked like any draft, and a blocked edit can't be approved", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { id } = await received(db, "m01")

    const edited = await edit(deps(db), clinician, id, "Hi {first_name}, you can double your metformin.")

    expect(edited.problems.map((p) => p.check)).toContain("medicine-change")
    await expect(approve(deps(db), clinician, edited.id, contentHash(edited.text))).rejects.toThrow("check")
  })

  it("e3 a reply written by hand, with no model at all, is checked and can be approved", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ db, clock: clock(), model: null }, message, record)

    const written = await edit(
      deps(db),
      clinician,
      taken.id,
      "Hi {first_name}, thank you. Please book a visit to talk about this.",
    )

    expect(written.problems).toEqual([])
    await approve(deps(db), clinician, written.id, contentHash(written.text))
  })

  it("e4 discarding a draft needs a reason, and the message stays open", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { id, draft } = await received(db, "m01")

    await expect(discard(deps(db), clinician, draft.id, "  ")).rejects.toThrow("reason")
    await discard(deps(db), clinician, draft.id, "Too vague; I'll call her.")

    expect(await latestDraft(db, id)).toBeUndefined()
    const status = (await db.query<{ status: string }>("select status from messages where id = $1", [id]))
      .rows[0]
    expect(status?.status).toBe("open")
  })

  it("b3 a flagged message is first in the queue, with the urgent reply ready and no AI draft", async () => {
    const db = await freshDb()
    await received(db, "m01")
    await received(db, "m06", new FakeModel({ type: "medication", urgency: "soon" }))
    const flagged = await received(db, "m02", noCallsAllowed as unknown as FakeModel)

    const rows = await queue(db)

    expect(rows.map((r) => r.urgency)).toEqual(["urgent", "soon", "routine"])
    expect(rows[0]?.id).toBe(flagged.id)
    expect(rows[0]?.draftSource).toBe("urgent-template")
  })
})
