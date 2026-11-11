import { describe, expect, it } from "vitest"

import { CLINIC_PHONE } from "../src/clinic.ts"
import { FhirServer } from "../src/fhir/client.ts"
import { REPLY_ID } from "../src/fhir/build.ts"
import { takeIn } from "../src/intake.ts"
import { approve, contentHash, edit, latestDraft, ReviewError } from "../src/review.ts"
import { writeReplies } from "../src/sending.ts"
import { api, call, logIn } from "./support/api.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

const FHIR_URL = process.env["FHIR_URL"] ?? "http://127.0.0.1:8090/fhir"

interface PortalRow {
  subject: string
  reply: { text: string } | null
}

describe("f sending", () => {
  it("f1 nothing reaches the portal without an approval", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ db, clock: clock(), model: new FakeModel() }, message, record)
    const { app, mail } = api(db, clock())
    const patient = await logIn(app, mail, record.person.email)

    const before = (await call(app, "GET", "/api/portal/messages", { cookie: patient })).body as PortalRow[]
    const draft = await latestDraft(db, taken.id)
    if (!draft) throw new Error("no draft")
    await approve({ db, clock: clock() }, clinician, draft.id, contentHash(draft.text))
    const after = (await call(app, "GET", "/api/portal/messages", { cookie: patient })).body as PortalRow[]

    expect(before.map((m) => m.reply)).toEqual([null])
    expect(after[0]?.reply?.text).toContain("Hi Maria,")
  })

  it("f2 a reply is sent once, even when approved twice at the same moment", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ db, clock: clock(), model: new FakeModel() }, message, record)
    const draft = await latestDraft(db, taken.id)
    if (!draft) throw new Error("no draft")

    const both = await Promise.allSettled([
      approve({ db, clock: clock() }, clinician, draft.id, contentHash(draft.text)),
      approve({ db, clock: clock() }, clinician, draft.id, contentHash(draft.text)),
    ])

    expect(both.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"])
    const rejected = both.find((r) => r.status === "rejected")
    expect(rejected?.status === "rejected" && rejected.reason instanceof ReviewError).toBe(true)
    expect((await db.query("select count(*)::int as n from replies")).rows[0]).toEqual({ n: 1 })
  })

  it("f3 code adds the disclosure: drafted with AI, written by the clinician, or sent by the front desk", async () => {
    const db = await freshDb()
    const { clinician, frontDesk } = await addStaff(db)
    const deps = { db, clock: clock() }
    const sentText = async (id: string) =>
      (await db.query<{ text: string }>("select text from replies where message_id = $1", [id])).rows[0]
        ?.text ?? ""

    const drafted = messageAndRecord("m01")
    const a = await takeIn({ ...deps, model: new FakeModel() }, drafted.message, drafted.record)
    const draftA = await latestDraft(db, a.id)
    if (!draftA) throw new Error("no draft")
    await approve(deps, clinician, draftA.id, contentHash(draftA.text))

    const written = messageAndRecord("m06")
    const b = await takeIn({ ...deps, model: null }, written.message, written.record)
    const mine = await edit(
      deps,
      clinician,
      b.id,
      "Hi {first_name}, please book a visit so we can talk about this.",
    )
    await approve(deps, clinician, mine.id, contentHash(mine.text))

    const admin = messageAndRecord("m57")
    const c = await takeIn(
      { ...deps, model: new FakeModel({ type: "admin", urgency: "routine" }) },
      admin.message,
      admin.record,
    )
    const template = await latestDraft(db, c.id)
    if (!template) throw new Error("no draft")
    await approve(deps, frontDesk, template.id, contentHash(template.text))

    expect(await sentText(a.id)).toContain(
      `This reply was drafted with the help of AI and reviewed and approved by Dr. Example Lee. To reach a person, call ${CLINIC_PHONE}.`,
    )
    expect(await sentText(b.id)).toContain("This reply was written and approved by Dr. Example Lee.")
    expect(await sentText(c.id)).toContain("This reply was sent by the front desk.")
    expect(await sentText(a.id)).not.toContain("{first_name}")
  })

  it("f4 the sent reply is written to the FHIR server once, as a Communication answering the message", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const deps = { db, clock: clock() }
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ ...deps, model: new FakeModel() }, message, record)
    const draft = await latestDraft(db, taken.id)
    if (!draft) throw new Error("no draft")
    const { replyId } = await approve(deps, clinician, draft.id, contentHash(draft.text))
    const fhir = new FhirServer(FHIR_URL)

    expect(await writeReplies(deps, fhir)).toBe(1)
    // A crash before it was marked written: writing again makes no second one.
    await db.query("update replies set fhir_written_at = null")
    expect(await writeReplies(deps, fhir)).toBe(1)

    const found = (await fhir.search(
      `Communication?identifier=${encodeURIComponent(`${REPLY_ID}|${replyId}`)}`,
    )) as {
      inResponseTo?: { reference: string }[]
      payload?: { contentString: string }[]
    }[]
    expect(found).toHaveLength(1)
    expect(found[0]?.inResponseTo?.[0]?.reference).toBe(`Communication/${message.fhirId}`)
    expect(found[0]?.payload?.[0]?.contentString).toContain("Hi Maria,")
  }, 60_000)
})

describe("a4 the portal", () => {
  it("a4 a patient sees only their own messages and replies", async () => {
    const db = await freshDb()
    const maria = messageAndRecord("m01")
    const other = messageAndRecord("m02")
    await takeIn({ db, clock: clock(), model: new FakeModel() }, maria.message, maria.record)
    await takeIn({ db, clock: clock(), model: null }, other.message, other.record)
    const { app, mail } = api(db, clock())

    const cookie = await logIn(app, mail, maria.record.person.email)
    const mine = (await call(app, "GET", "/api/portal/messages", { cookie })).body as PortalRow[]

    expect(mine.map((m) => m.subject)).toEqual([maria.message.subject])
  })
})
