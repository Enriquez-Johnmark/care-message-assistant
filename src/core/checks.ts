/**
 * The checks every draft passes before a clinician sees it (D1–D7), and
 * again on every edit. Each problem names its check and what it found.
 * The checks read the draft against the patient's message and record, so a
 * medicine, number or date the record doesn't hold is caught.
 */

import type { RecordFacts } from "../fhir/reader.ts"

export const CHECKS = [
  "diagnosis",
  "medicine-change",
  "medicine-not-in-record",
  "number-or-date",
  "promise",
  "length",
  "reading-level",
  "fill-ins",
] as const
export type Check = (typeof CHECKS)[number]

export interface Problem {
  check: Check
  found: string
}

export interface Checked {
  problems: Problem[]
  grade: number
  words: number
}

export interface Context {
  facts: RecordFacts
  /** The patient's message: a number or date the patient wrote may be repeated. */
  message: string
  /** The clinic's own words (its urgent reply, a clinician's text) may give
   *  the emergency lines 911 and 988; a model's draft may not. */
  emergencyLines?: boolean
}

/** The fill-ins a draft may use; code fills them in. */
export const FILL_INS = ["first_name"] as const

export const MAX_WORDS = 150
export const MAX_GRADE = 8

/** Conditions a draft must not tell the patient they have. */
const CONDITIONS = [
  "infection",
  "ear infection",
  "sinus infection",
  "urinary tract infection",
  "uti",
  "flu",
  "influenza",
  "covid",
  "a cold",
  "pneumonia",
  "bronchitis",
  "sinusitis",
  "strep",
  "strep throat",
  "sprain",
  "fracture",
  "kidney stone",
  "diabetes",
  "hypertension",
  "high blood pressure",
  "heart failure",
  "heart disease",
  "depression",
  "anxiety",
  "cancer",
  "tumor",
  "migraine",
  "gout",
  "arthritis",
  "asthma",
  "copd",
  "an allergy",
  "allergic reaction",
  "ulcer",
  "reflux",
  "gerd",
  "anemia",
  "hypothyroidism",
  "a thyroid problem",
  "gastroenteritis",
  "a stomach bug",
  "a virus",
  "viral",
  "bacterial",
  "shingles",
  "cellulitis",
  "dehydration",
  "hypoglycemia",
  "low blood sugar",
  "neuropathy",
  "a side effect",
]

/** Medicines a draft might name; one not in the patient's record is blocked. */
export const MEDICINES = [
  "metformin",
  "lisinopril",
  "amlodipine",
  "losartan",
  "valsartan",
  "hydrochlorothiazide",
  "chlorthalidone",
  "atorvastatin",
  "rosuvastatin",
  "simvastatin",
  "pravastatin",
  "levothyroxine",
  "omeprazole",
  "pantoprazole",
  "famotidine",
  "sertraline",
  "fluoxetine",
  "escitalopram",
  "citalopram",
  "paroxetine",
  "bupropion",
  "venlafaxine",
  "duloxetine",
  "trazodone",
  "albuterol",
  "fluticasone",
  "montelukast",
  "tiotropium",
  "budesonide",
  "apixaban",
  "rivaroxaban",
  "warfarin",
  "clopidogrel",
  "aspirin",
  "metoprolol",
  "carvedilol",
  "atenolol",
  "propranolol",
  "furosemide",
  "spironolactone",
  "gabapentin",
  "pregabalin",
  "ibuprofen",
  "naproxen",
  "acetaminophen",
  "tylenol",
  "advil",
  "insulin",
  "glargine",
  "glipizide",
  "empagliflozin",
  "semaglutide",
  "sitagliptin",
  "sumatriptan",
  "tamsulosin",
  "prednisone",
  "amoxicillin",
  "azithromycin",
  "doxycycline",
  "cephalexin",
  "ciprofloxacin",
  "nitrofurantoin",
  "tramadol",
  "oxycodone",
  "hydrocodone",
  "lorazepam",
  "alprazolam",
  "clonazepam",
  "zolpidem",
  "loratadine",
  "cetirizine",
  "diphenhydramine",
  "colchicine",
  "allopurinol",
  "melatonin",
]

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
const RELATIVE_DAYS = ["tomorrow", "tonight", "next week", "next month", "this weekend", "this week"]

const alternation = (words: readonly string[]) =>
  words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
const CONDITION = alternation(CONDITIONS)
const MEDICINE = alternation(MEDICINES)

/** A condition word naming a thing, not a condition: "a flu shot", "an allergy test". */
const NOT_A_THING =
  "(?! (?:shot|shots|vaccine|vaccines|test|tests|testing|check|checkup|screening|appointment|visit|clinic|pack|medicine|medicines|season))"

