import { describe, expect, it } from "vitest"

import { takeIn } from "../src/intake.ts"
import { api, call, logIn } from "./support/api.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

interface Detail {
  draft: { id: string; contentHash: string; text: string } | null
  status: string
}

describe("e review through the API", () => {
  it("e1 the front desk can't approve a clinical reply; a clinician can, once; a stale hash is refused", async () => {
    const db = await freshDb()
    const { clinician, frontDesk } = await addStaff(db)
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ db, clock: clock(), model: new FakeModel() }, message, record)
    const { app, mail } = api(db, clock())
    const desk = await logIn(app, mail, frontDesk.email)
    const doctor = await logIn(app, mail, clinician.email)

    const detail = (await call(app, "GET", `/api/messages/${taken.id}`, { cookie: doctor })).body as Detail
    const draft = detail.draft
    if (!draft) throw new Error("no draft")
    const byDesk = await call(app, "POST", `/api/drafts/${draft.id}/approve`, {
      cookie: desk,
      body: { contentHash: draft.contentHash },
    })
    const stale = await call(app, "POST", `/api/drafts/${draft.id}/approve`, {
      cookie: doctor,
      body: { contentHash: "0".repeat(64) },
    })
    const ok = await call(app, "POST", `/api/drafts/${draft.id}/approve`, {
      cookie: doctor,
      body: { contentHash: draft.contentHash },
    })
    const twice = await call(app, "POST", `/api/drafts/${draft.id}/approve`, {
      cookie: doctor,
      body: { contentHash: draft.contentHash },
    })

    expect([byDesk.status, stale.status, ok.status, twice.status]).toEqual([403, 409, 200, 409])
    const after = (await call(app, "GET", `/api/messages/${taken.id}`, { cookie: doctor })).body as Detail
    expect(after.status).toBe("answered")
  })

  it("e3 an edit through the API comes back with what the checks found", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ db, clock: clock(), model: new FakeModel() }, message, record)
    const { app, mail } = api(db, clock())
    const doctor = await logIn(app, mail, clinician.email)

    const edited = await call(app, "POST", `/api/messages/${taken.id}/edit`, {
      cookie: doctor,
      body: { text: "Hi {first_name}, it sounds like you have an ulcer." },
    })

    expect(edited.status).toBe(200)
    expect((edited.body as { problems: { check: string }[] }).problems.map((p) => p.check)).toContain(
      "diagnosis",
    )
  })
})
