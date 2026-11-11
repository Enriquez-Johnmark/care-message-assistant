// The API sends codes; these are the words people see. An unknown code is
// shown as it is rather than hidden.

const types: Record<string, string> = {
  medication: "Medication",
  symptom: "Symptom",
  "test-result": "Test result",
  admin: "Admin",
}

export function typeLabel(type: string | null) {
  return type === null ? "Not sorted" : (types[type] ?? type)
}

const urgencies: Record<
  string,
  { label: string; variant: "destructive" | "warning" | "secondary" }
> = {
  urgent: { label: "Red flag", variant: "destructive" },
  soon: { label: "Today", variant: "warning" },
  routine: { label: "Routine", variant: "secondary" },
}

export function urgencyLabel(urgency: string) {
  return urgencies[urgency] ?? { label: urgency, variant: "secondary" as const }
}

const sources: Record<string, string> = {
  model: "Drafted by Claude",
  template: "The clinic's admin template",
  "urgent-template": "The clinic's urgent reply",
  clinician: "Written by the care team",
}

export function sourceLabel(source: string) {
  return sources[source] ?? source
}

const checks: Record<string, string> = {
  diagnosis: "A diagnosis",
  "medicine-change": "A change to a medicine",
  "medicine-not-in-record": "A medicine not in the record",
  "number-or-date": "A number or date not in the record",
  promise: "A promise",
  length: "Too long",
  "reading-level": "Too hard to read",
  "fill-ins": "Fill-ins",
}

export function checkLabel(check: string) {
  return checks[check] ?? check
}

const actions: Record<string, string> = {
  "fhir.fetched": "Fetched from the FHIR server",
  "message.received": "Message received",
  "message.flagged": "Red flag found",
  "message.sorted": "Sorted",
  "message.needs_person": "Left for a person",
  "draft.written": "Draft written",
  "draft.checked": "Checked",
  "draft.edited": "Edited",
  "draft.discarded": "Draft discarded",
  "draft.approved": "Approved",
  "reply.sent": "Reply sent",
  "reply.written_to_fhir": "Reply written to the FHIR server",
  "guidance.installed": "Guidance installed",
  "guidance.changed": "Guidance changed",
  login: "Logged in",
}

export function actionLabel(action: string) {
  return actions[action] ?? action
}

/** The steps the activity page can filter by. */
export const actionChoices = Object.entries(actions)
