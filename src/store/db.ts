/** The database: a pool, and the numbered SQL migrations in `migrations/`. */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import pg from "pg"

export type Db = pg.Pool
export type Tx = pg.PoolClient

const MIGRATIONS = join(import.meta.dirname, "../../migrations")

export function connect(url = process.env["DATABASE_URL"]): Db {
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)")
  return new pg.Pool({ connectionString: url, max: 10 })
}

/** Applies every migration not applied yet, in order, each in its own transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  )
  const done = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
  )
  const applied: string[] = []
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (done.has(name)) continue
    await transaction(db, async (tx) => {
      await tx.query(readFileSync(join(MIGRATIONS, name), "utf8"))
      await tx.query("insert into schema_migrations (name) values ($1)", [name])
    })
    applied.push(name)
  }
  return applied
}

/** Runs `work` in one transaction: all of it is saved, or none of it. */
export async function transaction<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect()
  try {
    await tx.query("begin")
    const result = await work(tx)
    await tx.query("commit")
    return result
  } catch (error) {
    await tx.query("rollback")
    throw error
  } finally {
    tx.release()
  }
}
