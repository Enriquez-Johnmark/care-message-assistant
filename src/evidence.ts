/**
 * The evidence pack (J1): each acceptance criterion in the spec, the tests
 * that prove it (found by the test's name, which starts with the
 * criterion's ID), and whether they passed. A criterion of a milestone
 * marked done needs at least one passing test.
 */

export type Status = "proven" | "failing" | "missing" | "not yet due"

export interface Row {
  id: string
  text: string
  milestone: string
  tests: { name: string; passed: boolean }[]
  status: Status
}

/** Vitest's JSON results (`--reporter=json`). */
export interface Results {
  testResults: { assertionResults: { title: string; fullName: string; status: string }[] }[]
}

/** The criteria in the spec, from lines like `- **A1** The text.` */
export function criteria(spec: string): { id: string; text: string }[] {
  return [...spec.matchAll(/^- \*\*([A-Z]\d+)\*\* (.+)$/gm)].map((m) => ({
    id: m[1] ?? "",
    text: (m[2] ?? "").trim(),
  }))
}

/** The milestones in the build order, from rows like `| M1 | What | A1, B1–B3 | done |`. */
export function milestones(architecture: string): { name: string; ids: string[]; done: boolean }[] {
  return [...architecture.matchAll(/^\| (M\d+) \| [^|]+ \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({
    name: m[1] ?? "",
    ids: expand(m[2] ?? ""),
    done: (m[3] ?? "").trim().startsWith("done"),
  }))
}

/** `A1, B1–B3` → A1, B1, B2, B3. */
function expand(list: string): string[] {
  return list.split(",").flatMap((part) => {
    const range = /^([A-Z])(\d+)[–-]([A-Z])?(\d+)$/.exec(part.trim())
    if (!range) return /^[A-Z]\d+$/.test(part.trim()) ? [part.trim()] : []
    const [, letter = "", from = "0", , to = "0"] = range
    return Array.from({ length: Number(to) - Number(from) + 1 }, (_, i) => `${letter}${Number(from) + i}`)
  })
}

export function build(spec: string, architecture: string, results: Results): Row[] {
  const plan = milestones(architecture)
  const tests = results.testResults.flatMap((file) => file.assertionResults)
  return criteria(spec).map(({ id, text }) => {
    const milestone = plan.find((m) => m.ids.includes(id))
    const prefix = `${id.toLowerCase()} `
    const own = tests
      .filter((t) => t.title.toLowerCase().startsWith(prefix))
      .map((t) => ({ name: t.fullName, passed: t.status === "passed" }))
    const status: Status = own.some((t) => !t.passed)
      ? "failing"
      : !milestone?.done
        ? "not yet due"
        : own.length === 0
          ? "missing"
          : "proven"
    return { id, text, milestone: milestone?.name ?? "", tests: own, status }
  })
}

/** What fails the build: a criterion in no milestone, or a finished
 *  milestone's criterion with no passing test. */
export function gaps(rows: Row[]): string[] {
  return rows.flatMap((row) => {
    if (row.milestone === "") return [`${row.id}: in no milestone`]
    if (row.status === "missing") return [`${row.id} (${row.milestone}): no test`]
    if (row.status === "failing") return [`${row.id} (${row.milestone}): a test failed`]
    return []
  })
}

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

export function html(rows: Row[], commit: string): string {
  const proven = rows.filter((r) => r.status === "proven").length
  const body = rows
    .map((row) => {
      const tests = row.tests.map((t) => `${t.passed ? "✓" : "✗"} ${escape(t.name)}`).join("<br>")
      return `<tr><td><b>${escape(row.id)}</b> ${escape(row.text)}</td><td>${escape(row.milestone)}</td><td>${tests}</td><td>${row.status}</td></tr>`
    })
    .join("\n")
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evidence pack</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:.4rem;text-align:left;vertical-align:top}</style></head><body>
<h1>Evidence pack</h1>
<p>Care Message Assistant, commit <code>${escape(commit)}</code>. ${proven} of ${rows.length} acceptance criteria proven. Made-up clinic, made-up patients.</p>
<table>
<tr><th>Criterion</th><th>Milestone</th><th>Tests</th><th>Status</th></tr>
${body}
</table>
</body></html>
`
}
