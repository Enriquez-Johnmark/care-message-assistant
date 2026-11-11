import { describe, expect, it } from "vitest"

import { changeGuidance, currentGuidance } from "../src/guidance.ts"
import { takeIn } from "../src/intake.ts"
import { freshDb } from "./support/db.ts"
import { clock, FakeModel, messageAndRecord, noCallsAllowed } from "./support/fixtures.ts"

async function drafts(db: Awaited<ReturnType<typeof freshDb>>, id: string) {
  return (
    await db.query<{ source: string; model: string | null; guidance_version: number | null; text: string }>(
      "select source, model, guidance_version, text from drafts where message_id = $1 order by attempt",
      [id],
    )
  ).rows
}

describe("b2 and b4: red flags come before the model", () => {
  it("b2 a flagged message never reaches the model, has no AI draft and gets the clinic's urgent reply", async () => {
    const db = await freshDb()
    const { message, record } = messageAndRecord("m02")

    const taken = await takeIn({ db, clock: clock(), model: noCallsAllowed }, message, record)

    expect(taken.outcome).toBe("flagged")
    const row = (
      await db.query<{ urgency: string }>("select urgency from messages where id = $1", [taken.id])
    ).rows[0]
    expect(row).toMatchObject({ urgency: "urgent" })
    expect(await drafts(db, taken.id)).toEqual([
      expect.objectContaining({ source: "urgent-template", model: null }),
    ])
    expect((await db.query("select count(*)::int as n from model_calls")).rows[0]).toEqual({ n: 0 })
  })

  it("b4 the model may raise a message to 'soon' but nothing it says makes a message urgent or less than flagged", async () => {
    const db = await freshDb()
    const soon = await takeIn(
      { db, clock: clock(), model: new FakeModel({ type: "symptom", urgency: "soon" }) },
      ...pair("m01"),
    )
    const flagged = await takeIn(
      { db, clock: clock(), model: new FakeModel({ type: "admin", urgency: "routine" }) },
      ...pair("m02"),
    )

    const urgency = async (id: string) =>
      (await db.query<{ urgency: string }>("select urgency from messages where id = $1", [id])).rows[0]
        ?.urgency
    expect(await urgency(soon.id)).toBe("soon")
    expect(await urgency(flagged.id)).toBe("urgent")
  })
})

function pair(key: string) {
  const { message, record } = messageAndRecord(key)
  return [message, record] as const
}

describe("c sorting and drafting", () => {
  it("c1 an answer that doesn't parse leaves the message for a person, with no draft", async () => {
    const db = await freshDb()
    const taken = await takeIn({ db, clock: clock(), model: new FakeModel("broken") }, ...pair("m01"))

    expect(taken.outcome).toBe("needs-person")
    expect(await drafts(db, taken.id)).toEqual([])
  })

  it("c2 an admin message is answered from the clinic's template; the model never drafts it", async () => {
    const db = await freshDb()
    const model = new FakeModel({ type: "admin", urgency: "routine" })

    const taken = await takeIn({ db, clock: clock(), model }, ...pair("m57"))

    expect(model.asked.map((q) => q.purpose)).toEqual(["sort"])
    expect(await drafts(db, taken.id)).toEqual([expect.objectContaining({ source: "template", model: null })])
  })

  it("c3 a draft records the model and the guidance version it was written with", async () => {
    const db = await freshDb()
    const model = new FakeModel()

    const taken = await takeIn({ db, clock: clock(), model }, ...pair("m01"))

    const guidance = await currentGuidance(db, clock())
    expect(await drafts(db, taken.id)).toEqual([
      expect.objectContaining({ source: "model", model: "claude-test", guidance_version: guidance.version }),
    ])
    expect(model.asked[1]?.system).toContain(guidance.text)
  })

  it("c4 changing the guidance makes a new version; earlier drafts keep the version they used", async () => {
    const db = await freshDb()
    const first = await takeIn({ db, clock: clock(), model: new FakeModel() }, ...pair("m01"))
    const before = await currentGuidance(db, clock())

    const after = await changeGuidance(
      db,
      "Reply in two short paragraphs.",
      "admin@clinic.example.test",
      clock(),
    )
    const second = await takeIn({ db, clock: clock(), model: new FakeModel() }, ...pair("m06"))

    expect(after.version).toBe(before.version + 1)
    expect((await drafts(db, first.id))[0]?.guidance_version).toBe(before.version)
    expect((await drafts(db, second.id))[0]?.guidance_version).toBe(after.version)
  })

  it("c5 with no model nothing is drafted, and the message waits for a clinician to write a reply", async () => {
    const db = await freshDb()

    const taken = await takeIn({ db, clock: clock(), model: null }, ...pair("m01"))

    expect(taken.outcome).toBe("needs-person")
    expect(await drafts(db, taken.id)).toEqual([])
  })

  it("c1 taking in the same message again adds nothing", async () => {
    const db = await freshDb()
    const first = await takeIn({ db, clock: clock(), model: new FakeModel() }, ...pair("m01"))
    const again = await takeIn({ db, clock: clock(), model: new FakeModel() }, ...pair("m01"))

    expect(again).toEqual({ id: first.id, outcome: "already-here" })
    expect((await db.query("select count(*)::int as n from drafts")).rows[0]).toEqual({ n: 1 })
  })
})

describe("c2 the clinic's templates", () => {
  it("c2 the urgent and the admin reply pass every check for every patient", async () => {
    const { check } = await import("../src/core/checks.ts")
    const { ADMIN_REPLY, URGENT_REPLY } = await import("../src/templates.ts")
    const { clinic } = await import("./support/fixtures.ts")
    for (const { message, record } of clinic().messages.flatMap((m) => {
      const record = clinic().records.find((r) => r.person.fhirId === m.patientFhirId)
      return record ? [{ message: m, record }] : []
    })) {
      for (const template of [URGENT_REPLY, ADMIN_REPLY]) {
        expect(
          check(template, { facts: record.facts, message: message.text, emergencyLines: true }).problems,
          message.key,
        ).toEqual([])
      }
    }
  })
})
