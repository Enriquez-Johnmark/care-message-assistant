import { describe, expect, it } from "vitest"

import { record } from "../src/store/audit.ts"
import { freshDb } from "./support/db.ts"

describe("g2 the activity log", () => {
  it("g2 the database refuses to change or delete an entry", async () => {
    const db = await freshDb()
    await record(db, {
      at: new Date("2026-11-10T15:00:00Z"),
      actor: "x",
      action: "message.received",
      subjectType: "message",
      subjectId: "m",
    })

    await expect(db.query("update audit_events set actor = 'someone else'")).rejects.toThrow("append-only")
    await expect(db.query("delete from audit_events")).rejects.toThrow("append-only")
    await expect(db.query("truncate audit_events")).rejects.toThrow("append-only")
    expect((await db.query("select actor from audit_events")).rows).toEqual([{ actor: "x" }])
  })
})
