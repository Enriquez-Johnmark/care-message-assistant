import { defineConfig } from "vitest/config"

// Database tests each get their own database, so files run in parallel. The
// made-up data goes onto the FHIR server once, before any file runs.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    testTimeout: 30_000,
  },
})