const DIAGNOSIS = [
  new RegExp(
    `\\b(?:sounds|looks|seems) like(?: you have| you've got| it's| it is)?(?: a| an| the)? (?:${CONDITION})\\b${NOT_A_THING}`,
  ),
  new RegExp(
    `\\byou (?:have|'ve got|have got|likely have|probably have|may have|might have|could have)(?: an?)? (?:${CONDITION})\\b${NOT_A_THING}`,
  ),
  new RegExp(`\\b(?:most likely|probably|likely|definitely)(?: the| a| an)? (?:${CONDITION})\\b`),
  new RegExp(`\\bthis is(?: probably| likely| definitely)?(?: a| an| the)? (?:${CONDITION})\\b`),
  /\bconsistent with\b/,
  /\bdiagnos\w*/,
  /\byou are suffering from\b/,
]

const CHANGE_VERBS =
  "stop|stopping|quit|discontinue|increase|increasing|decrease|decreasing|reduce|raise|lower|double|halve|skip|skipping|cut back on|cut down on|cut back|cut down|hold off on|hold|pause|switch|start|starting|begin"
const CHANGE_TARGETS = `${MEDICINE}|dose|doses|dosage|medicine|medicines|medication|medications|pill|pills|tablet|tablets|insulin`
const MEDICINE_CHANGE = [
  // A verb and a medicine word a few words apart; "it" or "taking" only right after the verb.
  new RegExp(`\\b(?:${CHANGE_VERBS})(?: \\w+){0,4} (?:${CHANGE_TARGETS})\\b`),
  new RegExp(`\\b(?:${CHANGE_VERBS})(?: your| the)? (?:it|taking)\\b`),
  new RegExp(
    `\\btake (?:two|three|2|3|an extra|extra|half|double|another)(?: \\w+){0,2} (?:dose|doses|pill|pills|tablet|tablets|of (?:your|my|the)|${MEDICINE})\\b`,
  ),
]
const NOT_A_CHANGE = /\b(?:don't|dont|do not|never|please don't|please do not)\s*$/

const PROMISES = [
  /\b(?:we|i|someone|a nurse|the nurse|the doctor|your doctor|dr \w+|our team|the clinic|the office)(?: will|'ll| shall) (?:call|phone|contact|get back|reach out|text|email|follow up|see you|send)\b/,
  /\b(?:we|i|someone|a nurse|the nurse|the doctor|your doctor|our team|the clinic|the office)(?: will|'ll) (?:be (?:calling|contacting|in touch|reaching out|getting back)|give you a (?:call|ring)|get in touch)\b/,
  /\bwithin \d+ (?:hours?|days?|minutes?|weeks?)\b/,
  /\bguarantee\w*/,
  /\bpromise\w*/,
  /\bwill (?:clear up|go away|resolve|get better|be fine|be okay|be ok|heal|improve|pass)\b/,
  /\bnothing to worry about\b/,
  /\byou(?:'ll| will) be (?:fine|okay|ok|alright|all right)\b/,
  /\b(?:by|before) (?:today|tomorrow|tonight|end of day|the end of the day)\b/,
]

/** A clock time, read whole even with "am" or "pm" stuck to it ("9:30am"). */
const TIME = /(?<!\d)\d{1,2}:\d{2}(?!\d)/g

const lower = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'")

/** The draft's words, with fill-ins read as short names. */
function plain(draft: string): string {
  return draft.replaceAll("{first_name}", "Ana")
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w))
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (w === "") return 1
  let count = 0
  let inVowels = false
  for (const c of w) {
    const vowel = "aeiouy".includes(c)
    if (vowel && !inVowels) count++
    inVowels = vowel
  }
  if (w.endsWith("e") && !w.endsWith("le") && count > 1) count--
  return Math.max(count, 1)
}

/** The Flesch–Kincaid grade, with fill-ins read as short names, so the same
 *  draft always scores the same. */
export function readingGrade(draft: string): number {
  const text = plain(draft)
  const all = words(text)
  if (all.length === 0) return 0
  const sentences = Math.max(text.split(/[.!?]+/).filter((s) => /[A-Za-z]/.test(s)).length, 1)
  const syllableCount = all.reduce((sum, w) => sum + syllables(w), 0)
  const grade = 0.39 * (all.length / sentences) + 11.8 * (syllableCount / all.length) - 15.59
  return Math.round(grade * 10) / 10
}

/** Every number and date word a draft may repeat: from the message and the record. */
function allowed(context: Context): { numbers: Set<string>; dateWords: Set<string>; times: Set<string> } {
  const { facts, message } = context
  const numbers = new Set<string>()
  const dateWords = new Set<string>()
  const times = new Set<string>()
  const addNumbers = (text: string) => {
    for (const n of text.match(/\d+(?:\.\d+)?/g) ?? []) {
      numbers.add(n)
      numbers.add(String(Number(n)))
    }
  }
  const addDate = (iso: string) => {
    const at = new Date(iso)
    if (Number.isNaN(at.getTime())) return
    const [year = "", month = "", day = ""] = iso.slice(0, 10).split("-")
    addNumbers(`${year} ${month} ${day}`)
    dateWords.add(MONTHS[Number(month) - 1] ?? "")
    if (iso.length > 10) {
      // The time, only as a whole ("9:30"), on a 24- and a 12-hour clock.
      const [hour = "0", minute = "00"] = iso.slice(11, 16).split(":")
      times.add(`${Number(hour)}:${minute}`)
      times.add(`${((Number(hour) + 11) % 12) + 1}:${minute}`)
      const local = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
      dateWords.add(WEEKDAYS[(local.getUTCDay() + 6) % 7] ?? "")
    }
  }
  for (const t of message.match(TIME) ?? []) times.add(t.replace(/^0/, ""))
  addNumbers(message)
  if (context.emergencyLines === true) addNumbers("911 988")
  const said = lower(message)
  for (const w of [...MONTHS, ...WEEKDAYS, ...RELATIVE_DAYS]) {
    // "may" in a message is an ordinary word unless a day number follows.
    const pattern = w === "may" ? /\bmay \d/ : new RegExp(`\\b${w}\\b`)
    if (pattern.test(said)) dateWords.add(w)
  }
  for (const m of facts.medications) addNumbers(`${m.dose} ${m.frequency}`)
  for (const o of facts.observations) {
    addNumbers(`${o.value} ${o.low ?? ""} ${o.high ?? ""}`)
    addDate(o.date)
  }
  for (const a of facts.appointments) addDate(a.start)
  for (const c of facts.conditions) addDate(c.since)
  return { numbers, dateWords, times }
}

function fillInProblems(draft: string): Problem[] {
  const problems: Problem[] = []
  const names = [...draft.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] ?? "")
  for (const name of names) {
    if (!(FILL_INS as readonly string[]).includes(name))
      problems.push({ check: "fill-ins", found: `{${name}}` })
  }
  const stray = draft.replace(/\{[^{}]*\}/g, "")
  if (/[{}]/.test(stray)) problems.push({ check: "fill-ins", found: "a brace left open" })
  if (!names.includes("first_name")) problems.push({ check: "fill-ins", found: "no {first_name}" })
  return problems
}

