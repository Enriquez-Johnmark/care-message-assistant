/**
 * The clinic's FHIR server: loading the made-up data into it, and fetching
 * every patient, record and message back. Only a server on this computer is
 * accepted for loading, so made-up data is never written anywhere public.
 * Every request has a time limit and every answer a size limit, and next
 * pages are followed only on the same server.
 */

import type { DemoMessage, DemoPatient } from "../demo.ts"
import { CLINIC_TAG, messageResource, patientResources, type Resource } from "./build.ts"

const TIMEOUT_MS = 20_000
const MAX_BYTES = 5_000_000
const MAX_PAGES = 40

export class FhirError extends Error {}

/** A FHIR server's base address, e.g. `http://127.0.0.1:8090/fhir`. */
export class FhirServer {
  readonly base: URL

  constructor(base: string) {
    const url = new URL(base.replace(/\/+$/, ""))
    if (url.protocol !== "https:" && !isThisComputer(url)) {
      throw new FhirError(`${base}: only https, or a server on this computer`)
    }
    this.base = url
  }

  /** Writes the made-up patients and messages, each by its own ID, so loading
   *  again changes nothing. Refused unless the server is on this computer. */
  async loadMadeUp(patients: DemoPatient[], messages: DemoMessage[]): Promise<number> {
    if (!isThisComputer(this.base))
      throw new FhirError("made-up data is only loaded into a server on this computer")
    const resources = [...patients.flatMap(patientResources), ...messages.map(messageResource)]
    for (const resource of resources) await this.put(resource)
    return resources.length
  }

  async put(resource: Resource): Promise<void> {
    await this.request(`${resource.resourceType}/${resource.id}`, {
      method: "PUT",
      headers: { "content-type": "application/fhir+json" },
      body: JSON.stringify(resource),
    })
  }

  /** Creates `resource` only if none with `identifier` (`system|value`) exists:
   *  writing the same reply twice makes one. */
  async createOnce(resource: Omit<Resource, "id">, identifier: string): Promise<void> {
    await this.request(String(resource.resourceType), {
      method: "POST",
      headers: { "content-type": "application/fhir+json", "if-none-exist": `identifier=${identifier}` },
      body: JSON.stringify(resource),
    })
  }

  /** Every resource of the clinic: its patients with their records, and the
   *  patients' messages. */
  async fetchClinic(): Promise<unknown[]> {
    const tag = `_tag=${encodeURIComponent(`${CLINIC_TAG.system}|${CLINIC_TAG.code}`)}`
    const patients = await this.search(
      `Patient?${tag}&_revinclude=Condition:subject&_revinclude=MedicationRequest:subject` +
        `&_revinclude=AllergyIntolerance:patient&_revinclude=Observation:subject&_revinclude=Appointment:actor&_count=50`,
    )
    const messages = await this.search(`Communication?${tag}&_count=100`)
    return [...patients, ...messages]
  }

  /** Every resource a search finds, following next pages on this server only. */
  async search(query: string): Promise<unknown[]> {
    const found: unknown[] = []
    let next: string | undefined = query
    for (let page = 0; next !== undefined; page++) {
      if (page >= MAX_PAGES) throw new FhirError(`more than ${MAX_PAGES} pages`)
      const bundle = (await this.request(next, { method: "GET" })) as {
        resourceType?: string
        entry?: { resource?: unknown }[]
        link?: { relation?: string; url?: string }[]
      }
      if (bundle.resourceType !== "Bundle") throw new FhirError("the answer isn't a FHIR Bundle")
      for (const entry of bundle.entry ?? []) if (entry.resource !== undefined) found.push(entry.resource)
      const link = bundle.link?.find((l) => l.relation === "next")?.url
      next = link === undefined ? undefined : this.sameServer(link)
    }
    return found
  }

  private sameServer(link: string): string {
    const url = new URL(link, this.base)
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname)) {
      throw new FhirError(`a next page on another server: ${url.origin}`)
    }
    return url.toString()
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = path.startsWith("http") ? path : `${this.base.toString()}/${path}`
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" })
    } catch (error) {
      throw new FhirError(
        `${this.base.host} didn't answer: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    const body = await response.text()
    if (body.length > MAX_BYTES) throw new FhirError(`an answer over ${MAX_BYTES} bytes`)
    if (!response.ok)
      throw new FhirError(`${init.method ?? "GET"} ${path}: ${response.status} ${body.slice(0, 200)}`)
    if (body.trim() === "") return {}
    try {
      return JSON.parse(body) as unknown
    } catch {
      throw new FhirError("the answer isn't JSON")
    }
  }
}

function isThisComputer(url: URL): boolean {
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
}
