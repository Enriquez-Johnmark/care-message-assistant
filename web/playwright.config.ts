import { defineConfig, devices } from "@playwright/test"

// Browser tests of the review journey, against a running Care Message
// Assistant (the API server with the built app, Postgres, Mailpit and HAPI
// FHIR) with the made-up clinic and its staff. CI sets them up.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: process.env.CHROMIUM_PATH },
      },
    },
  ],
})
