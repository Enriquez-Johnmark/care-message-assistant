import { afterEach, describe, expect, it, vi } from "vitest"

import { api, ApiError } from "@/api/client"

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

describe("api", () => {
  it("returns the API's JSON", async () => {
    answer(200, { who: "staff", name: "Dr. Example Lee" })
    await expect(api("GET", "/api/me")).resolves.toEqual({ who: "staff", name: "Dr. Example Lee" })
  })

  it("sends a body as JSON from the same origin", async () => {
    answer(200, {})
    await api("POST", "/api/login", { email: "dr.lee@clinic.example.test" })
    expect(fetch).toHaveBeenCalledWith("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: '{"email":"dr.lee@clinic.example.test"}',
    })
  })

  it("accepts a success with no body, such as 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(api("POST", "/api/logout")).resolves.toBeUndefined()
  })

  it("turns a refusal into an ApiError with the API's words and code", async () => {
    answer(409, { error: "The reply changed since you read it.", code: "changed" })
    const error = await api("POST", "/api/drafts/1/approve", {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      message: "The reply changed since you read it.",
      code: "changed",
    })
  })

  it("explains an answer that isn't from the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })))
    const error = (await api("GET", "/api/me").catch((e: unknown) => e)) as ApiError
    expect(error.message).toMatch(/couldn't be reached/)
  })
})
