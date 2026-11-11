import { describe, expect, it } from "vitest"

import { takeIn } from "../src/intake.ts"
import { api, call, logIn } from "./support/api.ts"
import { freshDb } from "./support/db.ts"
import { clock, messageAndRecord } from "./support/fixtures.ts"
import { addStaff } from "./support/staff.ts"

describe("h1 logins", () => {
  it("h1 staff log in with an emailed link that works once, for 15 minutes", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const time = clock()
    const { app, mail } = api(db, time)

    const cookie = await logIn(app, mail, clinician.email)
    const me = await call(app, "GET", "/api/me", { cookie })
    const token = mail.linkFor(clinician.email)?.split("/login/")[1] ?? ""
    const again = await call(app, "POST", `/api/login/${token}`)
    await call(app, "POST", "/api/login", { body: { email: clinician.email } })
    time.advance(16 * 60_000)
    const late = await call(
      app,
      "POST",
      `/api/login/${mail.linkFor(clinician.email)?.split("/login/")[1] ?? ""}`,
    )

    expect(me.body).toMatchObject({ who: "staff", role: "clinician", name: "Dr. Example Lee" })
    expect(again.status).toBe(410)
    expect(late.status).toBe(410)
  })

  it("h1 asking for a link never says whether the address is registered", async () => {
    const db = await freshDb()
    const { app, mail } = api(db, clock())

    const unknown = await call(app, "POST", "/api/login", { body: { email: "nobody@example.test" } })

    expect(unknown.status).toBe(204)
    expect(mail.sent).toEqual([])
  })

  it("h1 every staff API needs a staff login, and every portal API a patient login", async () => {
    const db = await freshDb()
    const { clinician } = await addStaff(db)
    const { message, record } = messageAndRecord("m01")
    await takeIn({ db, clock: clock(), model: null }, message, record)
    const { app, mail } = api(db, clock())
    const staffCookie = await logIn(app, mail, clinician.email)
    const patientCookie = await logIn(app, mail, record.person.email)

    for (const url of ["/api/queue", "/api/guidance"]) {
      expect((await call(app, "GET", url)).status, url).toBe(401)
      expect((await call(app, "GET", url, { cookie: patientCookie })).status, url).toBe(401)
      expect((await call(app, "GET", url, { cookie: staffCookie })).status, url).toBe(200)
    }
    expect((await call(app, "GET", "/api/portal/messages")).status).toBe(401)
    expect((await call(app, "GET", "/api/portal/messages", { cookie: staffCookie })).status).toBe(401)
    expect((await call(app, "GET", "/api/portal/messages", { cookie: patientCookie })).status).toBe(200)
    expect((await call(app, "GET", "/api/activity", { cookie: staffCookie })).status).toBe(403)
  })

  it("h1 a post from another site is refused", async () => {
    const db = await freshDb()
    const { app } = api(db, clock())

    const forged = await call(app, "POST", "/api/login", {
      body: { email: "x@example.test" },
      origin: "https://evil.example",
    })

    expect(forged.status).toBe(403)
  })
})
