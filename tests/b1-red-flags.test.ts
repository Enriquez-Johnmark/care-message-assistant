import { describe, expect, it } from "vitest"

import { redFlags } from "../src/core/red-flags.ts"

const flagged = (text: string) => redFlags(text).map((f) => f.category)

describe("b1 red flags", () => {
  it.each([
    ["I've had chest pain since this morning", "chest pain"],
    ["my chest feels super tight and heavy lol probably nothing", "chest pain"],
    ["chesst painn when I walk", "chest pain"],
    ["I cant breathe rite", "trouble breathing"],
    ["Can't catch my breath even sitting down", "trouble breathing"],
    ["my husband's face is drooping on one side and his speech is slurred", "stroke signs"],
    ["I don't see the point anymore, everyone would be better off without me", "suicide or self-harm"],
    ["I have been having SUICIDAL thoughts", "suicide or self-harm"],
    ["the cut won't stop bleeding, it's soaking through towels", "severe bleeding"],
    ["my throat is swelling up after the new pill", "severe allergic reaction"],
    ["I passed out in the kitchen this morning", "fainting"],
    ["I took too many of my pills by accident", "overdose"],
    ["high fever and a really stiff neck since last night", "stiff neck with fever"],
  ])("b1 %j is flagged as %s", (text, category) => {
    expect(flagged(text)).toContain(category)
  })

  it("b1 a negated red flag is still flagged: a false alarm costs a moment, a miss can cost a life", () => {
    expect(flagged("No chest pain, just a cough for a week")).toEqual(["chest pain"])
  })

  it("b1 ordinary messages are not flagged", () => {
    for (const text of [
      "Can I get a refill of my lisinopril?",
      "What does my A1c of 7.4 mean?",
      "I need to move my appointment to next week",
      "My neck is a bit stiff from sleeping wrong",
      "I bled a little when I brushed my teeth",
    ]) {
      expect(flagged(text), text).toEqual([])
    }
  })

  it("b1 each flag says what was found", () => {
    expect(redFlags("Crushing chest pressure")[0]?.found).toMatch(/^chest pres/)
  })
})

describe("b1 on the 80 labelled messages", () => {
  it("b1 every red flag in the labelled set is flagged; the only false alarms are negated phrases", async () => {
    const { demoMessages } = await import("../src/demo.ts")
    const messages = demoMessages()

    const missed = messages.filter((m) => m.redFlag && redFlags(m.text).length === 0).map((m) => m.id)
    const falseAlarms = messages.filter((m) => !m.redFlag && redFlags(m.text).length > 0)

    expect(missed).toEqual([])
    expect(falseAlarms.map((m) => m.tricky)).toEqual(falseAlarms.map(() => "negated"))
  })
})
