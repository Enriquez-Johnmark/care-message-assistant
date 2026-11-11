import { describe, expect, it } from "vitest"

import { check, readingGrade, type Check } from "../src/core/checks.ts"
import type { RecordFacts } from "../src/fhir/reader.ts"

const facts: RecordFacts = {
  conditions: [{ name: "hypertension", since: "2019-01-01" }],
  medications: [
    { name: "lisinopril", dose: "10 mg", frequency: "once a day" },
    { name: "metformin", dose: "500 mg", frequency: "twice a day" },
  ],
  allergies: [{ substance: "penicillin", reaction: "rash" }],
  observations: [
    { name: "Systolic blood pressure", value: 142, unit: "mmHg", date: "2026-10-01", high: 130 },
  ],
  appointments: [{ start: "2026-11-24T09:30:00-08:00", kind: "follow-up visit", with: "Dr. Example Lee" }],
}
const message = "My pressure was 142 at home. Is that ok on my lisinopril?"
const GOOD =
  "Hi {first_name}, thank you for writing. A reading of 142 is a little above the goal your care team set. " +
  "Please keep taking your lisinopril as prescribed and bring your home readings to your visit on November 24. " +
  "If you have a bad headache, call us."

const failed = (draft: string): Check[] => [
  ...new Set(check(draft, { facts, message }).problems.map((p) => p.check)),
]

describe("d checks on every draft", () => {
  it("d7 a good draft passes every check", () => {
    expect(check(GOOD, { facts, message }).problems).toEqual([])
  })

  it.each([
    "It sounds like you have an ear infection.",
    "You have high blood pressure that is not controlled.",
    "This is most likely the flu.",
    "Your symptoms are consistent with pneumonia.",
    "I would diagnose this as a sprain.",
  ])("d1 a draft that diagnoses is blocked: %s", (extra) => {
    expect(failed(`${GOOD} ${extra}`)).toContain("diagnosis")
  })

  it.each([
    "Please stop taking your metformin.",
    "You can increase your lisinopril dose.",
    "Take two tablets instead of one.",
    "Skip your evening dose for now.",
    "Cut back on your metformin until the visit.",
    "Start taking it at night instead.",
  ])("d2 a draft that changes a medicine or dose is blocked: %s", (extra) => {
    expect(failed(`${GOOD} ${extra}`)).toContain("medicine-change")
  })

  it("d2 telling the patient to keep taking a medicine, or not to stop it, passes", () => {
    expect(failed(`${GOOD} Please don't stop your lisinopril on your own.`)).toEqual([])
  })

  it("d3 a draft naming a medicine not in the record is blocked, one in the record passes", () => {
    expect(failed(`${GOOD} You can take ibuprofen for the headache.`)).toContain("medicine-not-in-record")
    expect(failed(`${GOOD} Keep taking your metformin with food.`)).not.toContain("medicine-not-in-record")
  })

  it.each([
    "Your next reading should be under 120.",
    "We can see you on Thursday.",
    "Please come in on December 3.",
    "Take it at 8 pm.",
  ])("d4 a number or date not in the message or the record is blocked: %s", (extra) => {
    expect(failed(`${GOOD} ${extra}`)).toContain("number-or-date")
  })

  it.each([
    "We will call you back today.",
    "A nurse will get back to you within 24 hours.",
    "This will clear up in a few days.",
    "I promise everything will be fine.",
    "There is nothing to worry about.",
  ])("d5 a draft that promises is blocked: %s", (extra) => {
    expect(failed(`${GOOD} ${extra}`)).toContain("promise")
  })

  it("d6 a draft over 150 words, or above 8th grade, is blocked", () => {
    const long = `${GOOD} ${"Please keep a note of how you feel. ".repeat(20)}`
    const hard =
      "Hi {first_name}, considering your antihypertensive regimen, physiological variability necessitates " +
      "comprehensive longitudinal documentation of ambulatory measurements."

    expect(failed(long)).toContain("length")
    expect(readingGrade(hard)).toBeGreaterThan(8)
    expect(failed(hard)).toContain("reading-level")
  })

  it("d6 a fill-in not on the list, or a missing {first_name}, is blocked", () => {
    expect(failed(GOOD.replace("{first_name}", "{full_name}"))).toContain("fill-ins")
    expect(failed(GOOD.replace("{first_name}", "there"))).toContain("fill-ins")
    expect(failed(`${GOOD} {first_name`)).toContain("fill-ins")
  })

  it("d7 every problem names its check and what it found", () => {
    const problems = check(`${GOOD} Stop taking your metformin. You can take ibuprofen.`, {
      facts,
      message,
    }).problems

    expect(problems.find((p) => p.check === "medicine-change")?.found).toContain("stop taking")
    expect(problems).toContainEqual({ check: "medicine-not-in-record", found: "ibuprofen" })
  })
})

