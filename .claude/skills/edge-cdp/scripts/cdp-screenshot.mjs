// Usage:
//   cd <workspace-with-playwright>
//   node <path>/cdp-screenshot.mjs <url> [outPath] [port]

const url = process.argv[2]
const outPath = process.argv[3] ?? "/tmp/shot.png"
const port = process.argv[4] ?? "9222"

if (!url) {
  console.error("Usage: node cdp-screenshot.mjs <url> [outPath] [port]")
  process.exit(1)
}

let chromium
try {
  ;({ chromium } = await import("@playwright/test"))
} catch {
  ;({ chromium } = await import("playwright-core"))
}

const browser = await chromium.connectOverCDP(`http://localhost:${port}`)
const context = browser.contexts()[0] ?? (await browser.newContext())

const existing = context.pages().find((p) => p.url() === url)
const page = existing ?? context.pages()[0] ?? (await context.newPage())

await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
await page.waitForTimeout(1000)
await page.screenshot({ path: outPath, fullPage: true })

console.log(JSON.stringify({ title: await page.title(), url: page.url(), saved: outPath }))

await browser.close()
