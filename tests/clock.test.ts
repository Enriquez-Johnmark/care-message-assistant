import { describe, expect, it } from "vitest"

import { FixedClock } from "../src/clock.ts"

describe("the clock", () => {
  it("a fixed clock stays where it is put until moved on", () => {
    const clock = new FixedClock(new Date("2026-11-10T15:00:00Z"))
    clock.advance(60_000)
    expect(clock.now().toISOString()).toBe("2026-11-10T15:01:00.000Z")
  })
})
