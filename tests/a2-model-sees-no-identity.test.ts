import { describe, expect, it } from "vitest"

import { redact } from "../src/core/redact.ts"
import { demoMessages, demoPatients } from "../src/demo.ts"
import { patientResources } from "../src/fhir/build.ts"
import { read } from "../src/fhir/reader.ts"
import { draftQuestion, sortQuestion } from "../src/model/questions.ts"

const GUIDANCE = "Reply warmly and briefly."

describe("a2 the model never sees who the patient is", () => {
  it("a2 a message signed with the patient's name or giving their contact details is sent without them", () => {
    const person = {
      fhirId: "ecc-p09",
      given: "Walter",
      family: "Brennan",
      birthDate: "1950-02-03",
      email: "walter.brennan@example.test",
      phone: "(555) 012-3456",
      address: "5 Example Street, Exampleton",
    }

    const text = redact(
      "This is Walter Brennan (born 2/3/1950), call me on 555-012-3456 or walter.brennan@example.test, 5 Example Street. WALTER",
      person,
    )

    expect(text).toBe(
      "This is [name] [name] (born [date of birth]), call me on [phone] or [email], [address]. [name]",
    )
  })

  it("a2 no request for any of the 80 messages carries a name, birth date, address, record number or contact", () => {
    const patients = demoPatients()
    for (const message of demoMessages()) {
      const patient = patients.find((p) => p.id === message.patient)
      if (!patient) throw new Error(message.id)
      const record = read(patientResources(patient)).records[0]
      if (!record) throw new Error(patient.id)
      const sent = [sortQuestion(message.text, record.person), draftQuestion(message.text, record, GUIDANCE)]
        .map((q) => `${q.system}\n${q.user}`)
        .join("\n")
        .toLowerCase()
      for (const secret of [
        patient.given,
        patient.family,
        patient.email,
        patient.phone,
        patient.address,
        patient.birthDate,
        `ecc-${patient.id}`,
      ]) {
        const escaped = secret.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        expect(sent, `${message.id}: ${secret}`).not.toMatch(new RegExp(`(?<![a-z])${escaped}(?![a-z])`))
      }
    }
  })
})
