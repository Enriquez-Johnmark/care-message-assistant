/**
 * The repository check behind A3: every FHIR file in the repository is
 * marked as made-up test data, and nothing outside the research documents
 * (`docs/research/`, which cite sources) names a real record-system,
 * AI-drafting or health-system company.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/** Real companies the code, data and docs must not name; matched ignoring case. */
const REAL_COMPANIES = [
  "Epic Systems",
  "MyChart",
  "Cerner",
  "Oracle Health",
  "athenahealth",
  "eClinicalWorks",
  "NextGen Healthcare",
  "Allscripts",
  "Veradigm",
  "Nabla",
  "Abridge",
  "Nuance Communications",
  "Affineon",
  "Kaiser Permanente",
  "Mayo Clinic",
  "Cleveland Clinic",
  "Mass General Brigham",
]

/** Folders skipped: dependencies, build output and version control. */
const SKIPPED = new Set(["node_modules", ".git", "dist", "coverage", "test-results", "playwright-report"])

/** The research documents, which may name real companies (decided 2026-11-11). */
const RESEARCH = "docs/research/"

/** This check and its test name what they look for. */
const SELF = new Set(["src/made-up.ts", "tests/a3-made-up.test.ts"])

/** HL7's "test health data" security label. */
export const TEST_DATA = { system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "HTEST" }

/** Every problem found under `root`, one line each, as `path: problem`, sorted. */
export function problems(root: string): string[] {
  const found: string[] = []
  visit(root, root, found)
  return found.sort()
}

function visit(root: string, dir: string, found: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (!SKIPPED.has(name)) visit(root, path, found)
      continue
    }
    const shown = relative(root, path).split(sep).join("/")
    if (SELF.has(shown)) continue
    let text: string
    try {
      text = readFileSync(path, "utf8")
    } catch {
      continue
    }
    if (shown.endsWith(".json") && !markedAsTestData(text)) {
      found.push(`${shown}: a FHIR resource not marked as test data (HTEST)`)
    }
    if (shown.startsWith(RESEARCH)) continue
    const lower = text.toLowerCase()
    const company = REAL_COMPANIES.find((c) => lower.includes(c.toLowerCase()))
    if (company) found.push(`${shown}: names a real company (${company})`)
  }
}

/** Whether a JSON file is either not FHIR or a FHIR resource (or bundle) whose
 *  every resource carries the test-data label. */
function markedAsTestData(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return true
  }
  const resources = fhirResources(value)
  return resources.every((resource) => {
    const meta = resource["meta"] as { security?: { system?: string; code?: string }[] } | undefined
    return (meta?.security ?? []).some((s) => s.system === TEST_DATA.system && s.code === TEST_DATA.code)
  })
}

function fhirResources(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return []
  const record = value as Record<string, unknown>
  if (typeof record["resourceType"] !== "string") return []
  if (record["resourceType"] === "Bundle" && Array.isArray(record["entry"])) {
    return (record["entry"] as { resource?: unknown }[]).flatMap((entry) => fhirResources(entry.resource))
  }
  return [record]
}
