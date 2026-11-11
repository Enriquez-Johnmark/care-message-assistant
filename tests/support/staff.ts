/** The made-up clinic's staff, added to a test database. */

import type { Db } from "../../src/store/db.ts"
import type { Staff } from "../../src/review.ts"

export async function addStaff(db: Db): Promise<{ clinician: Staff; frontDesk: Staff; admin: Staff }> {
  const add = async (email: string, name: string, role: Staff["role"]) => {
    const row = await db.query<{ id: string }>(
      "insert into staff (email, name, role) values ($1, $2, $3) returning id",
      [email, name, role],
    )
    return { id: row.rows[0]?.id ?? "", email, name, role }
  }
  return {
    clinician: await add("dr.lee@clinic.example.test", "Dr. Example Lee", "clinician"),
    frontDesk: await add("desk@clinic.example.test", "Example Front Desk", "front-desk"),
    admin: await add("admin@clinic.example.test", "Example Administrator", "administrator"),
  }
}
