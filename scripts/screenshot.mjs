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

import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

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
  // WelcomeScreen の skill catalog (API fetch 結果) が描画されるまで待機
  await page.waitForTimeout(1500)

  await page.screenshot({ path: join(outDir, "landing-light.png"), fullPage: false })
  console.log("saved landing-light.png")
} finally {
  await browser.close()
}
