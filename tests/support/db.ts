/** A fresh database for each test file, with every migration applied. */

import { randomUUID } from "node:crypto"

import pg from "pg"
import { afterAll } from "vitest"

import { connect, migrate, type Db } from "../../src/store/db.ts"

const base =
  process.env["DATABASE_URL"] ?? "postgres://care_messages:care_messages@localhost:5432/care_messages"

export async function freshDb(): Promise<Db> {
  const name = `test_${randomUUID().replaceAll("-", "")}`
  const admin = new pg.Client({ connectionString: base })
  await admin.connect()
  await admin.query(`create database ${name}`)
  await admin.end()
  const url = new URL(base)
  url.pathname = `/${name}`
  const db = connect(url.toString())
  await migrate(db)
  afterAll(async () => {
    await db.end()
    const cleanup = new pg.Client({ connectionString: base })
    await cleanup.connect()
    await cleanup.query(`drop database if exists ${name} with (force)`)
    await cleanup.end()
  })
  return db
}
