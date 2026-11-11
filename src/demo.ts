/**
 * The made-up clinic's data (A1): 20 patients written by hand in
 * `demo/patients.json`, and 80 labelled messages in `evalset/messages.json`.
 * Both are parsed strictly; a file that doesn't match is an error, never
 * half-read.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoDateTime = z.iso.datetime({ offset: true })

export const demoPatientSchema = z.strictObject({
  id: z.string().regex(/^p\d{2}$/),
  given: z.string().min(1),
  family: z.string().min(1),
  birthDate: isoDate,
  gender: z.enum(["female", "male", "other"]),
  email: z.email().endsWith("@example.test"),
  phone: z.string().regex(/^\(555\) 01\d-\d{4}$/),
  address: z.string().min(1),
  conditions: z.array(z.strictObject({ code: z.string().min(1), onset: isoDate })),
  medications: z.array(
    z.strictObject({ name: z.string().min(1), dose: z.string().min(1), frequency: z.string().min(1) }),
  ),
  allergies: z.array(z.strictObject({ substance: z.string().min(1), reaction: z.string().min(1) })),
  observations: z.array(
    z.strictObject({
      name: z.string().min(1),
      value: z.number(),
      unit: z.string(),
      date: isoDate,
      low: z.number().optional(),
      high: z.number().optional(),
    }),
  ),
  appointments: z.array(
    z.strictObject({ date: isoDateTime, kind: z.string().min(1), with: z.string().min(1) }),
  ),
})
export type DemoPatient = z.infer<typeof demoPatientSchema>

export const MESSAGE_TYPES = ["medication", "symptom", "test-result", "admin"] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const demoMessageSchema = z.strictObject({
  id: z.string().regex(/^m\d{2}$/),
  patient: z.string().regex(/^p\d{2}$/),
  sent: isoDateTime,
  subject: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(MESSAGE_TYPES),
  redFlag: z.boolean(),
  flagReason: z.string().optional(),
  tricky: z.enum(["casual", "spelling", "negated", "not-in-record", "dose-change"]).nullable(),
  demo: z.boolean(),
  note: z.string(),
})
export type DemoMessage = z.infer<typeof demoMessageSchema>

const ROOT = join(import.meta.dirname, "..")

/** The 20 made-up patients. */
export function demoPatients(): DemoPatient[] {
  return z.array(demoPatientSchema).parse(JSON.parse(readFileSync(join(ROOT, "demo/patients.json"), "utf8")))
}

/** The 80 labelled made-up messages. */
export function demoMessages(): DemoMessage[] {
  return z
    .array(demoMessageSchema)
    .parse(JSON.parse(readFileSync(join(ROOT, "evalset/messages.json"), "utf8")))
}
