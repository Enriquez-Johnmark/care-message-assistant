/**
 * The care team's review (E1–E4) and sending the approved reply (F1–F3).
 * Only a clinician approves a clinical reply; the front desk approves only
 * the admin template (E1). An approval names the exact text by its hash, and
 * only the message's latest draft that passed every check can be approved
 * (E2). Edits and replies written by hand are checked like any draft (E3).
 * Approving sends, in the same transaction: the reply is stored once per
 * message with the disclosure added by code (F2, F3).
 */

import { createHash } from "node:crypto"

import { CLINIC_PHONE } from "./clinic.ts"
import type { Clock } from "./clock.ts"
import { check, type Problem } from "./core/checks.ts"
import type { RecordFacts } from "./fhir/reader.ts"
import { record as audit } from "./store/audit.ts"
import { addDraft } from "./store/clinic.ts"
import { transaction, type Db, type Tx } from "./store/db.ts"

export interface Staff {
  id: string
  email: string
  name: string
  role: "administrator" | "clinician" | "front-desk"
}

export type ReviewErrorCode = "not-allowed" | "changed" | "blocked" | "answered" | "no-reason" | "not-found"

export class ReviewError extends Error {
  constructor(
    readonly code: ReviewErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export interface Deps {
  db: Db
  clock: Clock
}

export interface Draft {
  id: string
  messageId: string
  source: "model" | "template" | "urgent-template" | "clinician"
  text: string
  problems: Problem[]
  grade: number
  guidanceVersion: number | null
  model: string | null
}

/** The fingerprint of a reply's exact text, which an approval names. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** The message's latest draft that wasn't discarded; `undefined` if none. */
export async function latestDraft(db: Db | Tx, messageId: string): Promise<Draft | undefined> {
  const row = (
    await db.query<{
      id: string
      message_id: string
      source: Draft["source"]
      text: string
      problems: Problem[]
      grade: number
      guidance_version: number | null
      model: string | null
      discarded_reason: string | null
    }>(
      `select id, message_id, source, text, problems, grade, guidance_version, model, discarded_reason
       from drafts where message_id = $1 order by attempt desc limit 1`,
      [messageId],
    )
  ).rows[0]
  if (!row || row.discarded_reason !== null) return undefined
  return {
    id: row.id,
    messageId: row.message_id,
    source: row.source,
    text: row.text,
    problems: row.problems,
    grade: row.grade,
    guidanceVersion: row.guidance_version,
    model: row.model,
  }
}

interface MessageRow {
  id: string
  type: string | null
  status: string
  subject: string
  text: string
  given: string
  facts: RecordFacts
}

async function lockMessage(tx: Tx, messageId: string): Promise<MessageRow> {
  const row = (
    await tx.query<MessageRow>(
      `select m.id, m.type, m.status, m.subject, m.text, p.given, p.facts
       from messages m join patients p on p.id = m.patient_id where m.id = $1 for update of m`,
      [messageId],
    )
  ).rows[0]
  if (!row) throw new ReviewError("not-found", "no such message")
  return row
}

/** Whether `who` may act on a draft from `source`: the admin template is the
 *  front desk's or a clinician's; everything else only a clinician's (E1). */
function mayHandle(who: Staff, source: Draft["source"]): boolean {
  if (who.role === "clinician") return true
  return who.role === "front-desk" && source === "template"
}

/** The reply as sent: the name filled in, and the disclosure added (F3). */
export function replyText(
  draft: Pick<Draft, "source" | "text">,
  patientGiven: string,
  approver: Staff,
): string {
  const body = draft.text.replaceAll("{first_name}", patientGiven)
  const by =
    draft.source === "model"
      ? `This reply was drafted with the help of AI and reviewed and approved by ${approver.name}.`
      : draft.source === "clinician"
        ? `This reply was written and approved by ${approver.name}.`
        : draft.source === "template" && approver.role === "front-desk"
          ? "This reply was sent by the front desk."
          : `This reply was approved by ${approver.name}.`
  return `${body}\n\n${by} To reach a person, call ${CLINIC_PHONE}.`
}

/** Approves `draftId`, if it is the message's latest draft, passed every
 *  check, and its text still hashes to `hash`; and sends it. */
export async function approve(
  deps: Deps,
  who: Staff,
  draftId: string,
  hash: string,
): Promise<{ replyId: string }> {
  return await transaction(deps.db, async (tx) => {
    const messageId = (
      await tx.query<{ message_id: string }>("select message_id from drafts where id = $1", [draftId])
    ).rows[0]?.message_id
    if (!messageId) throw new ReviewError("not-found", "no such draft")
    const message = await lockMessage(tx, messageId)
    if (message.status !== "open") throw new ReviewError("answered", "this message was already answered")
    const draft = await latestDraft(tx, messageId)
    if (draft?.id !== draftId || contentHash(draft.text) !== hash) {
      throw new ReviewError("changed", "the reply changed since you read it; review the latest text")
    }
    if (!mayHandle(who, draft.source))
      throw new ReviewError("not-allowed", "only a clinician can approve this reply")
    if (draft.problems.length > 0)
      throw new ReviewError("blocked", "this draft failed a check, so it can't be approved")
    const at = deps.clock.now()
    await tx.query(
      "insert into approvals (draft_id, message_id, content_hash, approved_by, approved_at) values ($1, $2, $3, $4, $5)",
      [draftId, messageId, hash, who.id, at],
    )
    const text = replyText(draft, message.given, who)
    const reply = await tx.query<{ id: string }>(
      `insert into replies (message_id, draft_id, text, approved_by, sent_at) values ($1, $2, $3, $4, $5)
       on conflict (message_id) do nothing returning id`,
      [messageId, draftId, text, who.id, at],
    )
    const replyId = reply.rows[0]?.id
    if (!replyId) throw new ReviewError("answered", "this message was already answered")
    await tx.query("update messages set status = 'answered' where id = $1", [messageId])
    await audit(tx, {
      at,
      actor: who.email,
      action: "draft.approved",
      subjectType: "message",
      subjectId: messageId,
      details: { draft: draftId, contentHash: hash },
    })
    await audit(tx, {
      at,
      actor: who.email,
      action: "reply.sent",
      subjectType: "message",
      subjectId: messageId,
      details: { reply: replyId },
    })
    return { replyId }
  })
}

/** Stores the clinician's own text (an edit, or a reply written by hand) as
 *  the message's newest draft, checked like any other (E3). */
export async function edit(
  deps: Deps,
  who: Staff,
  messageId: string,
  text: string,
): Promise<{ id: string; text: string; problems: Problem[] }> {
  const trimmed = text.trim()
  return await transaction(deps.db, async (tx) => {
    const message = await lockMessage(tx, messageId)
    if (message.status !== "open") throw new ReviewError("answered", "this message was already answered")
    const current = await latestDraft(tx, messageId)
    // Only a clinician writes a reply's text; the front desk sends the
    // clinic's admin template as it stands (E1).
    if (who.role !== "clinician")
      throw new ReviewError("not-allowed", "only a clinician can write or edit a reply")
    const checked = check(trimmed, {
      facts: message.facts,
      message: `${message.subject}\n${message.text}`,
      emergencyLines: true,
    })
    const at = deps.clock.now()
    const source = "clinician"
    const id = await addDraft(tx, {
      messageId,
      source,
      model: null,
      guidanceVersion: null,
      text: trimmed,
      problems: checked.problems,
      grade: checked.grade,
      at,
      by: who.email,
    })
    await audit(tx, {
      at,
      actor: who.email,
      action: current ? "draft.edited" : "draft.written",
      subjectType: "message",
      subjectId: messageId,
      details: { draft: id, problems: checked.problems },
    })
    return { id, text: trimmed, problems: checked.problems }
  })
}

/** Discards a draft, saying why (E4); the message stays open. */
export async function discard(deps: Deps, who: Staff, draftId: string, reason: string): Promise<void> {
  const why = reason.trim()
  if (why === "") throw new ReviewError("no-reason", "give a reason for discarding the draft")
  await transaction(deps.db, async (tx) => {
    const messageId = (
      await tx.query<{ message_id: string }>("select message_id from drafts where id = $1", [draftId])
    ).rows[0]?.message_id
    if (!messageId) throw new ReviewError("not-found", "no such draft")
    const message = await lockMessage(tx, messageId)
    if (message.status !== "open") throw new ReviewError("answered", "this message was already answered")
    const draft = await latestDraft(tx, messageId)
    if (draft?.id !== draftId) throw new ReviewError("changed", "a newer draft exists")
    if (!mayHandle(who, draft.source))
      throw new ReviewError("not-allowed", "only a clinician can discard this draft")
    await tx.query("update drafts set discarded_reason = $2 where id = $1", [draftId, why])
    await audit(tx, {
      at: deps.clock.now(),
      actor: who.email,
      action: "draft.discarded",
      subjectType: "message",
      subjectId: messageId,
      details: { draft: draftId, reason: why },
    })
  })
}
