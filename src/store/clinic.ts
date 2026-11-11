/** The clinic's patients and messages as stored, taken from the FHIR server. */

import type { PatientRecord, PortalMessage } from "../fhir/reader.ts"
import type { Db, Tx } from "./db.ts"

/** Saves or updates a patient; returns their ID. */
export async function savePatient(db: Db | Tx, patient: PatientRecord, at: Date): Promise<string> {
  const p = patient.person
  const row = await db.query<{ id: string }>(
    `insert into patients (fhir_id, given, family, birth_date, email, phone, address, facts, fetched_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (fhir_id) do update set given = excluded.given, family = excluded.family,
       birth_date = excluded.birth_date, email = excluded.email, phone = excluded.phone,
       address = excluded.address, facts = excluded.facts, fetched_at = excluded.fetched_at
     returning id`,
    [
      p.fhirId,
      p.given,
      p.family,
      p.birthDate,
      p.email,
      p.phone,
      p.address,
      JSON.stringify(patient.facts),
      at,
    ],
  )
  const id = row.rows[0]?.id
  if (!id) throw new Error(`patient ${p.fhirId} wasn't saved`)
  return id
}

/** Stores a message once; `undefined` if it was already here. */
export async function insertMessage(
  db: Db | Tx,
  message: PortalMessage,
  patientId: string,
  at: Date,
): Promise<string | undefined> {
  const row = await db.query<{ id: string }>(
    `insert into messages (fhir_id, key, patient_id, sent_at, subject, text, received_at)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (fhir_id) do nothing returning id`,
    [message.fhirId, message.key, patientId, message.sent, message.subject, message.text, at],
  )
  return row.rows[0]?.id
}

/** Adds a draft as the message's next attempt; returns its ID. */
export async function addDraft(
  db: Db | Tx,
  draft: {
    messageId: string
    source: "model" | "template" | "urgent-template" | "clinician"
    model: string | null
    guidanceVersion: number | null
    text: string
    problems: unknown[]
    grade: number
    at: Date
    by: string
  },
): Promise<string> {
  // One draft at a time per message, so two never take the same attempt number.
  await db.query("select id from messages where id = $1 for update", [draft.messageId])
  const row = await db.query<{ id: string }>(
    `insert into drafts (message_id, attempt, source, model, guidance_version, text, problems, grade, created_at, created_by)
     values ($1, coalesce((select max(attempt) from drafts where message_id = $1), 0) + 1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      draft.messageId,
      draft.source,
      draft.model,
      draft.guidanceVersion,
      draft.text,
      JSON.stringify(draft.problems),
      draft.grade,
      draft.at,
      draft.by,
    ],
  )
  const id = row.rows[0]?.id
  if (!id) throw new Error("the draft wasn't saved")
  return id
}

/** A message already here, and whether it was settled: flagged, drafted or
 *  left for a person. One saved just before a crash isn't. */
export async function existingMessage(
  db: Db | Tx,
  fhirId: string,
): Promise<{ id: string; settled: boolean } | undefined> {
  const row = (
    await db.query<{ id: string; settled: boolean }>(
      `select id, (needs_person is not null or status <> 'open'
                   or exists (select 1 from drafts d where d.message_id = m.id)) as settled
       from messages m where fhir_id = $1`,
      [fhirId],
    )
  ).rows[0]
  return row
}
