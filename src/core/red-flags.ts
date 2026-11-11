/**
 * Red flags (B1): phrases that may mean an emergency, found in code before
 * any model sees the message. Matching ignores case, punctuation and
 * repeated letters ("chesst" is "chest"), allows a few words between the
 * parts of a phrase, and covers common short forms. A negated phrase ("no
 * chest pain") is still flagged: a false alarm costs a moment, a miss can
 * cost a life.
 */

export interface RedFlag {
  category: string
  /** What was found, as it reads once normalised. */
  found: string
}

/** Up to `n` words between two parts of a phrase. */
const gap = (n: number) => `(?: \\w+){0,${n}}`

/** Each category's patterns, over normalised text (see `normalise`). */
const CATEGORIES: { category: string; patterns: string[] }[] = [
  {
    category: "chest pain",
    patterns: [
      `chest${gap(3)} (?:pain|pains|hurts|hurting|ache|aches|pres?ure|tight|tightnes|heavy|heavines|crushing|squeezing)`,
      `(?:pain|pres?ure|tightnes|heavines|squeezing)${gap(5)} chest`,
      `heart atack`,
    ],
  },
  {
    category: "trouble breathing",
    patterns: [
      `(?:cant|cannot|can not|couldnt|unable to)${gap(1)} (?:breathe|breath|brethe|breth)`,
      `(?:trouble|hard|dificulty|struggling|strugle)${gap(2)} (?:breathing|breathe|brething|brethe|to breathe)`,
      `short(?:nes)? of breath`,
      `(?:cant|cannot|can not) catch my breath`,
      `gasping`,
      `(?:lips|face) (?:are |is |turning |look )?blue`,
    ],
  },
  {
    category: "stroke signs",
    patterns: [
      `(?:face|mouth|smile)${gap(3)} (?:droop|droopy|drooping|droops|drooped|lopsided)`,
      `drooping`,
      `slur(?:ed|ing|s)?${gap(1)} (?:speech|words|talking)`,
      `(?:speech|talking|words)${gap(4)} slur(?:ed|ing|s)?`,
      `(?:arm|leg)${gap(3)} (?:weak|numb|limp|dead)`,
      `(?:cant|cannot|can not) (?:lift|raise|move) my (?:arm|leg)`,
      `numb${gap(3)} one side`,
      `worst headache of my life`,
      `stroke`,
    ],
  },
  {
    category: "suicide or self-harm",
    patterns: [
      `suicid\\w*`,
      `kil+ my ?self`,
      `end(?:ing)? (?:my life|it al+|things)`,
      `(?:want|wanted|wish) (?:to|i was|i were) (?:die|dead)`,
      `better of+ (?:without me|dead)`,
      `(?:hurt|harm|cut)(?:ing)? my ?self`,
      `self harm`,
      `no reason to live`,
      `(?:dont|do not) (?:want to be here|see the point)`,
    ],
  },
  {
    category: "severe bleeding",
    patterns: [
      `(?:wont|will not|doesnt|does not|cant) stop bleding`,
      `bleding${gap(2)} (?:a lot|heavily|badly|everywhere|nonstop|wont stop|wil not stop)`,
      `(?:heavy|severe|lots of) bleding`,
      `soaking${gap(3)} (?:towel|towels|pad|pads|through)`,
      `(?:vomiting|throwing up|coughing up|coughed up|threw up|puking) blod`,
      `blod everywhere`,
      // Signs of bleeding in the gut.
      `(?:black|tary|bloody)${gap(1)} (?:stool|stools|poop|bowel movement)`,
      `(?:stool|stools|poop)${gap(3)} (?:black|tary|bloody)`,
      `cofee grounds`,
    ],
  },
  {
    category: "severe allergic reaction",
    patterns: [
      `throat${gap(5)} (?:swel\\w*|closing|close up|closing up|tight)`,
      `(?:swolen|swel\\w*)${gap(2)} (?:tongue|lips|lip|throat|face)`,
      `(?:tongue|lips|lip)${gap(2)} (?:swel\\w*|swolen)`,
      `anaphyla\\w*`,
      `epipen`,
    ],
  },
  {
    category: "fainting",
    patterns: [
      `fainted`,
      `fainting`,
      `pas+ed out`,
      `blacked out`,
      `lost consciousnes`,
      `unconscious`,
      `colapsed`,
    ],
  },
  {
    category: "overdose",
    patterns: [
      `overdose\\w*`,
      `took${gap(2)} (?:too many|to many|the whole bottle|al+ (?:of )?my (?:pils|pil|tablets|medicine|meds))`,
      `too many (?:pils|tablets|of my pils)`,
      // A dose taken twice, doubled or all at once by mistake.
      `took${gap(4)} (?:twice|double|an extra dose|two doses|too much)`,
      `took the whole${gap(5)} (?:pils|pil|bottle|tablets)`,
      `double dose`,
    ],
  },
]

/** A stiff neck counts only with a fever: each alone is common. */
const STIFF_NECK = new RegExp(
  `\\b(?:stif+ neck|neck${gap(2)} stif+|(?:cant|cannot) (?:bend|move) my neck)\\b`,
)
const FEVER = /\b(?:fever|feverish|temperature|temp of|10[1-5](?: \d)?(?: f)?)\b/

const COMPILED = CATEGORIES.map(({ category, patterns }) => ({
  category,
  patterns: patterns.map((p) => new RegExp(`\\b${collapse(p)}\\b`)),
}))

/** Repeated letters as one, in a pattern as in the text, so patterns are
 *  written in plain spelling. */
function collapse(pattern: string): string {
  return pattern.replace(/([a-z])\1+/g, "$1")
}

/** Lower case, apostrophes dropped ("can't" → "cant"), other punctuation as
 *  spaces, repeated letters collapsed ("chesst" → "chest"), single spaces. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])\1+/g, "$1")
    .trim()
}

/** Every red flag in `text`, at most one per category. */
export function redFlags(text: string): RedFlag[] {
  const plain = normalise(text)
  const found: RedFlag[] = []
  for (const { category, patterns } of COMPILED) {
    for (const pattern of patterns) {
      const match = pattern.exec(plain)
      if (match) {
        found.push({ category, found: match[0] })
        break
      }
    }
  }
  const neck = STIFF_NECK.exec(plain)
  const fever = FEVER.exec(plain)
  if (neck && fever) found.push({ category: "stiff neck with fever", found: `${neck[0]} … ${fever[0]}` })
  return found
}
