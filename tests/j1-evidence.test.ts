import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { build, criteria, gaps, html } from "../src/evidence.ts"

const spec = `### A
- **A1** The data is made up.
- **A2** The model sees no names.
- **B1** Red flags are caught.
`
const architecture = `| Milestone | What | Criteria | Status |
|---|---|---|---|
| M1 | Data | A1, A2 | done (2026-11-11) |
| M2 | Flags | B1 | planned |
`
const results = (tests: { title: string; status: string }[]) => ({
  testResults: [{ assertionResults: tests.map((t) => ({ ...t, fullName: `x ${t.title}` })) }],
})

describe("j1 the evidence pack", () => {
  it("j1 links each criterion to its passing tests by the test's name", () => {
    const evidence = build(
      spec,
      architecture,
      results([
        { title: "a1 the data is the same every time", status: "passed" },
        { title: "a2 no name reaches the model", status: "passed" },
      ]),
    )

    expect(evidence.map((row) => [row.id, row.status])).toEqual([
      ["A1", "proven"],
      ["A2", "proven"],
      ["B1", "not yet due"],
    ])
    expect(gaps(evidence)).toEqual([])
    expect(html(evidence, "abc123")).toContain("2 of 3 acceptance criteria proven")
  })

  it("j1 a finished milestone's criterion with no passing test is a gap", () => {
    const evidence = build(spec, architecture, results([{ title: "a1 the data", status: "failed" }]))

    expect(gaps(evidence)).toEqual(["A1 (M1): a test failed", "A2 (M1): no test"])
  })

  it("j1 every criterion in the spec is in a milestone", () => {
    const ids = criteria(readFileSync("docs/product/spec.md", "utf8")).map((c) => c.id)
    const evidence = build(
      readFileSync("docs/product/spec.md", "utf8"),
      readFileSync("docs/architecture.md", "utf8"),
      {
        testResults: [],
      },
    )

    expect(ids).toHaveLength(37)
    expect(evidence.filter((row) => row.milestone === "")).toEqual([])
  })
})
