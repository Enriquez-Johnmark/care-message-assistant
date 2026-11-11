import { describe, expect, it } from "vitest"

import { demoMessages, demoPatients } from "../src/demo.ts"
import { messageResource, patientResources } from "../src/fhir/build.ts"
import { TEST_DATA } from "../src/made-up.ts"

describe("a1 the made-up data", () => {
  it("a1 has 20 patients and 80 labelled messages, every message from one of them", () => {
    const patients = demoPatients()
    const messages = demoMessages()
    const ids = new Set(patients.map((p) => p.id))

    expect(patients).toHaveLength(20)
    expect(messages).toHaveLength(80)
    expect(messages.every((m) => ids.has(m.patient))).toBe(true)
    expect(messages.filter((m) => m.redFlag).length).toBeGreaterThanOrEqual(15)
    expect(messages.filter((m) => m.tricky !== null).length).toBeGreaterThanOrEqual(10)
    expect(messages.filter((m) => m.demo)).toHaveLength(30)
  })

  it("a1 is the same every time, and every FHIR resource is marked as test data", () => {
    const build = () => [...demoPatients().flatMap(patientResources), ...demoMessages().map(messageResource)]
    const resources = build()

    expect(JSON.stringify(build())).toBe(JSON.stringify(resources))
    for (const resource of resources) {
      expect((resource["meta"] as { security: unknown[] }).security, resource.id).toContainEqual(TEST_DATA)
    }
  })
})
