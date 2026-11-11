// The shapes the API sends, as src/api/server.ts builds them.

export type Role = "administrator" | "clinician" | "front-desk"

export type Me =
  { who: "staff"; name: string; email: string; role: Role } | { who: "patient"; name: string }

export interface RedFlag {
  category: string
  found: string
}

export interface QueueRow {
  id: string
  patient: string
  subject: string
  sentAt: string
  type: string | null
  urgency: "urgent" | "soon" | "routine"
  redFlags: RedFlag[]
  needsPerson: string | null
  draftSource: string | null
  draftPassed: boolean | null
}

export interface Problem {
  check: string
  found: string
}

export interface Draft {
  id: string
  source: "model" | "template" | "urgent-template" | "clinician"
  text: string
  problems: Problem[]
  grade: number
  guidanceVersion: number | null
  model: string | null
  contentHash: string
}

export interface Facts {
  conditions: { name: string; since: string }[]
  medications: { name: string; dose: string; frequency: string }[]
  allergies: { substance: string; reaction: string }[]
  observations: {
    name: string
    value: number
    unit: string
    date: string
    low?: number
    high?: number
  }[]
  appointments: { start: string; kind: string; with: string }[]
}

export interface Entry {
  at: string
  actor: string
  action: string
  subjectType: string
  subjectId: string
  details: Record<string, unknown>
}

export interface MessageDetail {
  id: string
  subject: string
  text: string
  sentAt: string
  type: string | null
  urgency: "urgent" | "soon" | "routine"
  redFlags: RedFlag[]
  needsPerson: string | null
  status: "open" | "answered"
  patient: { name: string; birthDate: string; facts: Facts }
  draft: Draft | null
  reply: { text: string; sentAt: string; approvedBy: string } | null
  timeline: Entry[]
}

export interface Edited {
  id: string
  text: string
  problems: Problem[]
}

export interface Guidance {
  version: number
  text: string
}

export interface PortalMessage {
  id: string
  subject: string
  text: string
  sentAt: string
  reply: { text: string; sentAt: string } | null
}

export interface Fetched {
  patients: number
  messages: Record<string, number>
  refused: { resource: string; reason: string }[]
}