describe("d4 times", () => {
  it("d4 an appointment's time may be given whole, but its parts are not numbers to reuse", () => {
    expect(failed(`${GOOD} Your visit is at 9:30.`)).toEqual([])
    expect(failed(`${GOOD} Walk for 30 minutes a day.`)).toContain("number-or-date")
    expect(failed(`${GOOD} Come at 10:15.`)).toContain("number-or-date")
  })
})

describe("d checks, after the code review", () => {
  it("d4 a time with am or pm attached is read whole", () => {
    expect(failed(`${GOOD} Your visit is at 9:30am.`)).toEqual([])
    expect(failed(`${GOOD} Your visit is at 11:12am.`)).toContain("number-or-date")
  })

  it("d2 a real change after a negated one is still caught", () => {
    expect(failed(`${GOOD} Don't stop it start metformin today`)).toContain("medicine-change")
  })

  it("d1 ordinary sentences are not diagnoses", () => {
    expect(failed(`${GOOD} That sounds like a good plan.`)).toEqual([])
    expect(failed(`${GOOD} It looks like the clinic can help.`)).toEqual([])
    expect(failed(`${GOOD} You have a flu shot booked at your visit.`)).toEqual([])
  })

  it("d2 ordinary sentences are not medicine changes", () => {
    expect(failed(`${GOOD} Please start by telling us how it feels.`)).toEqual([])
    expect(failed(`${GOOD} Take another look at the leaflet.`)).toEqual([])
  })

  it("d5 callback promises in other words are caught", () => {
    expect(failed(`${GOOD} We will be calling you.`)).toContain("promise")
    expect(failed(`${GOOD} We'll give you a call.`)).toContain("promise")
  })

  it("d4 a date word is allowed only if the message used that word, not inside another word", () => {
    const said = "I may be late, this weekend is busy."
    const draft = `${GOOD} We can talk this week.`
    expect(check(draft, { facts, message: said }).problems.map((p) => p.check)).toContain("number-or-date")
  })
})

describe("d checks, after Claude's recorded drafts", () => {
  const kidney: RecordFacts = {
    ...facts,
    observations: [{ name: "eGFR", value: 52, unit: "mL/min/1.73m2", date: "2026-10-01", low: 60 }],
  }

  it("d4 a number that is part of a result's own unit is in the record", () => {
    const draft = "Hi {first_name}, your eGFR was 52 mL/min/1.73m2, below the lab's low end of 60."
    expect(check(draft, { facts: kidney, message: "" }).problems).toEqual([])
  })

  it("d5 passing a question on is not a promise that something will pass", () => {
    expect(failed(`${GOOD} I will pass your question on to your clinician.`)).toEqual([])
    expect(failed(`${GOOD} The rash will pass in a day or two.`)).toContain("promise")
  })

  it("d2 saying the clinic can't say whether to start a medicine is not telling them to", () => {
    expect(failed(`${GOOD} I can't say whether you should start a medicine.`)).toEqual([])
    expect(failed(`${GOOD} You should start a medicine for this.`)).toContain("medicine-change")
  })
})
