import { demoMessages, demoPatients } from "../../src/demo.ts"
import { FhirServer } from "../../src/fhir/client.ts"

export const FHIR_URL = process.env["FHIR_URL"] ?? "http://127.0.0.1:8090/fhir"

/** Puts the made-up patients and the demo inbox on the local FHIR server.
 *  Run once before any test file (`global-setup.ts`): two files loading an
 *  empty server at the same moment make HAPI refuse one with a conflict.
 *  Loading again changes nothing. */
export async function loadMadeUp(): Promise<void> {
  await new FhirServer(FHIR_URL).loadMadeUp(
    demoPatients(),
    demoMessages().filter((m) => m.demo),
  )
}

/** The local FHIR server, with the made-up data the global setup loaded, so a
 *  test never depends on a person having loaded it. */
export function loadedFhir(): FhirServer {
  return new FhirServer(FHIR_URL)
}
