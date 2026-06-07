/**
 * README 用スクショ撮影スクリプト。事前に Vite 開発サーバ (localhost:5173)
 * とサーバ (localhost:3000) を起動しておく:
 *
 *   pnpm dev
 *
 * 別ターミナルで:
 *
 *   pnpm screenshot
 *
 * playwright は client/node_modules に @playwright/test として入っているので、
 * package.json の `screenshot` スクリプトは `pnpm -F client exec node ../scripts/screenshot.mjs`
 * 経由で実行する (Node の module resolution が client 配下から動く必要がある)。
 */

import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "..", "docs", "screenshots")
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" })
  // WelcomeScreen の skill catalog が描画されるまで余裕を持って待機
  await page.waitForTimeout(800)

  // Light theme のスクショ
  await page.screenshot({ path: join(outDir, "landing-light.png"), fullPage: false })
  console.log("saved landing-light.png")

  // Dark theme に切り替えてスクショ
  // theme トグルボタンの aria-label は i18n の `sidebar.toggleToDark` / `toggleToLight`
  // Light テーマ時は「ダークモードに切替」が表示される
  const darkBtn = page.getByRole("button", { name: /ダークモード|dark mode/i })
  if (await darkBtn.count()) {
    await darkBtn.first().click()
    // ツールチップが消えるようマウスを画面外に逃がす
    await page.mouse.move(0, 0)
    await page.locator("body").click({ position: { x: 720, y: 800 } })
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(outDir, "landing-dark.png"), fullPage: false })
    console.log("saved landing-dark.png")
  } else {
    console.log("dark toggle not found, skipping dark screenshot")
  }
} finally {
  await browser.close()
}
