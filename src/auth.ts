/**
 * Logins by emailed link (H1), for staff and patients alike. A link is used
 * once and works for 15 minutes; a session lasts 12 hours. Only hashes of the
 * link and the session secret are stored, so the database holds nothing that
 * logs anyone in.
 */

import { createHash, randomBytes } from "node:crypto"

import type { Clock } from "./clock.ts"
import type { Mailer } from "./mail.ts"
import { record as audit } from "./store/audit.ts"
import { transaction, type Db } from "./store/db.ts"

const LINK_MINUTES = 15
const SESSION_HOURS = 12

export type Who = "staff" | "patient"

export interface Session {
  who: Who
  personId: string
}

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex")
const secret = () => randomBytes(32).toString("base64url")

/** Emails a login link if `email` is a staff member's or a patient's; says
 *  nothing either way, so the form never reveals who is registered. */
export async function requestLink(
  db: Db,
  clock: Clock,
  mailer: Mailer,
  email: string,
  baseUrl: string,
): Promise<void> {
  const address = email.trim().toLowerCase()
  const staff = (await db.query<{ id: string }>("select id from staff where lower(email) = $1", [address]))
    .rows[0]
  const patient = staff
    ? undefined
    : (await db.query<{ id: string }>("select id from patients where lower(email) = $1", [address])).rows[0]
  const person = staff
    ? { who: "staff" as const, id: staff.id }
    : patient
      ? { who: "patient" as const, id: patient.id }
      : undefined
  if (!person) return
  const token = secret()
  const now = clock.now()
  await db.query(
    "insert into login_tokens (token_hash, who, person_id, created_at, expires_at) values ($1, $2, $3, $4, $5)",
    [hash(token), person.who, person.id, now, new Date(now.getTime() + LINK_MINUTES * 60_000)],
  )
  const where =
    person.who === "staff"
      ? "Example Community Clinic's care team pages"
      : "Example Community Clinic's patient portal"
  await mailer.send(
    address,
    "Your login link",
    `Open this link to log in to ${where} (made up, for a demo):\n\n${baseUrl}/login/${token}\n\nIt works once, for ${LINK_MINUTES} minutes.`,
  )
}

/** Uses a login link: a session secret if the link is good, else `undefined`. */
export async function useLink(
  db: Db,
  clock: Clock,
  token: string,
): Promise<{ secret: string; session: Session } | undefined> {
  const now = clock.now()
  return await transaction(db, async (tx) => {
    const row = (
      await tx.query<{ who: Who; person_id: string }>(
        `update login_tokens set used_at = $2 where token_hash = $1 and used_at is null and expires_at > $2
         returning who, person_id`,
        [hash(token), now],
      )
    ).rows[0]
    if (!row) return undefined
    const sessionSecret = secret()
    await tx.query(
      "insert into sessions (secret_hash, who, person_id, created_at, expires_at) values ($1, $2, $3, $4, $5)",
      [hash(sessionSecret), row.who, row.person_id, now, new Date(now.getTime() + SESSION_HOURS * 3_600_000)],
    )
    await audit(tx, {
      at: now,
      actor: row.person_id,
      action: "login",
      subjectType: row.who,
      subjectId: row.person_id,
    })
    return { secret: sessionSecret, session: { who: row.who, personId: row.person_id } }
  })
}

export async function sessionOf(
  db: Db,
  clock: Clock,
  sessionSecret: string | undefined,
): Promise<Session | undefined> {
  if (!sessionSecret) return undefined
  const row = (
    await db.query<{ who: Who; person_id: string }>(
      "select who, person_id from sessions where secret_hash = $1 and expires_at > $2",
      [hash(sessionSecret), clock.now()],
    )
  ).rows[0]
  return row ? { who: row.who, personId: row.person_id } : undefined
}

export async function endSession(db: Db, sessionSecret: string | undefined): Promise<void> {
  if (sessionSecret) await db.query("delete from sessions where secret_hash = $1", [hash(sessionSecret)])
}
