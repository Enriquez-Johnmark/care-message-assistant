/** Fetching from the clinic's FHIR server and taking in every new message. */

import type { FhirServer } from "./fhir/client.ts"
import { read } from "./fhir/reader.ts"
import { takeIn, type Deps, type Outcome } from "./intake.ts"
import { record as audit, SYSTEM } from "./store/audit.ts"
import { savePatient } from "./store/clinic.ts"

export interface Fetched {
  patients: number
  messages: Record<Outcome, number>
  refused: { resource: string; reason: string }[]
}

export async function fetchAndTakeIn(deps: Deps, server: FhirServer, actor = SYSTEM): Promise<Fetched> {
  const result = read(await server.fetchClinic())
  for (const record of result.records) await savePatient(deps.db, record, deps.clock.now())
  const messages: Record<Outcome, number> = {
    flagged: 0,
    drafted: 0,
    template: 0,
    "needs-person": 0,
    "already-here": 0,
  }
  // Oldest first, so the queue fills in the order patients wrote.
  for (const message of [...result.messages].sort((a, b) => a.sent.localeCompare(b.sent))) {
    const patient = result.records.find((r) => r.person.fhirId === message.patientFhirId)
    if (!patient) continue
    messages[(await takeIn(deps, message, patient)).outcome]++
  }
  await audit(deps.db, {
    at: deps.clock.now(),
    actor,
    action: "fhir.fetched",
    subjectType: "fhir",
    subjectId: server.base.host,
    details: { patients: result.records.length, messages, refused: result.refused },
  })
  return { patients: result.records.length, messages, refused: result.refused }
}
