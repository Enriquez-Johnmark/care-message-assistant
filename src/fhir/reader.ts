/**
 * The strict FHIR R4 reader (H2). Everything from the FHIR server is
 * untrusted: each resource is parsed into the app's own types, and one that
 * doesn't fit is refused with the reason while the others are taken in.
 */

import { z } from "zod"

import { MESSAGE_ID } from "./build.ts"

/** What the model may see of a patient: the record, with nothing that says who they are. */
export interface RecordFacts {
  conditions: { name: string; since: string }[]
  medications: { name: string; dose: string; frequency: string }[]
  allergies: { substance: string; reaction: string }[]
  observations: { name: string; value: number; unit: string; date: string; low?: number; high?: number }[]
  appointments: { start: string; kind: string; with: string }[]
}

/** Who the patient is: kept apart from the facts, and never sent to a model. */
export interface Person {
  fhirId: string
  given: string
  family: string
  birthDate: string
  email: string
  phone: string
  address: string
}

export interface PatientRecord {
  person: Person
  facts: RecordFacts
}

export interface PortalMessage {
  fhirId: string
  /** The message's own identifier, e.g. `m01`. */
  key: string
  patientFhirId: string
  sent: string
  subject: string
  text: string
}

export interface Refused {
  resource: string
  reason: string
}

export interface Read {
  records: PatientRecord[]
  messages: PortalMessage[]
  refused: Refused[]
}

const text = z.string().trim().min(1).max(500)
const ref = z.strictObject({ reference: z.string().regex(/^Patient\/[A-Za-z0-9\-.]{1,64}$/) }).loose()

const patientSchema = z
  .object({
    id: z.string(),
    name: z.array(z.object({ given: z.array(text).min(1), family: text }).loose()).min(1),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    telecom: z.array(z.object({ system: z.string(), value: z.string() }).loose()).default([]),
    address: z.array(z.object({ text: z.string() }).loose()).default([]),
  })
  .loose()

const conditionSchema = z
  .object({ code: z.object({ text }).loose(), subject: ref, onsetDateTime: z.string().min(4) })
  .loose()
const medicationSchema = z
  .object({
    status: z.literal("active"),
    medicationCodeableConcept: z.object({ text }).loose(),
    subject: ref,
    dosageInstruction: z
      .array(z.object({ text, timing: z.object({ code: z.object({ text }).loose() }).loose() }).loose())
      .min(1),
  })
  .loose()
const allergySchema = z
  .object({
    code: z.object({ text }).loose(),
    patient: ref,
    reaction: z.array(z.object({ manifestation: z.array(z.object({ text }).loose()).min(1) }).loose()).min(1),
  })
  .loose()
const quantity = z.object({ value: z.number(), unit: z.string().max(40) }).loose()
const observationSchema = z
  .object({
    status: z.enum(["final", "amended", "corrected"]),
    code: z.object({ text }).loose(),
    subject: ref,
    effectiveDateTime: z.string().min(10),
    valueQuantity: quantity,
    referenceRange: z
      .array(z.object({ low: quantity.optional(), high: quantity.optional() }).loose())
      .optional(),
  })
  .loose()
const appointmentSchema = z
  .object({
    status: z.enum(["booked", "pending", "arrived"]),
    description: text,
    start: z.iso.datetime({ offset: true }),
    participant: z.array(
      z
        .object({
          actor: z.object({ reference: z.string().optional(), display: z.string().optional() }).loose(),
        })
        .loose(),
    ),
  })
  .loose()
const communicationSchema = z
  .object({
    id: z.string(),
    identifier: z.array(z.object({ system: z.string(), value: z.string() }).loose()),
    subject: ref,
    sent: z.iso.datetime({ offset: true }),
    topic: z.object({ text }).loose().optional(),
    payload: z.array(z.object({ contentString: z.string().trim().min(1).max(5000) }).loose()).length(1),
  })
  .loose()

const patientOf = (reference: string) => reference.slice("Patient/".length)

function reason(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue ? `${issue.path.join(".") || "resource"}: ${issue.message}` : "not readable"
}