/** The first change to a medicine in `text`. A negated one ("don't stop
 *  your…") is passed over, and the search starts again just after its verb, so
 *  a real change in the same sentence is still found. */
function medicineChange(text: string): string | undefined {
  for (const pattern of MEDICINE_CHANGE) {
    const search = new RegExp(pattern.source, "g")
    for (let m = search.exec(text); m !== null; m = search.exec(text)) {
      if (!NOT_A_CHANGE.test(text.slice(0, m.index))) return m[0]
      search.lastIndex = m.index + 1
    }
  }
  return undefined
}

/** Every problem in `draft`, read against the patient's message and record. */
export function check(draft: string, context: Context): Checked {
  const text = lower(draft)
  const problems: Problem[] = []
  const first = (patterns: RegExp[]) => patterns.map((p) => p.exec(text)).find((m) => m !== null)

  const diagnosis = first(DIAGNOSIS)
  if (diagnosis) problems.push({ check: "diagnosis", found: diagnosis[0] })

  const change = medicineChange(text)
  if (change) problems.push({ check: "medicine-change", found: change })

  const own = new Set(
    context.facts.medications.flatMap((m) => lower(m.name).split(/[^a-z]+/)).filter((w) => w.length > 2),
  )
  for (const medicine of MEDICINES) {
    if (new RegExp(`\\b${medicine}\\b`).test(text) && !own.has(medicine)) {
      problems.push({ check: "medicine-not-in-record", found: medicine })
    }
  }

  const { numbers, dateWords, times } = allowed(context)
  let withoutFillIns = text.replace(/\{[^{}]*\}/g, "")
  for (const t of withoutFillIns.match(TIME) ?? []) {
    if (!times.has(t.replace(/^0/, ""))) {
      problems.push({ check: "number-or-date", found: t })
      break
    }
  }
  withoutFillIns = withoutFillIns.replace(TIME, " ")
  for (const n of withoutFillIns.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!numbers.has(n)) {
      problems.push({ check: "number-or-date", found: n })
      break
    }
  }
  for (const word of [...MONTHS, ...WEEKDAYS, ...RELATIVE_DAYS]) {
    // "may" is also an ordinary word; only "May" with a day number is a date.
    const pattern = word === "may" ? /\bmay \d/ : new RegExp(`\\b${word}\\b`)
    if (pattern.test(text) && !dateWords.has(word)) {
      problems.push({ check: "number-or-date", found: word })
      break
    }
  }

  const promise = first(PROMISES)
  if (promise) problems.push({ check: "promise", found: promise[0] })

  const count = words(plain(draft)).length
  if (count > MAX_WORDS) problems.push({ check: "length", found: `${count} words; at most ${MAX_WORDS}` })
  const grade = readingGrade(draft)
  if (grade > MAX_GRADE)
    problems.push({ check: "reading-level", found: `grade ${grade}; at most ${MAX_GRADE}` })

  problems.push(...fillInProblems(draft))
  return { problems, grade, words: count }
}
