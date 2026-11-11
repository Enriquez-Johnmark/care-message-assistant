/** The clinic's written guidance for replies, kept as versions (C4): each
 *  change makes a new version, and each draft records the one it used. */

import type { Clock } from "./clock.ts"
import { record } from "./store/audit.ts"
import { transaction, type Db } from "./store/db.ts"

export const DEFAULT_GUIDANCE = `Example Community Clinic's guidance for replies (made up):
- Thank the patient and answer what they asked, briefly.
- Refills: say the request is with their clinician; refills of current medicines are usually handled within the clinic's normal process.
- Side effects or a worry about a medicine: say their clinician will review it; never suggest stopping or changing it.
- Test results: say what the result is next to the lab's range, and that their clinician can talk about what it means for them.
- New or worse symptoms: suggest they book a visit, or call the clinic if it gets worse.`

export interface Guidance {
  version: number
  text: string
}

/** The current guidance; the clinic's default is version 1 until changed. */
export async function currentGuidance(db: Db): Promise<Guidance> {
  const row = (
    await db.query<Guidance>("select version, text from guidance_versions order by version desc limit 1")
  ).rows[0]
  if (row) return row
  await db.query(
    "insert into guidance_versions (version, text, created_at, created_by) values (1, $1, now(), 'the clinic') on conflict do nothing",
    [DEFAULT_GUIDANCE],
  )
  return { version: 1, text: DEFAULT_GUIDANCE }
}

/** Makes `text` the new current guidance, logged as changed by `by`. */
export async function changeGuidance(db: Db, text: string, by: string, clock: Clock): Promise<Guidance> {
  const current = await currentGuidance(db)
  const next = { version: current.version + 1, text: text.trim() }
  await transaction(db, async (tx) => {
    await tx.query(
      "insert into guidance_versions (version, text, created_at, created_by) values ($1, $2, $3, $4)",
      [next.version, next.text, clock.now(), by],
    )
    await record(tx, {
      at: clock.now(),
      actor: by,
      action: "guidance.changed",
      subjectType: "guidance",
      subjectId: String(next.version),
      details: { from: current.version },
    })
  })
  return next
}
