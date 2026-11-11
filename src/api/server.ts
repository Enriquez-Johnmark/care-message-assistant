/**
 * The JSON API for the staff pages and the patient portal (H1), and the
 * React app. Every staff route needs a staff login, and the actions check the
 * role; every portal route needs a patient login and shows only that
 * patient's messages (A4). Posts must come from the app's own origin.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"

import cookie from "@fastify/cookie"
import staticFiles from "@fastify/static"
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify"
import { z } from "zod"

import { clinicLog, timeline } from "../activity.ts"
import { endSession, requestLink, sessionOf, useLink, type Session } from "../auth.ts"
import type { Clock } from "../clock.ts"
import type { FhirServer } from "../fhir/client.ts"
import { fetchAndTakeIn } from "../fetch.ts"
import { changeGuidance, currentGuidance } from "../guidance.ts"
import type { Mailer } from "../mail.ts"
import type { Model } from "../model/client.ts"
import { queue } from "../queue.ts"
import { approve, contentHash, discard, edit, latestDraft, ReviewError, type Staff } from "../review.ts"
import type { Db } from "../store/db.ts"

export interface App {
  db: Db
  clock: Clock
  mailer: Mailer
  model: Model | null
  fhir: FhirServer | null
  /** Where the app is served, e.g. `http://127.0.0.1:3000`; posts must come from its origin. */
  baseUrl: string
  /** The built React app, if served from here. */
  webDir?: string
}

const COOKIE = "cma_session"

const STATUS: Record<ReviewError["code"], number> = {
  "not-allowed": 403,
  changed: 409,
  answered: 409,
  blocked: 422,
  "no-reason": 400,
  "not-found": 404,
}

