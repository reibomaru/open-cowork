import { expect, test } from "@playwright/test"

test("screenshot light mode menu", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.getByText("Welcome to Wiz Claude")).toBeVisible({ timeout: 10000 })

  // Switch to light mode
  await page.getByTitle("ライトモードに切替").click()
  await page.waitForTimeout(500)

  // Create session
  await page.getByRole("button", { name: "New Session" }).click()
  const textarea = page.getByPlaceholder("Message Claude...")
  await expect(textarea).toBeVisible()
  await textarea.fill("hello world")
  await textarea.press("Enter")
  await expect(page.getByText("hello world").first()).toBeVisible({ timeout: 5000 })
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 30000 })
  await page.waitForTimeout(500)

  // Hover over session item to show menu button, then click it
  const sessionItem = page.getByText("New Session", { exact: false }).first()
  await sessionItem.hover()
  await page.waitForTimeout(300)
  // Click the three dots menu button (opacity-0 by default, becomes visible on hover)
  const menuButton = page.locator(".group button:has(svg)").first()
  await menuButton.click({ force: true })
  await page.waitForTimeout(300)

  await page.screenshot({ path: "/tmp/ui-light-menu.png", fullPage: false })
  await context.close()
})
