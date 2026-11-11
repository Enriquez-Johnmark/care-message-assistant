/** Reading the activity log (G3): one message's timeline, and the whole log
 *  for the administrator, filtered by person and by step. Newest first. */

import type { Db } from "./store/db.ts"

export interface Entry {
  at: Date
  actor: string
  action: string
  subjectType: string
  subjectId: string
  details: Record<string, unknown>
}

const COLUMNS = 'at, actor, action, subject_type as "subjectType", subject_id as "subjectId", details'

export async function timeline(db: Db, messageId: string): Promise<Entry[]> {
  return (
    await db.query<Entry>(
      `select ${COLUMNS} from audit_events where subject_type = 'message' and subject_id = $1 order by at desc, id desc`,
      [messageId],
    )
  ).rows
}

export async function clinicLog(db: Db, filter: { actor?: string; action?: string }): Promise<Entry[]> {
  return (
    await db.query<Entry>(
      `select ${COLUMNS} from audit_events
       where ($1::text is null or actor = $1) and ($2::text is null or action = $2)
       order by at desc, id desc limit 500`,
      [filter.actor ?? null, filter.action ?? null],
    )
  ).rows
}
