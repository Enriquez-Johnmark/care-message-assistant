/** The append-only activity log (G1, G2). */

import type { Db, Tx } from "./db.ts"

export interface AuditEvent {
  at: Date
  actor: string
  action: string
  subjectType: string
  subjectId: string
  details?: Record<string, unknown>
}

export async function record(db: Db | Tx, event: AuditEvent): Promise<void> {
  await db.query(
    "insert into audit_events (at, actor, action, subject_type, subject_id, details) values ($1, $2, $3, $4, $5, $6)",
    [
      event.at,
      event.actor,
      event.action,
      event.subjectType,
      event.subjectId,
      JSON.stringify(event.details ?? {}),
    ],
  )
}

/** Who is acting when no person is: the background work. */
export const SYSTEM = "system"
