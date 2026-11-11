import { describe, expect, it } from "vitest"

import { check } from "../src/core/checks.ts"
import { fetchAndTakeIn } from "../src/fetch.ts"
import { FhirServer } from "../src/fhir/client.ts"
import { takeIn } from "../src/intake.ts"
import { edit, latestDraft, ReviewError } from "../src/review.ts"
import { api, call, logIn } from "./support/api.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord, GOOD_REPLY } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

const FHIR_URL = process.env["FHIR_URL"] ?? "http://127.0.0.1:8090/fhir"

describe("after the M4–M6 code review", () => {
  it("e1 the front desk can't rewrite the admin template into any text of its own", async () => {
    const db = await freshDb()
    const { frontDesk } = await addStaff(db)
    const { message, record } = messageAndRecord("m57")
    const taken = await takeIn(
      { db, clock: clock(), model: new FakeModel({ type: "admin", urgency: "routine" }) },
      message,
      record,
    )

    await expect(
      edit(
        { db, clock: clock() },
        frontDesk,
        taken.id,
        "Hi {first_name}, your potassium is fine, keep taking your lisinopril.",
      ),
    ).rejects.toThrow(ReviewError)
    expect((await latestDraft(db, taken.id))?.source).toBe("template")
  })

  it("c1 two fetches at once take each message in once", async () => {
    const db = await freshDb()
    const model = new FakeModel()
    const fhir = new FhirServer(FHIR_URL)

    await Promise.all([
      fetchAndTakeIn({ db, clock: clock(), model }, fhir),
      fetchAndTakeIn({ db, clock: clock(), model }, fhir),
    ])

    const counts = (
      await db.query<{ n: number }>(
        "select count(*)::int as n from drafts group by message_id having count(*) > 1",
      )
    ).rows
    expect(counts).toEqual([])
  }, 120_000)

  it("d5 passing a question on, by anyone, is not a promise; something passing is", () => {
    const { record } = messageAndRecord("m01")
    const promise = (text: string) =>
      check(`${GOOD_REPLY} ${text}`, { facts: record.facts, message: "" }).problems.map((p) => p.check)
    expect(promise("Your clinician will pass this along.")).not.toContain("promise")
    expect(promise("The nurse will pass your question on.")).not.toContain("promise")
    expect(promise("The pain will pass soon.")).toContain("promise")
  })

  it("h1 a session whose staff member is gone is told to log in, not given an error", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { app, mail } = api(db, clock())
    const cookie = await logIn(app, mail, clinician.email)
    await db.query("delete from staff where id = $1", [clinician.id])

    expect((await call(app, "GET", "/api/queue", { cookie })).status).toBe(401)
  })

  it("h1 a mail failure never shows whether an address is registered", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { server } = await import("../src/api/server.ts")
    const failing = { send: () => Promise.reject(new Error("mail is down")) }
    const app = server({
      db,
      clock: clock(),
      mailer: failing,
      model: null,
      fhir: null,
      baseUrl: "http://care.example.test",
    })

    const known = await call(app, "POST", "/api/login", { body: { email: clinician.email } })
    const unknown = await call(app, "POST", "/api/login", { body: { email: "nobody@example.test" } })

    expect([known.status, unknown.status]).toEqual([204, 204])
  })

  it("g3 a login is logged under the person's email, so the log's person filter finds it", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { app, mail } = api(db, clock())
    await logIn(app, mail, clinician.email)

    const logins = await db.query<{ actor: string }>("select actor from audit_events where action = 'login'")
    expect(logins.rows).toEqual([{ actor: clinician.email }])
  })
})

describe("f4 a FHIR write that keeps failing", () => {
  it("f4 waits longer each time and stops after ten tries", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const time = clock()
    const deps = { db, clock: time }
    const { message, record } = messageAndRecord("m01")
    const taken = await takeIn({ ...deps, model: new FakeModel() }, message, record)
    const draft = await latestDraft(db, taken.id)
    if (!draft) throw new Error("no draft")
    const { approve, contentHash } = await import("../src/review.ts")
    const { writeReplies } = await import("../src/sending.ts")
    await approve(deps, clinician, draft.id, contentHash(draft.text))
    const down = new FhirServer("http://127.0.0.1:9/fhir")

    await writeReplies(deps, down)
    const soon = await writeReplies(deps, down)
    const tries = async () =>
      (await db.query<{ fhir_attempts: number }>("select fhir_attempts from replies")).rows[0]?.fhir_attempts
    expect([await tries(), soon]).toEqual([1, 0])
    for (let i = 0; i < 20; i++) {
      time.advance(3 * 3_600_000)
      await writeReplies(deps, down)
    }
    expect(await tries()).toBe(10)
  }, 120_000)
})
