/** The `care-message-assistant` commands (`pnpm cli <command>`). */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"

import { z } from "zod"

import { server } from "./api/server.ts"
import { systemClock, type Clock } from "./clock.ts"
import { demoMessages, demoPatients } from "./demo.ts"
import { measure, report } from "./eval.ts"
import { build, gaps, html, type Results } from "./evidence.ts"
import { messageResource, patientResources } from "./fhir/build.ts"
import { read } from "./fhir/reader.ts"
import { fetchAndTakeIn } from "./fetch.ts"
import { FhirServer } from "./fhir/client.ts"
import { MailpitMailer } from "./mail.ts"
import { ClaudeModel, RecordedModel, RecordingModel, removeUnused, type Model } from "./model/client.ts"
import { MODEL } from "./model/questions.ts"
import { writeReplies } from "./sending.ts"
import { connect, migrate } from "./store/db.ts"

const USAGE = `usage: pnpm cli migrate
       pnpm cli add-staff --email EMAIL --name NAME --role administrator|clinician|front-desk
       pnpm cli load-made-up [--url URL]
       pnpm cli fetch [--url URL] [--recorded]
       pnpm cli serve [--recorded]
       pnpm cli eval [--record]
       pnpm cli evidence --results FILE --commit SHA [--out FILE]`

const clock = (): Clock => systemClock
const fhirUrl = (url: string | undefined) => url ?? process.env["FHIR_URL"] ?? "http://127.0.0.1:8090/fhir"

/** Recorded answers (`--recorded`: no key, no cost), else Claude with the
 *  owner's key if it is set, else no model: messages wait for a person. */
function chooseModel(recorded: boolean): Model | null {
  if (recorded) return new RecordedModel(MODEL)
  return process.env["OWNER_ANTHROPIC_API_KEY"] ? new ClaudeModel(MODEL) : null
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  const { values } = parseArgs({
    args: rest,
    options: {
      url: { type: "string" },
      results: { type: "string" },
      commit: { type: "string" },
      out: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
      recorded: { type: "boolean" },
      record: { type: "boolean" },
    },
  })
  switch (command) {
    case "migrate": {
      const db = connect()
      const applied = await migrate(db)
      await db.end()
      console.log(applied.length === 0 ? "up to date" : `applied ${applied.join(", ")}`)
      return 0
    }
    case "add-staff": {
      const role = z.enum(["administrator", "clinician", "front-desk"]).parse(values.role)
      if (!values.email || !values.name) break
      const db = connect()
      await db.query(
        `insert into staff (email, name, role) values ($1, $2, $3)
         on conflict (email) do update set name = excluded.name, role = excluded.role`,
        [values.email.trim().toLowerCase(), values.name.trim(), role],
      )
      await db.end()
      console.log(`${values.name} <${values.email}> is a ${role}`)
      return 0
    }
    case "load-made-up": {
      // Every patient is loaded; the inbox holds the 30 demo messages.
      const messages = demoMessages().filter((m) => m.demo)
      const count = await new FhirServer(fhirUrl(values.url)).loadMadeUp(demoPatients(), messages)
      console.log(`loaded ${count} made-up resources into ${fhirUrl(values.url)}`)
      return 0
    }
    case "fetch": {
      const db = connect()
      const fetched = await fetchAndTakeIn(
        { db, clock: clock(), model: chooseModel(values.recorded === true) },
        new FhirServer(fhirUrl(values.url)),
        "operator",
      )
      await db.end()
      console.log(`${fetched.patients} patients; messages: ${JSON.stringify(fetched.messages)}`)
      for (const refused of fetched.refused) console.log(`  ${refused.resource}: ${refused.reason}`)
      return 0
    }
    case "serve": {
      const db = connect()
      await migrate(db)
      const bind = process.env["BIND_ADDR"] ?? "127.0.0.1:3000"
      const [host = "127.0.0.1", port = "3000"] = bind.split(":")
      const baseUrl = process.env["PUBLIC_BASE_URL"] ?? `http://${bind}`
      const model = chooseModel(values.recorded === true)
      const fhir = new FhirServer(fhirUrl(values.url))
      const app = server({
        db,
        clock: clock(),
        mailer: new MailpitMailer(),
        model,
        fhir,
        baseUrl,
        webDir: process.env["WEB_DIR"] ?? join(import.meta.dirname, "../web/dist"),
      })
      await app.listen({ host, port: Number(port) })
      console.log(`serving on ${baseUrl}; drafting with ${model?.name ?? "no model"}`)
      // The worker: new messages are fetched and taken in every minute.
      const tick = Number(process.env["WORKER_TICK_SECS"] ?? "60") * 1000
      setInterval(() => {
        fetchAndTakeIn({ db, clock: clock(), model }, fhir).catch((error: unknown) => {
          console.error("fetching failed:", error instanceof Error ? error.message : error)
        })
      }, tick)
      // Approved replies are written to the FHIR server within seconds (F4).
      setInterval(() => {
        writeReplies({ db, clock: clock() }, fhir).catch((error: unknown) => {
          console.error("writing replies failed:", error instanceof Error ? error.message : error)
        })
      }, 5_000)
      return await new Promise<number>(() => undefined)
    }
    case "eval": {
      // The labelled messages, read as from the FHIR server.
      const fromFhir = read([
        ...demoPatients().flatMap(patientResources),
        ...demoMessages().map(messageResource),
      ])
      const labelled = demoMessages().flatMap((label) => {
        const message = fromFhir.messages.find((m) => m.key === label.id)
        const record = fromFhir.records.find((r) => r.person.fhirId === message?.patientFhirId)
        return message && record ? [{ label, message, record }] : []
      })
      const live = values.record === true ? new RecordingModel(new ClaudeModel(MODEL)) : undefined
      const measured = await measure(live ?? new RecordedModel(MODEL), labelled)
      if (live) {
        console.log(`asked Claude ${String(live.liveCalls)} time(s); the rest were recorded`)
        console.log(`removed ${String(removeUnused(live.used))} recording(s) no question uses any more`)
      }
      const text = report(measured)
      writeFileSync("evalset/report.md", text)
      console.log(text)
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
