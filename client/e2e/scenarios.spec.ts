import { type Page, expect, test } from "@playwright/test"

// Helper: create a new session and return the textarea locator
async function createNewSession(page: Page) {
  await page.getByRole("button", { name: "New Session" }).click()
  const textarea = page.getByPlaceholder("Message Claude...")
  await expect(textarea).toBeVisible()
  return textarea
}

// Helper: send a message and wait for streaming to begin
async function sendMessage(page: Page, message: string) {
  const textarea = page.getByPlaceholder("Message Claude...")
  await textarea.fill(message)
  await textarea.press("Enter")
  // Wait for user message to appear in the chat
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 5000 })
}

// Helper: wait for streaming to complete (streaming-cursor disappears)
async function waitForStreamingComplete(page: Page) {
  await expect(page.locator(".streaming-cursor")).toHaveCount(0, { timeout: 30000 })
}

// Helper: find tool call blocks by type - uses the collapsible button that contains the tool name
function toolCallButtons(page: Page, toolType: string) {
  // Each tool call block has a collapsible button with a span.text-primary.font-medium containing the type
  return page.locator("button", { has: page.locator(`span.font-medium:text-is("${toolType}")`) })
}

test.describe("Mock Scenarios E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Welcome to Wiz Claude")).toBeVisible({ timeout: 10000 })
  })

  test("Scenario 1: Default - text response with Read tool call", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "hello world")
    await waitForStreamingComplete(page)

    // Verify text response appeared
    await expect(page.getByText("プロジェクトの構造を確認します")).toBeVisible()

    // Verify Read tool call block appeared
    await expect(toolCallButtons(page, "Read").first()).toBeVisible()

    // Verify final text
    await expect(page.getByText("Express.jsベースのAPIサーバー")).toBeVisible()
  })

  test("Scenario 2: Fix/Bug - Read, Edit with diff, Bash test, summary", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "fix the auth bug")
    await waitForStreamingComplete(page)

    // Verify Read tool call
    await expect(toolCallButtons(page, "Read").first()).toBeVisible()

    // Verify Edit tool call with diff
    await expect(toolCallButtons(page, "Edit").first()).toBeVisible()

    // Verify Bash tool call
    await expect(toolCallButtons(page, "Bash").first()).toBeVisible()

    // Bash block should show command (Bash blocks are default open)
    await expect(page.getByText('$ npm test -- --grep "auth"')).toBeVisible()

    // Verify test output in Bash block
    await expect(page.getByText("3 passed, 3 total").first()).toBeVisible()

    // Verify summary text
    await expect(page.getByText("修正完了です")).toBeVisible()
  })

  test("Scenario 3: Refactor - Plan with Approve/Reject, SubAgents, summary", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "refactor the code")
    await waitForStreamingComplete(page)

    // Verify plan appeared with title
    await expect(page.getByText("AuthService リファクタリング")).toBeVisible()

    // Verify plan steps
    await expect(page.getByText("auth.service.ts の責務を分離")).toBeVisible()
    await expect(page.getByText("TokenService クラスを新規作成").first()).toBeVisible()

    // Verify plan status badge
    await expect(page.getByText("pending-approval")).toBeVisible()

    // Verify Approve and Reject buttons are visible
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible()

    // Verify SubAgent cards appeared (with bot icon and agent name)
    await expect(page.getByText("token-service-creator")).toBeVisible()
    await expect(page.getByText("test-updater")).toBeVisible()

    // Verify summary text
    await expect(page.getByText("リファクタリングが完了しました")).toBeVisible()
  })

  test("Scenario 4: Explore - Glob, Grep, Read, summary", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "explore the codebase")
    await waitForStreamingComplete(page)

    // Verify Glob tool call
    await expect(toolCallButtons(page, "Glob").first()).toBeVisible()

    // Verify Grep tool call
    await expect(toolCallButtons(page, "Grep").first()).toBeVisible()

    // Verify Read tool call
    await expect(toolCallButtons(page, "Read").first()).toBeVisible()

    // Verify summary heading
    await expect(page.getByText("調査結果")).toBeVisible()

    // Verify summary content
    await expect(page.getByText("Controllers").first()).toBeVisible()
  })

  test("Scenario 5: Build - Plan, Read, Edit x2, Bash, summary", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "build a new feature")
    await waitForStreamingComplete(page)

    // Verify plan appeared
    await expect(page.getByText("パスワードリセット機能").first()).toBeVisible()

    // Verify plan steps
    await expect(page.getByText("パスワードリセットトークンのモデル作成")).toBeVisible()

    // Verify Approve/Reject buttons
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible()

    // Verify Read tool
    await expect(toolCallButtons(page, "Read").first()).toBeVisible()

    // Verify Edit tool calls exist (should be 2, but matching exact text)
    await expect(toolCallButtons(page, "Edit").first()).toBeVisible()

    // Verify Bash tool
    await expect(toolCallButtons(page, "Bash").first()).toBeVisible()
    await expect(page.getByText("$ npm test").first()).toBeVisible()

    // Verify summary
    await expect(page.getByText("パスワードリセット機能を実装しました")).toBeVisible()
  })

  test("Plan Approve button can be clicked", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "refactor the code")
    await waitForStreamingComplete(page)

    // Verify the plan shows pending-approval status
    await expect(page.getByText("pending-approval")).toBeVisible()

    // Click Approve
    const approveButton = page.getByRole("button", { name: "Approve" })
    await expect(approveButton).toBeVisible()
    await approveButton.click()

    // After clicking, verify the Approve button is no longer shown
    // (the component removes buttons when status changes)
    await expect(page.getByRole("button", { name: "Approve" })).toBeHidden({ timeout: 5000 })
  })

  test("Plan Reject button can be clicked", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "build a password reset")
    await waitForStreamingComplete(page)

    // Verify the plan shows pending-approval status
    await expect(page.getByText("pending-approval")).toBeVisible()

    // Click Reject
    const rejectButton = page.getByRole("button", { name: "Reject" })
    await expect(rejectButton).toBeVisible()
    await rejectButton.click()

    // After clicking, verify the Reject button is no longer shown
    await expect(page.getByRole("button", { name: "Reject" })).toBeHidden({ timeout: 5000 })
  })

  test("Tool call blocks are expandable", async ({ page }) => {
    await createNewSession(page)
    await sendMessage(page, "explore the codebase")
    await waitForStreamingComplete(page)

    // Glob block should be collapsed by default
    const globButton = toolCallButtons(page, "Glob").first()
    await expect(globButton).toBeVisible()

    // Click to expand
    await globButton.click()

    // After expanding, should see file list content inside the expanded area
    await expect(page.getByText("src/main.ts")).toBeVisible()

    // Click again to collapse
    await globButton.click()

    // The expanded content should be hidden
    await expect(page.getByText("src/main.ts")).toBeHidden()
  })

  test("Streaming cursor appears during streaming and disappears after", async ({ page }) => {
    await createNewSession(page)

    const textarea = page.getByPlaceholder("Message Claude...")
    await textarea.fill("hello world")
    await textarea.press("Enter")

    // Streaming cursor should appear during streaming
    await expect(page.locator(".streaming-cursor")).toBeVisible({ timeout: 5000 })

    // Wait for streaming to complete
    await waitForStreamingComplete(page)

    // Streaming cursor should be gone
    await expect(page.locator(".streaming-cursor")).toHaveCount(0)
  })

  test("Multiple sessions can be created", async ({ page }) => {
    // Create first session
    await createNewSession(page)
    await sendMessage(page, "hello world")
    await waitForStreamingComplete(page)

    // Create second session
    await page.getByRole("button", { name: "New Session" }).click()

    // The new session should be active with input visible
    const textarea = page.getByPlaceholder("Message Claude...")
    await expect(textarea).toBeVisible()

    // Send a different message in the second session
    await sendMessage(page, "fix the bug")
    await waitForStreamingComplete(page)

    // Verify fix scenario content appears
    await expect(page.getByText("修正完了です")).toBeVisible()
  })
})