export function server(app: App): FastifyInstance {
  const fastify = Fastify({ logger: false, bodyLimit: 64 * 1024 })
  const origin = new URL(app.baseUrl).origin
  const secure = app.baseUrl.startsWith("https://")

  void fastify.register(cookie)

  fastify.addHook("onRequest", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff")
    reply.header("referrer-policy", "no-referrer")
    reply.header("x-frame-options", "DENY")
    reply.header(
      "content-security-policy",
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
    )
    if (request.method !== "GET" && request.method !== "HEAD" && request.headers.origin !== origin) {
      await reply.code(403).send({ error: "posts must come from this app" })
    }
  })

  fastify.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ReviewError)
      return reply.code(STATUS[error.code]).send({ error: error.message, code: error.code })
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "that wasn't understood" })
    console.error(error)
    return reply.code(500).send({ error: "something went wrong" })
  })

  const session = (request: FastifyRequest) => sessionOf(app.db, app.clock, request.cookies[COOKIE])

  async function staffOf(request: FastifyRequest, reply: FastifyReply): Promise<Staff | undefined> {
    const s = await session(request)
    if (s?.who !== "staff") {
      await reply.code(401).send({ error: "log in first" })
      return undefined
    }
    return (await app.db.query<Staff>("select id, email, name, role from staff where id = $1", [s.personId]))
      .rows[0]
  }

  async function patientOf(request: FastifyRequest, reply: FastifyReply): Promise<Session | undefined> {
    const s = await session(request)
    if (s?.who !== "patient") {
      await reply.code(401).send({ error: "log in first" })
      return undefined
    }
    return s
  }

  // Logins.
  fastify.post("/api/login", async (request, reply) => {
    const { email } = z.object({ email: z.string().max(200) }).parse(request.body)
    await requestLink(app.db, app.clock, app.mailer, email, app.baseUrl)
    return reply.code(204).send()
  })
  fastify.post("/api/login/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(request.params)
    const used = await useLink(app.db, app.clock, token)
    if (!used)
      return reply.code(410).send({ error: "this link has expired or was already used; ask for a new one" })
    void reply.setCookie(COOKIE, used.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 12 * 3600,
    })
    return { who: used.session.who }
  })
  fastify.post("/api/logout", async (request, reply) => {
    await endSession(app.db, request.cookies[COOKIE])
    void reply.clearCookie(COOKIE, { path: "/" })
    return reply.code(204).send()
  })
  fastify.get("/api/me", async (request, reply) => {
    const s = await session(request)
    if (!s) return reply.code(401).send({ error: "log in first" })
    if (s.who === "staff") {
      const staff = (
        await app.db.query<Staff>("select id, email, name, role from staff where id = $1", [s.personId])
      ).rows[0]
      return { who: "staff", name: staff?.name, email: staff?.email, role: staff?.role }
    }
    const p = (
      await app.db.query<{ given: string; family: string }>(
        "select given, family from patients where id = $1",
        [s.personId],
      )
    ).rows[0]
    return { who: "patient", name: p ? `${p.given} ${p.family}` : "" }
  })

  // The care team.
  fastify.get("/api/queue", async (request, reply) => {
    if (!(await staffOf(request, reply))) return
    return await queue(app.db)
  })

  fastify.get("/api/messages/:id", async (request, reply) => {
    if (!(await staffOf(request, reply))) return
    const { id } = z.object({ id: z.uuid() }).parse(request.params)
    const row = (
      await app.db.query<{
        id: string
        subject: string
        text: string
        sent_at: Date
        type: string | null
        urgency: string
        red_flags: unknown
        needs_person: string | null
        status: string
        given: string
        family: string
        birth_date: Date
        facts: unknown
      }>(
        `select m.id, m.subject, m.text, m.sent_at, m.type, m.urgency, m.red_flags, m.needs_person, m.status,
                p.given, p.family, p.birth_date, p.facts
         from messages m join patients p on p.id = m.patient_id where m.id = $1`,
        [id],
      )
    ).rows[0]
    if (!row) return reply.code(404).send({ error: "not found" })
    const draft = await latestDraft(app.db, id)
    const sent = (
      await app.db.query<{ text: string; sent_at: Date; name: string }>(
        "select r.text, r.sent_at, s.name from replies r join staff s on s.id = r.approved_by where r.message_id = $1",
        [id],
      )
    ).rows[0]
    return {
      id: row.id,
      subject: row.subject,
      text: row.text,
      sentAt: row.sent_at.toISOString(),
      type: row.type,
      urgency: row.urgency,
      redFlags: row.red_flags,
      needsPerson: row.needs_person,
      status: row.status,
      patient: {
        name: `${row.given} ${row.family}`,
        birthDate: row.birth_date.toISOString().slice(0, 10),
        facts: row.facts,
      },
      draft: draft ? { ...draft, contentHash: contentHash(draft.text) } : null,
      reply: sent ? { text: sent.text, sentAt: sent.sent_at.toISOString(), approvedBy: sent.name } : null,
      timeline: await timeline(app.db, id),
    }
  })

  fastify.post("/api/messages/:id/edit", async (request, reply) => {
    const who = await staffOf(request, reply)
    if (!who) return
    const { id } = z.object({ id: z.uuid() }).parse(request.params)
    const { text } = z.object({ text: z.string().min(1).max(4000) }).parse(request.body)
    return await edit(app, who, id, text)
  })

  fastify.post("/api/drafts/:id/approve", async (request, reply) => {
    const who = await staffOf(request, reply)
    if (!who) return
    const { id } = z.object({ id: z.uuid() }).parse(request.params)
    const { contentHash: hash } = z.object({ contentHash: z.string().length(64) }).parse(request.body)
    return await approve(app, who, id, hash)
  })

  fastify.post("/api/drafts/:id/discard", async (request, reply) => {
    const who = await staffOf(request, reply)
    if (!who) return
    const { id } = z.object({ id: z.uuid() }).parse(request.params)
    const { reason } = z.object({ reason: z.string().max(500) }).parse(request.body)
    await discard(app, who, id, reason)
    return reply.code(204).send()
  })

  // The administrator.
  async function administrator(request: FastifyRequest, reply: FastifyReply): Promise<Staff | undefined> {
    const who = await staffOf(request, reply)
    if (who && who.role !== "administrator") {
      await reply.code(403).send({ error: "only the administrator can do this" })
      return undefined
    }
    return who
  }

  fastify.get("/api/activity", async (request, reply) => {
    if (!(await administrator(request, reply))) return
    const q = z.object({ actor: z.string().optional(), action: z.string().optional() }).parse(request.query)
    const blank = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v.trim())
    const actor = blank(q.actor)
    const action = blank(q.action)
    return await clinicLog(app.db, { ...(actor ? { actor } : {}), ...(action ? { action } : {}) })
  })

  fastify.get("/api/guidance", async (request, reply) => {
    if (!(await staffOf(request, reply))) return
    return await currentGuidance(app.db, app.clock)
  })
  fastify.post("/api/guidance", async (request, reply) => {
    const who = await administrator(request, reply)
    if (!who) return
    const { text } = z.object({ text: z.string().max(4000) }).parse(request.body)
    try {
      return await changeGuidance(app.db, text, who.email, app.clock)
    } catch (error) {
      if (error instanceof Error && error.message.includes("empty"))
        return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  fastify.post("/api/fetch", async (request, reply) => {
    const who = await administrator(request, reply)
    if (!who) return
    if (!app.fhir) return reply.code(409).send({ error: "no FHIR server is set up" })
    return await fetchAndTakeIn(app, app.fhir, who.email)
  })

  // The patient portal: only the patient's own messages and approved replies (A4).
  fastify.get("/api/portal/messages", async (request, reply) => {
    const patient = await patientOf(request, reply)
    if (!patient) return
    const rows = await app.db.query<{
      id: string
      subject: string
      text: string
      sent_at: Date
      reply: string | null
      replied_at: Date | null
    }>(
      `select m.id, m.subject, m.text, m.sent_at, r.text as reply, r.sent_at as replied_at
       from messages m left join replies r on r.message_id = m.id
       where m.patient_id = $1 order by m.sent_at desc`,
      [patient.personId],
    )
    return rows.rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      text: r.text,
      sentAt: r.sent_at.toISOString(),
      reply: r.reply === null ? null : { text: r.reply, sentAt: r.replied_at?.toISOString() ?? "" },
    }))
  })

  fastify.get("/health", () => ({ ok: true }))

  // The React app, with every other path given its page.
  if (app.webDir && existsSync(join(app.webDir, "index.html"))) {
    const webDir = app.webDir
    void fastify.register(staticFiles, { root: webDir, wildcard: false })
    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" })
      return reply.type("text/html").sendFile("index.html")
    })
  }

  return fastify
}
