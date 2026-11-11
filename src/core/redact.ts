/**
 * Takes who the patient is out of their message before it goes to a model
 * (A2): their names, birth date, phone, email and address, wherever the
 * patient wrote them, in any case.
 */

import type { Person } from "../fhir/reader.ts"

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Every way a birth date like 1950-02-03 might be written. */
function birthDates(iso: string): string[] {
  const [year = "", month = "", day = ""] = iso.split("-")
  const m = String(Number(month))
  const d = String(Number(day))
  const yy = year.slice(2)
  return [
    iso,
    `${month}/${day}/${year}`,
    `${m}/${d}/${year}`,
    `${m}/${d}/${yy}`,
    `${month}/${day}/${yy}`,
    `${m}-${d}-${year}`,
    `${month}-${day}-${year}`,
  ]
}

/** `text` with the person's identifying details replaced by what they are. */
export function redact(text: string, person: Person): string {
  let out = text
  const replace = (value: string, label: string, whole = true) => {
    if (value.trim() === "") return
    const body = escape(value.trim())
    const pattern = whole ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body
    out = out.replace(new RegExp(pattern, "giu"), `[${label}]`)
  }
  replace(person.email, "email", false)
  replace(person.address, "address", false)
  // The street part alone ("5 Example Street"), as patients often write it.
  replace(person.address.split(",")[0] ?? "", "address", false)
  for (const date of birthDates(person.birthDate)) replace(date, "date of birth")
  // A phone number however it is punctuated: the same ten digits in order.
  const digits = person.phone.replace(/\D/g, "")
  if (digits.length >= 7) {
    const pattern = digits.split("").join("[\\s().-]*")
    out = out.replace(new RegExp(`\\(?${pattern}`, "g"), "[phone]")
  }
  for (const name of [person.given, person.family]) {
    for (const part of name.split(/\s+/)) if (part.length > 1) replace(part, "name")
  }
  return out
}
