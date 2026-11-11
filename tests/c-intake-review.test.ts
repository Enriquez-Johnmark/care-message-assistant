import { describe, expect, it } from "vitest"

import { check } from "../src/core/checks.ts"
import { redact } from "../src/core/redact.ts"
import { changeGuidance, currentGuidance } from "../src/guidance.ts"
import { takeIn } from "../src/intake.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord, noCallsAllowed } from "./support/fixtures.ts"

describe("after the M3 code review", () => {
  it("b2 an emergency named only in the subject is flagged", async () => {
    const db = await freshDb()
    const { message, record } = messageAndRecord("m01")
    const subjectOnly = {
      ...message,
      subject: "Chest pain and I can't breathe",
      text: "see subject, what do I do?",
    }

    const taken = await takeIn({ db, clock: clock(), model: noCallsAllowed }, subjectOnly, record)

    expect(taken.outcome).toBe("flagged")
  })

  it("c1 a message saved before a crash is taken in again, not left with nothing", async () => {
    const db = await freshDb()
    const { message, record } = messageAndRecord("m01")
    const crashing = { name: "crashing", ask: () => Promise.reject(new Error("the process died")) }
    // As if the process died while the model was asked: the message is saved, nothing else.
    await takeIn({ db, clock: clock(), model: crashing }, message, record)
    await db.query("update messages set needs_person = null")
    await db.query("delete from model_calls")

    const again = await takeIn({ db, clock: clock(), model: new FakeModel() }, message, record)

    expect(again.outcome).toBe("drafted")
  })

  it("a2 a phone number stored with a country code is still taken out when written without it", () => {
    const person = {
      fhirId: "x",
      given: "Mary-Jane",
      family: "O'Brien",
      birthDate: "1950-02-03",
      email: "mj@example.test",
      phone: "+1 555-010-0123",
      address: "1 Example Street",
    }

    expect(redact("Mary Jane OBrien, Mary, O'Brien, born Feb 3, 1950, call 555-010-0123", person)).toBe(
      "[name] [name] [name], [name], [name], born [date of birth], call [phone]",
    )
  })

  it("c4 guidance changes never collide, and empty guidance is refused", async () => {
    const db = await freshDb()
    const before = await currentGuidance(db, clock())

    const both = await Promise.all([
      changeGuidance(db, "Version A.", "a@clinic.example.test", clock()),
      changeGuidance(db, "Version B.", "b@clinic.example.test", clock()),
    ])

    expect(both.map((g) => g.version).sort()).toEqual([before.version + 1, before.version + 2])
    await expect(changeGuidance(db, "   ", "a@clinic.example.test", clock())).rejects.toThrow("empty")
    const logged = await db.query(
      "select action from audit_events where action like 'guidance.%' order by id",
    )
    expect(logged.rows.map((r: { action: string }) => r.action)).toEqual([
      "guidance.installed",
      "guidance.changed",
      "guidance.changed",
    ])
  })

  it("d4 the emergency lines are allowed in the clinic's own words, never in a model's draft", () => {
    const { record } = messageAndRecord("m01")
    const draft = "Hi {first_name}, if this gets worse call 911."

    expect(check(draft, { facts: record.facts, message: "" }).problems.map((p) => p.check)).toContain(
      "number-or-date",
    )
    expect(check(draft, { facts: record.facts, message: "", emergencyLines: true }).problems).toEqual([])
  })
})
