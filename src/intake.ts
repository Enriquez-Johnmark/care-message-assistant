/**
 * Taking in a patient's message. Red flags are found first, in code, and a
 * flagged message never reaches the model (B2): it is marked urgent and
 * gets the clinic's urgent reply. Otherwise the model sorts it; an admin
 * message is answered from the clinic's template (C2), any other is drafted
 * by the model from the record and the guidance (C3) and checked. A model
 * that isn't there, or an answer that doesn't parse, leaves the message for
 * a person (C1, C5). Every step is logged.
 */

import type { Clock } from "./clock.ts"
import { check } from "./core/checks.ts"
import { redFlags } from "./core/red-flags.ts"
import type { PatientRecord, PortalMessage } from "./fhir/reader.ts"
import { currentGuidance } from "./guidance.ts"
import { parseAnswer, type Model } from "./model/client.ts"
import { DraftAnswer, SortAnswer, draftQuestion, sortQuestion, type Question } from "./model/questions.ts"
import { record as audit, SYSTEM } from "./store/audit.ts"
import { addDraft, insertMessage, savePatient } from "./store/clinic.ts"
import { transaction, type Db } from "./store/db.ts"
import { ADMIN_REPLY, URGENT_REPLY } from "./templates.ts"

export interface Deps {
  db: Db
  clock: Clock
  /** `null` when no model is set up (C5). */
  model: Model | null
}

export type Outcome = "flagged" | "drafted" | "template" | "needs-person" | "already-here"

export async function takeIn(
  deps: Deps,
  message: PortalMessage,
  patient: PatientRecord,
): Promise<{ id: string; outcome: Outcome }> {
  const { db, clock } = deps
  const flags = redFlags(message.text)
  const stored = await transaction(db, async (tx) => {
    const patientId = await savePatient(tx, patient, clock.now())
    const id = await insertMessage(tx, message, patientId, clock.now())
    if (id === undefined) return undefined
    await audit(tx, {
      at: clock.now(),
      actor: SYSTEM,
      action: "message.received",
      subjectType: "message",
      subjectId: id,
    })
    if (flags.length > 0) {
      await tx.query("update messages set urgency = 'urgent', red_flags = $2 where id = $1", [
        id,
        JSON.stringify(flags),
      ])
      await audit(tx, {
        at: clock.now(),
        actor: SYSTEM,
        action: "message.flagged",
        subjectType: "message",
        subjectId: id,
        details: { flags },
      })
      await saveDraft(deps, tx, id, message, patient, "urgent-template", URGENT_REPLY, null, null)
    }
    return id
  })
  if (stored === undefined) {
    const id = (
      await db.query<{ id: string }>("select id from messages where fhir_id = $1", [message.fhirId])
    ).rows[0]?.id
    return { id: id ?? "", outcome: "already-here" }
  }
  const id = stored
  // B2: a flagged message stops here, before any model is asked anything.
  if (flags.length > 0) return { id, outcome: "flagged" }
  if (deps.model === null) return await needsPerson(deps, id, "no model is set up")

  const sorted = await ask(deps, id, sortQuestion(message.text, patient.person))
  const sort = sorted === undefined ? undefined : parseAnswer(SortAnswer, sorted)
  if (sort === undefined) return await needsPerson(deps, id, "the model's sorting couldn't be read")
  await transaction(db, async (tx) => {
    // B4: the model can raise a message to "soon", never above or below a red flag.
    await tx.query("update messages set type = $2, urgency = $3 where id = $1", [id, sort.type, sort.urgency])
    await audit(tx, {
      at: clock.now(),
      actor: deps.model?.name ?? SYSTEM,
      action: "message.sorted",
      subjectType: "message",
      subjectId: id,
      details: sort,
    })
  })

  if (sort.type === "admin") {
    await transaction(db, (tx) =>
      saveDraft(deps, tx, id, message, patient, "template", ADMIN_REPLY, null, null),
    )
    return { id, outcome: "template" }
  }

  const guidance = await currentGuidance(db)
  const drafted = await ask(deps, id, draftQuestion(message.text, patient, guidance.text))
  const draft = drafted === undefined ? undefined : parseAnswer(DraftAnswer, drafted)
  if (draft === undefined) return await needsPerson(deps, id, "the model's draft couldn't be read")
  await transaction(db, (tx) =>
    saveDraft(
      deps,
      tx,
      id,
      message,
      patient,
      "model",
      draft.reply.trim(),
      deps.model?.name ?? null,
      guidance.version,
    ),
  )
  return { id, outcome: "drafted" }
}

/** Asks the model, logging the call and its tokens; `undefined` if it failed. */
async function ask(deps: Deps, messageId: string, question: Question): Promise<string | undefined> {
  const model = deps.model
  if (model === null) return undefined
  try {
    const answer = await model.ask(question)
    await deps.db.query(
      "insert into model_calls (message_id, purpose, model, input_tokens, output_tokens, ok, at) values ($1, $2, $3, $4, $5, true, $6)",
      [messageId, question.purpose, model.name, answer.inputTokens, answer.outputTokens, deps.clock.now()],
    )
    return answer.text
  } catch {
    await deps.db.query(
      "insert into model_calls (message_id, purpose, model, input_tokens, output_tokens, ok, at) values ($1, $2, $3, 0, 0, false, $4)",
      [messageId, question.purpose, model.name, deps.clock.now()],
    )
    return undefined
  }
}

async function saveDraft(
  deps: Deps,
  tx: Parameters<typeof addDraft>[0],
  messageId: string,
  message: PortalMessage,
  patient: PatientRecord,
  source: "model" | "template" | "urgent-template",
  text: string,
  model: string | null,
  guidanceVersion: number | null,
): Promise<void> {
  const checked = check(text, { facts: patient.facts, message: message.text })
  const at = deps.clock.now()
  const draftId = await addDraft(tx, {
    messageId,
    source,
    model,
    guidanceVersion,
    text,
    problems: checked.problems,
    grade: checked.grade,
    at,
    by: model ?? "the clinic",
  })
  await audit(tx, {
    at,
    actor: model ?? SYSTEM,
    action: "draft.written",
    subjectType: "message",
    subjectId: messageId,
    details: { draft: draftId, source, guidanceVersion },
  })
  await audit(tx, {
    at,
    actor: SYSTEM,
    action: "draft.checked",
    subjectType: "message",
    subjectId: messageId,
    details: { draft: draftId, problems: checked.problems },
  })
}

async function needsPerson(deps: Deps, id: string, why: string): Promise<{ id: string; outcome: Outcome }> {
  await transaction(deps.db, async (tx) => {
    await tx.query("update messages set needs_person = $2 where id = $1", [id, why])
    await audit(tx, {
      at: deps.clock.now(),
      actor: SYSTEM,
      action: "message.needs_person",
      subjectType: "message",
      subjectId: id,
      details: { why },
    })
  })
  return { id, outcome: "needs-person" }
}
