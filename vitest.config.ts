import { defineConfig } from "vitest/config"

// Database tests each get their own database, so files run in parallel.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 } })
