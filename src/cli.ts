/** The `care-message-assistant` commands (`pnpm cli <command>`). */

import { readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { demoMessages, demoPatients } from "./demo.ts"
import { build, gaps, html, type Results } from "./evidence.ts"
import { FhirServer } from "./fhir/client.ts"
import { read } from "./fhir/reader.ts"

const USAGE = `usage: pnpm cli load-made-up [--url URL]
       pnpm cli fetch [--url URL]
       pnpm cli evidence --results FILE --commit SHA [--out FILE]`

const fhirUrl = (url: string | undefined) => url ?? process.env["FHIR_URL"] ?? "http://127.0.0.1:8090/fhir"

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  const { values } = parseArgs({
    args: rest,
    options: {
      url: { type: "string" },
      results: { type: "string" },
      commit: { type: "string" },
      out: { type: "string" },
    },
  })
  switch (command) {
    case "load-made-up": {
      // Every demo message's patient is loaded; the inbox holds the 30 demo messages.
      const messages = demoMessages().filter((m) => m.demo)
      const count = await new FhirServer(fhirUrl(values.url)).loadMadeUp(demoPatients(), messages)
      console.log(`loaded ${count} made-up resources into ${fhirUrl(values.url)}`)
      return 0
    }
    case "fetch": {
      const result = read(await new FhirServer(fhirUrl(values.url)).fetchClinic())
      console.log(
        `${result.records.length} patients, ${result.messages.length} messages, ${result.refused.length} refused`,
      )
      for (const refused of result.refused) console.log(`  ${refused.resource}: ${refused.reason}`)
      return 0
    }
    case "evidence": {
      if (!values.results || !values.commit) break
      const rows = build(
        readFileSync("docs/product/spec.md", "utf8"),
        readFileSync("docs/architecture.md", "utf8"),
        JSON.parse(readFileSync(values.results, "utf8")) as Results,
      )
      writeFileSync(values.out ?? "evidence.html", html(rows, values.commit))
      const missing = gaps(rows)
      for (const gap of missing) console.error(`gap: ${gap}`)
      console.log(`${rows.filter((r) => r.status === "proven").length} of ${rows.length} criteria proven`)
      return missing.length === 0 ? 0 : 1
    }
  }
  console.error(USAGE)
  return 2
}

process.exitCode = await main(process.argv.slice(2))
