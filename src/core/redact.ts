/**
 * Takes who the patient is out of their message before it goes to a model
 * (A2): their names, birth date, phone, email and address, wherever the
 * patient wrote them, in any case.
 */

import type { Person } from "../fhir/reader.ts"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Every way a birth date like 1950-02-03 might be written. */
function birthDates(iso: string): string[] {
  const [year = "", month = "", day = ""] = iso.split("-")
  const m = String(Number(month))
  const d = String(Number(day))
  const yy = year.slice(2)
  const monthName = MONTHS[Number(month) - 1] ?? ""
  return [
    `${monthName} ${d}, ${year}`,
    `${monthName.slice(0, 3)} ${d}, ${year}`,
    `${monthName} ${d} ${year}`,
    `${monthName.slice(0, 3)} ${d} ${year}`,
    `${d} ${monthName} ${year}`,
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
  // A phone number however it is punctuated, with or without a country code:
  // its last ten digits in order.
  const digits = person.phone.replace(/\D/g, "").slice(-10)
  if (digits.length >= 7) {
    const pattern = digits.split("").join("[\\s().-]*")
    out = out.replace(new RegExp(`(?:\\+?1[\\s.-]*)?\\(?${pattern}`, "g"), "[phone]")
  }
  for (const name of [person.given, person.family]) {
    // Each part of a hyphenated or two-part name, and the name without its
    // apostrophe ("O'Brien" as "OBrien").
    const parts = name.split(/[\s-]+/).filter((part) => part.length > 1)
    for (const part of [name.replace(/['’]/g, ""), ...parts, ...parts.map((p) => p.replace(/['’]/g, ""))]) {
      if (part.length > 1) replace(part, "name")
    }
  }
  return out
}
