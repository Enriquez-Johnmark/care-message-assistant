import { describe, expect, it } from "vitest"

import { messageResource, patientResources } from "../src/fhir/build.ts"
import { read } from "../src/fhir/reader.ts"
import type { DemoPatient } from "../src/demo.ts"

const ana: DemoPatient = {
  id: "p01",
  given: "Ana",
  family: "Example",
  birthDate: "1970-01-02",
  gender: "female",
  email: "ana@example.test",
  phone: "(555) 010-0001",
  address: "1 Example Street",
  conditions: [{ code: "hypertension", onset: "2020-01-01" }],
  medications: [{ name: "lisinopril", dose: "10 mg", frequency: "once a day" }],
  allergies: [{ substance: "penicillin", reaction: "rash" }],
  observations: [
    { name: "Systolic blood pressure", value: 142, unit: "mmHg", date: "2026-10-01", low: 90, high: 130 },
  ],
  appointments: [{ date: "2026-11-20T09:00:00-08:00", kind: "follow-up visit", with: "Dr. Example Lee" }],
}

const message = messageResource({
  id: "m01",
  patient: "p01",
  sent: "2026-11-09T10:00:00-08:00",
  subject: "My pressure",
  text: "Is 142 too high?",
  type: "test-result",
  redFlag: false,
  tricky: null,
  demo: true,
  note: "",
})

describe("h2 the strict FHIR reader", () => {
  it("h2 reads a patient's record and messages back as they were written", () => {
    const result = read([...patientResources(ana), message])

    expect(result.refused).toEqual([])
    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.person).toMatchObject({
      fhirId: "ecc-p01",
      given: "Ana",
      email: "ana@example.test",
    })
    expect(result.records[0]?.facts).toEqual({
      conditions: [{ name: "hypertension", since: "2020-01-01" }],
      medications: [{ name: "lisinopril", dose: "10 mg", frequency: "once a day" }],
      allergies: [{ substance: "penicillin", reaction: "rash" }],
      observations: [
        { name: "Systolic blood pressure", value: 142, unit: "mmHg", date: "2026-10-01", low: 90, high: 130 },
      ],
      appointments: [
        { start: "2026-11-20T09:00:00-08:00", kind: "follow-up visit", with: "Dr. Example Lee" },
      ],
    })
    expect(result.messages).toEqual([
      {
        fhirId: "ecc-m01",
        key: "m01",
        patientFhirId: "ecc-p01",
        sent: "2026-11-09T10:00:00-08:00",
        subject: "My pressure",
        text: "Is 142 too high?",
      },
    ])
  })

  it("h2 a resource it can't read is refused with the reason, and the others are taken in", () => {
    const [patient, ...rest] = patientResources(ana)
    const noValue = { ...rest.find((r) => r.resourceType === "Observation"), valueQuantity: undefined }
    const otherPatient = { ...message, id: "ecc-m99", subject: { reference: "Patient/someone-else" } }
    const oddUnit = {
      ...rest.find((r) => r.resourceType === "Observation"),
      id: "odd",
      referenceRange: [{ high: { value: 13, unit: "kPa" } }],
    }

    const result = read([patient, ...rest, noValue, otherPatient, oddUnit, { hello: "world" }])

    expect(result.records[0]?.facts.medications).toHaveLength(1)
    expect(result.refused.map((r) => r.resource).sort()).toEqual([
      "Communication/ecc-m99",
      "Observation/ecc-p01-observation-1",
      "Observation/odd",
      "undefined/undefined",
    ])
    expect(result.refused.find((r) => r.resource === "Observation/odd")?.reason).toContain("different unit")
    expect(result.refused.find((r) => r.resource === "Communication/ecc-m99")?.reason).toContain(
      "isn't one of",
    )
  })
})

describe("h2 the record's order", () => {
  it("h2 a record reads the same whatever order the server sends its resources in", () => {
    const resources = patientResources({
      ...ana,
      observations: [
        { name: "Systolic blood pressure", value: 142, unit: "mmHg", date: "2026-10-01" },
        { name: "Weight", value: 70, unit: "kg", date: "2026-11-01" },
      ],
      medications: [
        { name: "lisinopril", dose: "10 mg", frequency: "once a day" },
        { name: "atorvastatin", dose: "20 mg", frequency: "once a day" },
      ],
    })
    const [patient, ...rest] = resources

    const forwards = read(resources).records[0]?.facts
    const backwards = read([patient, ...rest.reverse()]).records[0]?.facts

    expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards))
  })
})
