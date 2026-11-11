/**
 * The made-up patients and messages as FHIR R4 resources, for the clinic's
 * FHIR server. Every resource is marked as test data (HTEST) and tagged with
 * the clinic, and its ID starts `ecc-`, so it never collides with another
 * demo on the same server.
 */

import type { DemoMessage, DemoPatient } from "../demo.ts"
import { TEST_DATA } from "../made-up.ts"

/** The tag on every resource of this clinic; fetching filters on it. */
export const CLINIC_TAG = { system: "urn:example:care-message-assistant", code: "example-community-clinic" }
/** The identifier system of a portal message, and of a reply. */
export const MESSAGE_ID = "urn:example:care-message-assistant:message"
export const REPLY_ID = "urn:example:care-message-assistant:reply"

export type Resource = { resourceType: string; id: string } & Record<string, unknown>

const meta = () => ({ security: [TEST_DATA], tag: [CLINIC_TAG] })

/** The FHIR ID of demo patient `p01`. */
export const patientId = (id: string) => `ecc-${id}`

/** One patient and their record. */
export function patientResources(p: DemoPatient): Resource[] {
  const id = patientId(p.id)
  const subject = { reference: `Patient/${id}` }
  const resources: Resource[] = [
    {
      resourceType: "Patient",
      id,
      meta: meta(),
      name: [{ given: [p.given], family: p.family }],
      gender: p.gender,
      birthDate: p.birthDate,
      telecom: [
        { system: "email", value: p.email },
        { system: "phone", value: p.phone },
      ],
      address: [{ text: p.address }],
    },
  ]
  p.conditions.forEach((c, i) =>
    resources.push({
      resourceType: "Condition",
      id: `${id}-condition-${i + 1}`,
      meta: meta(),
      clinicalStatus: {
        coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }],
      },
      code: { text: c.code },
      subject,
      onsetDateTime: c.onset,
    }),
  )
  p.medications.forEach((m, i) =>
    resources.push({
      resourceType: "MedicationRequest",
      id: `${id}-medication-${i + 1}`,
      meta: meta(),
      status: "active",
      intent: "order",
      medicationCodeableConcept: { text: m.name },
      subject,
      dosageInstruction: [{ text: m.dose, timing: { code: { text: m.frequency } } }],
    }),
  )
  p.allergies.forEach((a, i) =>
    resources.push({
      resourceType: "AllergyIntolerance",
      id: `${id}-allergy-${i + 1}`,
      meta: meta(),
      code: { text: a.substance },
      patient: subject,
      reaction: [{ manifestation: [{ text: a.reaction }] }],
    }),
  )
  p.observations.forEach((o, i) => {
    const range: Record<string, unknown> = {}
    if (o.low !== undefined) range["low"] = { value: o.low, unit: o.unit }
    if (o.high !== undefined) range["high"] = { value: o.high, unit: o.unit }
    resources.push({
      resourceType: "Observation",
      id: `${id}-observation-${i + 1}`,
      meta: meta(),
      status: "final",
      code: { text: o.name },
      subject,
      effectiveDateTime: o.date,
      valueQuantity: { value: o.value, unit: o.unit },
      ...(Object.keys(range).length > 0 ? { referenceRange: [range] } : {}),
    })
  })
  p.appointments.forEach((a, i) =>
    resources.push({
      resourceType: "Appointment",
      id: `${id}-appointment-${i + 1}`,
      meta: meta(),
      status: "booked",
      description: a.kind,
      start: a.date,
      participant: [
        { actor: subject, status: "accepted" },
        { actor: { display: a.with }, status: "accepted" },
      ],
    }),
  )
  return resources
}

/** One portal message from a patient to the clinic. */
export function messageResource(m: DemoMessage): Resource {
  return {
    resourceType: "Communication",
    id: `ecc-${m.id}`,
    meta: meta(),
    identifier: [{ system: MESSAGE_ID, value: m.id }],
    status: "completed",
    subject: { reference: `Patient/${patientId(m.patient)}` },
    sender: { reference: `Patient/${patientId(m.patient)}` },
    recipient: [{ display: "Example Community Clinic" }],
    sent: m.sent,
    topic: { text: m.subject },
    payload: [{ contentString: m.text }],
  }
}
