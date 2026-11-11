/** The API on a test database, with a mailer that keeps each email. */

import type { FastifyInstance } from "fastify"

import { server } from "../../src/api/server.ts"
import type { FixedClock } from "../../src/clock.ts"
import type { Mailer } from "../../src/mail.ts"
import type { Model } from "../../src/model/client.ts"
import type { Db } from "../../src/store/db.ts"

export const BASE = "http://care.example.test"

export class KeptMail implements Mailer {
  readonly sent: { to: string; subject: string; text: string }[] = []
  send(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text })
    return Promise.resolve()
  }
  linkFor(to: string): string | undefined {
    const mail = [...this.sent].reverse().find((m) => m.to === to)
    return mail?.text.split(/\s+/).find((w) => w.includes("/login/"))
  }
}

export function api(db: Db, clock: FixedClock, model: Model | null = null) {
  const mail = new KeptMail()
  const app = server({ db, clock, mailer: mail, model, fhir: null, baseUrl: BASE })
  return { app, mail }
}

export async function call(
  app: FastifyInstance,
  method: "GET" | "POST",
  url: string,
  options: { body?: unknown; cookie?: string; origin?: string } = {},
) {
  const response = await app.inject({
    method,
    url,
    headers: {
      origin: options.origin ?? BASE,
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { payload: JSON.stringify(options.body) } : {}),
  })
  const cookie = response.cookies.find((c) => c.name === "cma_session")
  let body: unknown
  try {
    body = response.json()
  } catch {
    body = null
  }
  return { status: response.statusCode, body, cookie: cookie ? `cma_session=${cookie.value}` : undefined }
}

/** Logs `email` in through the emailed link; returns the session cookie. */
export async function logIn(app: FastifyInstance, mail: KeptMail, email: string): Promise<string> {
  await call(app, "POST", "/api/login", { body: { email } })
  const link = mail.linkFor(email)
  if (!link) throw new Error(`no login email to ${email}`)
  const token = link.split("/login/")[1] ?? ""
  const used = await call(app, "POST", `/api/login/${token}`)
  if (!used.cookie) throw new Error("no session cookie")
  return used.cookie
}
