/**
 * Writing each sent reply back to the clinic's FHIR server (F4), as a
 * `Communication` answering the patient's message (`inResponseTo`). The write
 * is a conditional create on the reply's identifier, so writing again after a
 * crash makes no second one. A system-wide worker: it reads every reply not
 * yet written.
 */

import { CLINIC_NAME } from "./clinic.ts"
import type { Clock } from "./clock.ts"
import { CLINIC_TAG, REPLY_ID } from "./fhir/build.ts"
import type { FhirServer } from "./fhir/client.ts"
import { TEST_DATA } from "./made-up.ts"
import { record as audit, SYSTEM } from "./store/audit.ts"
import type { Db } from "./store/db.ts"

/** Writes every reply not yet on the FHIR server; returns how many were written. */
export async function writeReplies(deps: { db: Db; clock: Clock }, fhir: FhirServer): Promise<number> {
  const pending = (
    await deps.db.query<{
      id: string
      text: string
      sent_at: Date
      message_fhir_id: string
      patient_fhir_id: string
      message_id: string
    }>(
      `select r.id, r.text, r.sent_at, m.fhir_id as message_fhir_id, p.fhir_id as patient_fhir_id, m.id as message_id
       from replies r join messages m on m.id = r.message_id join patients p on p.id = m.patient_id
       where r.fhir_written_at is null order by r.sent_at`,
    )
  ).rows
  let written = 0
  for (const reply of pending) {
    try {
      await fhir.createOnce(
        {
          resourceType: "Communication",
          meta: { security: [TEST_DATA], tag: [CLINIC_TAG] },
          identifier: [{ system: REPLY_ID, value: reply.id }],
          status: "completed",
          inResponseTo: [{ reference: `Communication/${reply.message_fhir_id}` }],
          subject: { reference: `Patient/${reply.patient_fhir_id}` },
          recipient: [{ reference: `Patient/${reply.patient_fhir_id}` }],
          sender: { display: CLINIC_NAME },
          sent: reply.sent_at.toISOString(),
          payload: [{ contentString: reply.text }],
        },
        `${REPLY_ID}|${reply.id}`,
      )
      await deps.db.query(
        "update replies set fhir_written_at = $2, fhir_attempts = fhir_attempts + 1, fhir_error = null where id = $1",
        [reply.id, deps.clock.now()],
      )
      await audit(deps.db, {
        at: deps.clock.now(),
        actor: SYSTEM,
        action: "reply.written_to_fhir",
        subjectType: "message",
        subjectId: reply.message_id,
        details: { reply: reply.id },
      })
      written++
    } catch (error) {
      // Tried again on the next round; one failure never holds up the rest.
      await deps.db.query(
        "update replies set fhir_attempts = fhir_attempts + 1, fhir_error = $2 where id = $1",
        [reply.id, error instanceof Error ? error.message.slice(0, 500) : String(error)],
      )
    }
  }
  return written
}
