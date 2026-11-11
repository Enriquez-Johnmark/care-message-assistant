import { describe, expect, it } from "vitest"

import { demoMessages, demoPatients } from "../src/demo.ts"
import { FhirError, FhirServer } from "../src/fhir/client.ts"
import { read } from "../src/fhir/reader.ts"

const url = process.env["FHIR_URL"] ?? "http://127.0.0.1:8090/fhir"

describe("h2 the clinic's FHIR server", () => {
  it("h2 the made-up patients and the demo inbox load and are read back whole, nothing refused", async () => {
    const server = new FhirServer(url)
    const inbox = demoMessages().filter((m) => m.demo)
    await server.loadMadeUp(demoPatients(), inbox)
    // Loading again changes nothing.
    await server.loadMadeUp(demoPatients(), inbox)

    const result = read(await server.fetchClinic())

    expect(result.refused).toEqual([])
    expect(result.records).toHaveLength(20)
    expect(result.messages.map((m) => m.key).sort()).toEqual(inbox.map((m) => m.id).sort())
    const p01 = demoPatients().find((p) => p.id === "p01")
    const record = result.records.find((r) => r.person.fhirId === "ecc-p01")
    expect(record?.facts.medications).toHaveLength(p01?.medications.length ?? -1)
    expect(record?.facts.observations).toHaveLength(p01?.observations.length ?? -1)
  }, 120_000)

  it("h2 made-up data is only loaded into a server on this computer, and only https is fetched from elsewhere", async () => {
    expect(() => new FhirServer("http://fhir.example.test/fhir")).toThrow(FhirError)
    await expect(new FhirServer("https://fhir.example.test/fhir").loadMadeUp([], [])).rejects.toThrow(
      "only loaded into a server on this computer",
    )
  })
})
