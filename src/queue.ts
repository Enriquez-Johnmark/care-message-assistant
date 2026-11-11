/** The care team's queue (B3): red flags first, then by urgency, then the
 *  oldest first; open messages only. */

import type { Db } from "./store/db.ts"

export interface QueueRow {
  id: string
  patient: string
  subject: string
  sentAt: string
  type: string | null
  urgency: "urgent" | "soon" | "routine"
  redFlags: { category: string; found: string }[]
  needsPerson: string | null
  draftSource: string | null
  draftPassed: boolean | null
}

export async function queue(db: Db): Promise<QueueRow[]> {
  const rows = await db.query<{
    id: string
    given: string
    family: string
    subject: string
    sent_at: Date
    type: string | null
    urgency: QueueRow["urgency"]
    red_flags: QueueRow["redFlags"]
    needs_person: string | null
    source: string | null
    problems: unknown[] | null
    discarded_reason: string | null
  }>(
    `select m.id, p.given, p.family, m.subject, m.sent_at, m.type, m.urgency, m.red_flags, m.needs_person,
            d.source, d.problems, d.discarded_reason
     from messages m
     join patients p on p.id = m.patient_id
     left join lateral (select source, problems, discarded_reason from drafts
                        where message_id = m.id order by attempt desc limit 1) d on true
     where m.status = 'open'
     order by case m.urgency when 'urgent' then 0 when 'soon' then 1 else 2 end, m.sent_at, m.id`,
  )
  return rows.rows.map((r) => {
    const live = r.source !== null && r.discarded_reason === null
    return {
      id: r.id,
      patient: `${r.given} ${r.family}`,
      subject: r.subject,
      sentAt: r.sent_at.toISOString(),
      type: r.type,
      urgency: r.urgency,
      redFlags: r.red_flags,
      needsPerson: r.needs_person,
      draftSource: live ? r.source : null,
      draftPassed: live ? (r.problems ?? []).length === 0 : null,
    }
  })
}
