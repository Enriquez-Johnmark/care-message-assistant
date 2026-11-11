import { expect, test } from "@playwright/test"

import { logIn } from "./support.ts"

const admin = "admin@clinic.example.test"
const clinician = "dr.lee@clinic.example.test"

test.describe.configure({ mode: "serial" })

test("the administrator fetches the portal messages and red flags come first", async ({ page }) => {
  await logIn(page, admin)
  await page.getByRole("button", { name: "Fetch new messages" }).click()
  await expect(page.getByText(/new messages, \d+ with a red flag/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("row")).toHaveCount(31)
  await expect(page.getByRole("row").nth(1)).toContainText("Urgent reply ready")
})

test("the clinician sees a red flag the model never saw, and approves a draft that passed every check", async ({
  page,
}) => {
  await logIn(page, clinician)
  await page
    .getByRole("row")
    .filter({ hasText: "Urgent reply ready" })
    .first()
    .getByRole("link")
    .click()
  await expect(page.getByText("Red flag: this may be an emergency")).toBeVisible()
  await expect(page.getByText(/No AI draft was written/)).toBeVisible()

  await page.getByRole("link", { name: "Inbox" }).first().click()
  await page
    .getByRole("row")
    .filter({ hasText: "Maria Delgado" })
    .filter({ hasText: "Ready to review" })
    .first()
    .getByRole("link")
    .click()
  await expect(page.getByText("Passed every check.")).toBeVisible()
  await page.getByRole("button", { name: "Approve and send" }).click()
  await expect(page.getByText("Sent to the patient’s portal")).toBeVisible()
  await expect(
    page.getByText(/drafted with the help of AI and reviewed and approved by Dr. Example Lee/)
  ).toBeVisible()
})

test("an edit naming a condition is blocked by the same checks", async ({ page }) => {
  await logIn(page, clinician)
  await page
    .getByRole("row")
    .filter({ hasText: "Ready to review" })
    .first()
    .getByRole("link")
    .click()
  await page.getByRole("button", { name: "Edit" }).click()
  const text = page.getByLabel("Edit the reply")
  await text.fill(`${await text.inputValue()} It sounds like you have an infection.`)
  await page.getByRole("button", { name: "Save the text" }).click()
  await expect(page.getByText("This draft failed a check, so it can’t be approved")).toBeVisible()
  await expect(page.getByText(/A diagnosis:/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve and send" })).toHaveCount(0)
})

test("the patient sees the approved reply in their portal, and only their own messages", async ({
  page,
}) => {
  await logIn(page, "maria.delgado@example.test")
  await expect(page.getByRole("heading", { name: "Your messages" })).toBeVisible()
  await expect(page.getByText(/Reply from Example Community Clinic/)).toBeVisible()
  await expect(page.getByText("Hi Maria,", { exact: false }).first()).toBeVisible()
  await expect(page.getByText("Priya", { exact: false })).toHaveCount(0)
})
