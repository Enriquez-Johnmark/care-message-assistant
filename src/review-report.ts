/** How the care team used the drafts (I3), from the log: how many replies were
 *  sent as drafted, edited first, or written after a draft was discarded,
 *  and how long approval took. It measures use; it claims no time saved. */

import type { Db } from "./store/db.ts"

export interface ReviewReport {
  sent: number
  asDrafted: number
  edited: number
  discardedDrafts: number
  /** Minutes from a message arriving to its reply being approved. */
  medianMinutesToApproval: number | null
}

export async function reviewReport(db: Db): Promise<ReviewReport> {
  const replies = (
    await db.query<{ source: string; minutes: string; had_model_or_template: boolean }>(
      `select d.source, extract(epoch from (a.approved_at - m.received_at)) / 60 as minutes,
              exists (select 1 from drafts e where e.message_id = m.id and e.source <> 'clinician') as had_model_or_template
       from replies r
       join approvals a on a.draft_id = r.draft_id
       join drafts d on d.id = r.draft_id
       join messages m on m.id = r.message_id`,
    )
  ).rows
  const discarded = (
    await db.query<{ n: number }>("select count(*)::int as n from drafts where discarded_reason is not null")
  ).rows[0]?.n
  const minutes = replies.map((r) => Number(r.minutes)).sort((a, b) => a - b)
  const middle = Math.floor(minutes.length / 2)
  const median =
    minutes.length === 0
      ? null
      : minutes.length % 2 === 1
        ? (minutes[middle] ?? null)
        : ((minutes[middle - 1] ?? 0) + (minutes[middle] ?? 0)) / 2
  return {
    sent: replies.length,
    asDrafted: replies.filter((r) => r.source !== "clinician").length,
    edited: replies.filter((r) => r.source === "clinician" && r.had_model_or_template).length,
    discardedDrafts: discarded ?? 0,
    medianMinutesToApproval: median === null ? null : Math.round(median),
  }
}