/** Reads `resources`, as fetched from the clinic's FHIR server. */
export function read(resources: unknown[]): Read {
  const result: Read = { records: [], messages: [], refused: [] }
  const byPatient = new Map<string, PatientRecord>()
  const later: { kind: string; label: string; resource: unknown }[] = []
  for (const resource of resources) {
    const kind = (resource as { resourceType?: unknown } | null)?.resourceType
    const label = `${String(kind)}/${String((resource as { id?: unknown } | null)?.id)}`
    if (kind === "Patient") {
      const parsed = patientSchema.safeParse(resource)
      if (!parsed.success) {
        result.refused.push({ resource: label, reason: reason(parsed.error) })
        continue
      }
      const p = parsed.data
      const name = p.name[0]
      const contact = (system: string) => p.telecom.find((t) => t.system === system)?.value ?? ""
      if (!name) continue
      const record: PatientRecord = {
        person: {
          fhirId: p.id,
          given: name.given[0] ?? "",
          family: name.family,
          birthDate: p.birthDate,
          email: contact("email"),
          phone: contact("phone"),
          address: p.address[0]?.text ?? "",
        },
        facts: { conditions: [], medications: [], allergies: [], observations: [], appointments: [] },
      }
      byPatient.set(p.id, record)
      result.records.push(record)
    } else if (typeof kind === "string") {
      later.push({ kind, label, resource })
    } else {
      result.refused.push({ resource: label, reason: "not a FHIR resource" })
    }
  }
  for (const { kind, label, resource } of later) {
    const refuse = (why: string) => result.refused.push({ resource: label, reason: why })
    const attach = (reference: string): RecordFacts | undefined => {
      const record = byPatient.get(patientOf(reference))
      if (!record) refuse("its patient isn't one of the clinic's")
      return record?.facts
    }
    switch (kind) {
      case "Condition": {
        const parsed = conditionSchema.safeParse(resource)
        if (!parsed.success) refuse(reason(parsed.error))
        else
          attach(parsed.data.subject.reference)?.conditions.push({
            name: parsed.data.code.text,
            since: parsed.data.onsetDateTime.slice(0, 10),
          })
        break
      }
      case "MedicationRequest": {
        const parsed = medicationSchema.safeParse(resource)
        if (!parsed.success) {
          refuse(reason(parsed.error))
          break
        }
        const dosage = parsed.data.dosageInstruction[0]
        if (dosage)
          attach(parsed.data.subject.reference)?.medications.push({
            name: parsed.data.medicationCodeableConcept.text,
            dose: dosage.text,
            frequency: dosage.timing.code.text,
          })
        break
      }
      case "AllergyIntolerance": {
        const parsed = allergySchema.safeParse(resource)
        if (!parsed.success) refuse(reason(parsed.error))
        else
          attach(parsed.data.patient.reference)?.allergies.push({
            substance: parsed.data.code.text,
            reaction: parsed.data.reaction[0]?.manifestation[0]?.text ?? "",
          })
        break
      }
      case "Observation": {
        const parsed = observationSchema.safeParse(resource)
        if (!parsed.success) {
          refuse(reason(parsed.error))
          break
        }
        const o = parsed.data
        const range = o.referenceRange?.[0]
        if (
          (range?.low && range.low.unit !== o.valueQuantity.unit) ||
          (range?.high && range.high.unit !== o.valueQuantity.unit)
        ) {
          refuse("its range is in a different unit from its value")
          break
        }
        attach(o.subject.reference)?.observations.push({
          name: o.code.text,
          value: o.valueQuantity.value,
          unit: o.valueQuantity.unit,
          date: o.effectiveDateTime.slice(0, 10),
          ...(range?.low ? { low: range.low.value } : {}),
          ...(range?.high ? { high: range.high.value } : {}),
        })
        break
      }
      case "Appointment": {
        const parsed = appointmentSchema.safeParse(resource)
        if (!parsed.success) {
          refuse(reason(parsed.error))
          break
        }
        const a = parsed.data
        const patient = a.participant.find((p) => p.actor.reference?.startsWith("Patient/"))?.actor.reference
        const clinician = a.participant.find((p) => !p.actor.reference)?.actor.display ?? "the clinic"
        if (!patient) refuse("it names no patient")
        else attach(patient)?.appointments.push({ start: a.start, kind: a.description, with: clinician })
        break
      }
      case "Communication": {
        const parsed = communicationSchema.safeParse(resource)
        if (!parsed.success) {
          refuse(reason(parsed.error))
          break
        }
        const c = parsed.data
        const key = c.identifier.find((i) => i.system === MESSAGE_ID)?.value
        // Replies the clinic sent are Communications too; only patients' messages are read here.
        if (!key) break
        if (!byPatient.has(patientOf(c.subject.reference))) {
          refuse("its patient isn't one of the clinic's")
          break
        }
        result.messages.push({
          fhirId: c.id,
          key,
          patientFhirId: patientOf(c.subject.reference),
          sent: c.sent,
          subject: c.topic?.text ?? "",
          text: c.payload[0]?.contentString ?? "",
        })
        break
      }
      default:
        refuse(`a ${kind} isn't read`)
    }
  }
  // A fixed order, whatever order the server sent: the same record always
  // gives the model the same question.
  for (const { facts } of result.records) {
    const by = (a: string, b: string) => a.localeCompare(b)
    facts.conditions.sort((a, b) => by(a.name, b.name) || by(a.since, b.since))
    facts.medications.sort((a, b) => by(a.name, b.name) || by(a.dose, b.dose))
    facts.allergies.sort((a, b) => by(a.substance, b.substance))
    facts.observations.sort((a, b) => by(b.date, a.date) || by(a.name, b.name) || a.value - b.value)
    facts.appointments.sort((a, b) => by(a.start, b.start))
  }
  result.messages.sort((a, b) => a.sent.localeCompare(b.sent) || a.key.localeCompare(b.key))
  return result
}
