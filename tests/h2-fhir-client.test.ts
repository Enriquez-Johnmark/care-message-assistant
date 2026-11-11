import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, describe, expect, it } from "vitest"

import { demoMessages, demoPatients } from "../src/demo.ts"
import { FhirError, FhirServer } from "../src/fhir/client.ts"

const servers: { close: () => void }[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

/** A stand-in FHIR server on this computer; returns its address and what it was asked. */
async function standIn(answer: (req: IncomingMessage, res: ServerResponse) => void) {
  const asked: { method: string; url: string }[] = []
  const server = createServer((req, res) => {
    asked.push({ method: req.method ?? "", url: req.url ?? "" })
    req.resume()
    answer(req, res)
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  servers.push(server)
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked }
}

const emptyBundle = (_: IncomingMessage, res: ServerResponse) => {
  res.setHeader("content-type", "application/fhir+json")
  res.end(JSON.stringify({ resourceType: "Bundle", type: "searchset", entry: [] }))
}

describe("h2 the FHIR client", () => {
  it("h2 a base address with no path never makes a double slash", async () => {
    const { url, asked } = await standIn(emptyBundle)

    await new FhirServer(url).search("Patient?_count=1")

    expect(asked[0]?.url).toBe("/Patient?_count=1")
  })

  it("h2 an answer over the size limit is refused as it streams in", async () => {
    const { url } = await standIn((_, res) => {
      const chunk = "x".repeat(1_000_000)
      for (let i = 0; i < 8; i++) res.write(chunk)
      res.end()
    })

    await expect(new FhirServer(url).search("Patient")).rejects.toThrow(FhirError)
  })

  it("h2 the made-up data is loaded in one transaction", async () => {
    const { url, asked } = await standIn((_, res) => {
      res.setHeader("content-type", "application/fhir+json")
      res.end(JSON.stringify({ resourceType: "Bundle", type: "transaction-response", entry: [] }))
    })

    await new FhirServer(url).loadMadeUp(
      demoPatients(),
      demoMessages().filter((m) => m.demo),
    )

    expect(asked).toEqual([{ method: "POST", url: "/" }])
  })
})
