import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { problems } from "../src/made-up.ts"

function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "made-up-"))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe("a3 the repository names no real company and holds no real patient", () => {
  it("a3 the repository itself passes", () => {
    expect(problems(process.cwd())).toEqual([])
  })

  it("a3 a real company outside the research documents is found, inside them it is allowed", () => {
    const root = folder({
      "README.md": "Works like Epic Systems' inbox.",
      "docs/research/README.md": "Epic Systems offers drafts (vendor claim).",
    })
    expect(problems(root)).toEqual(["README.md: names a real company (Epic Systems)"])
  })

  it("a3 a FHIR resource not marked as test data is found", () => {
    const root = folder({
      "demo/patient.json": JSON.stringify({ resourceType: "Patient", id: "x" }),
      "demo/marked.json": JSON.stringify({
        resourceType: "Patient",
        id: "y",
        meta: { security: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "HTEST" }] },
      }),
    })
    expect(problems(root)).toEqual(["demo/patient.json: a FHIR resource not marked as test data (HTEST)"])
  })
})
