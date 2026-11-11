import { join } from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { logIn } from "../e2e/support.ts"
import {
  addOverlay,
  ADMIN,
  CLINICIAN,
  OUT,
  PATIENT,
  pointAt,
  press,
  record,
  say,
} from "./support.ts"

const size = { width: 1280, height: 720 }

/** A screenshot for people to look at, into docs/showcase/. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => window.showCaption?.(""))
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

/** Opens the inbox row of `patient` whose reply state matches `state`. */
async function open(page: Page, patient: string | RegExp, state?: string) {
  await page.goto("/")
  let row = page.getByRole("row").filter({ hasText: patient })
  if (state) row = row.filter({ hasText: state })
  await press(page, row.first().getByRole("link"))
}

/** About two and a half minutes, with captions, from an empty inbox to a
 *  patient reading the approved reply; saved as docs/showcase/walkthrough.mp4,
 *  with screenshots on the way. */
test("walkthrough", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await logIn(page, ADMIN)
  await addOverlay(page)
  const stop = await record(page, testInfo.outputPath("frames"))

  await page.goto("/")
  await say(page, "Care Message Assistant, at a made-up primary care clinic with made-up patients.")
  await say(
    page,
    "Patients' portal messages live on the clinic's FHIR server, the healthcare data standard, with each patient's record."
  )
  await press(page, page.getByRole("button", { name: "Fetch new messages" }))
  await expect(page.getByText(/new messages, \d+ with a red flag/)).toBeVisible({ timeout: 60_000 })
  await say(
    page,
    "Before any model sees a message, code looks for red flags: chest pain, trouble breathing, stroke signs, thoughts of suicide."
  )
  await pointAt(page, page.getByText("Urgent reply ready").first())
  await say(page, "Those go to the top, and never reach the model.", 3500)
  await shot(page, "desktop-1-inbox")

  await say(page, "The clinician logs in with an emailed link.", 3000)
  await context.clearCookies()
  await logIn(page, CLINICIAN)
  await open(page, /.+/, "Urgent reply ready")
  await page.getByText("Red flag: this may be an emergency").waitFor()
  await say(
    page,
    "A red flag, found in code. No AI draft was written: the clinic's fixed urgent reply is ready to send."
  )
  await shot(page, "desktop-2-red-flag")

  await open(page, "Question about my metformin")
  await page.getByText("Passed every check.").waitFor()
  await pointAt(page, page.getByRole("complementary", { name: "The patient's record" }))
  await say(
    page,
    "Claude drafts from the patient's record and the clinic's guidance. It never sees the patient's name, birth date or contact details."
  )
  await pointAt(page, page.getByText("Passed every check."))
  await say(
    page,
    "Code checks every draft against the record: no diagnosis, no medicine changes, no medicine or number the record doesn't hold, no promises."
  )
  await shot(page, "desktop-3-review")
  await press(page, page.getByRole("button", { name: "Edit" }))
  const text = page.getByLabel("Edit the reply")
  await text.fill(`${await text.inputValue()} It sounds like you have an infection.`)
  await press(page, page.getByRole("button", { name: "Save the text" }))
  await page.getByText("This draft failed a check, so it can’t be approved").waitFor()
  await say(
    page,
    "The clinician's own edits go through the same checks. This one names a condition, so it's blocked."
  )
  await shot(page, "desktop-4-blocked-edit")
  await press(page, page.getByRole("button", { name: "Edit" }))
  await text.fill(
    "Hi {first_name}, thank you for writing. An upset stomach can happen with metformin. Please keep taking it as prescribed until your clinician advises you, and book a visit or call the clinic if it gets worse."
  )
  await press(page, page.getByRole("button", { name: "Save the text" }))
  await page.getByText("Passed every check.").waitFor()
  await press(page, page.getByRole("button", { name: "Approve and send" }))
  await page.getByText("Sent to the patient’s portal").waitFor()
  await say(
    page,
    "Approving binds this exact text, and sends it once. Code adds who approved it and how to reach a person."
  )
  await shot(page, "desktop-5-sent")

  await say(page, "The patient reads it in the portal.", 3000)
  await context.clearCookies()
  await logIn(page, PATIENT)
  await page
    .getByText(/Reply from Example Community Clinic/)
    .first()
    .waitFor()
  await say(page, "Only her own messages, and only replies a person approved.")
  await shot(page, "desktop-6-portal")

  await context.clearCookies()
  await logIn(page, ADMIN)
  await page.goto("/activity")
  await expect(page.getByRole("row").nth(5)).toBeVisible()
  await say(page, "Every step is in an append-only log the database refuses to change.")
  await shot(page, "desktop-7-activity")
  await say(
    page,
    "Made-up clinic, made-up patients. The code enforces every rule, and the tests prove them.",
    4500
  )

  await stop(join(OUT, "walkthrough.mp4"))
  await context.close()
})

/** The review page and the portal on a phone. */
test("phone", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  })
  const page = await context.newPage()
  await logIn(page, CLINICIAN)
  await open(page, /.+/, "Ready to review")
  await page.screenshot({ path: join(OUT, "phone-1-review.png"), fullPage: true })
  await context.clearCookies()
  await logIn(page, PATIENT)
  await page.screenshot({ path: join(OUT, "phone-2-portal.png"), fullPage: true })
  await context.close()
})
