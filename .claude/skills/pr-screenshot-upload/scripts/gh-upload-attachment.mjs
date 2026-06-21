// ローカル画像を GitHub の PR/Issue コメント欄に投入して user-attachments の
// ホスト URL を取得する (コメントは投稿しない)。edge-cdp で attach 済みの
// ログイン済み Edge が前提。
//
// Usage (必ず playwright のある client/ で実行):
//   node <path>/gh-upload-attachment.mjs <pr_or_issue_url> <img1> [img2 ...] [--port 9222]
//
// 標準出力の ATTACHMENTS_JSON 行に {alt, url, markdown}[] を出す。

const args = process.argv.slice(2)
let port = "9222"
const portIdx = args.indexOf("--port")
if (portIdx !== -1) {
  port = args[portIdx + 1]
  args.splice(portIdx, 2)
}
const [targetUrl, ...images] = args
if (!targetUrl || images.length === 0) {
  console.error(
    "Usage: node gh-upload-attachment.mjs <pr_or_issue_url> <img1> [img2 ...] [--port 9222]",
  )
  process.exit(1)
}

let chromium
try {
  ;({ chromium } = await import("@playwright/test"))
} catch {
  ;({ chromium } = await import("playwright-core"))
}

const browser = await chromium.connectOverCDP(`http://localhost:${port}`)
const ctx = browser.contexts()[0] ?? (await browser.newContext())
const page = ctx.pages()[0] ?? (await ctx.newPage())

await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
await page.waitForTimeout(1500)

const login = await page
  .locator('meta[name="user-login"]')
  .getAttribute("content")
  .catch(() => null)
if (!login) {
  console.error(
    "GitHub に未ログインです。edge-cdp の Edge で https://github.com/login にログインしてから再実行してください。",
  )
  await browser.close()
  process.exit(2)
}

const commentTa = page.locator("#new_comment_field")
await commentTa.scrollIntoViewIfNeeded()
await commentTa.click()

let fileInput = page.locator("file-attachment:has(#new_comment_field) input[type=file]")
if ((await fileInput.count()) === 0) fileInput = page.locator("input[type=file]").last()
await fileInput.setInputFiles(images)

// アップロード完了待ち: "![Uploading...]" が消え、画像数ぶんの assets URL が入るまで。
await page.waitForFunction(
  (n) => {
    const el = document.querySelector("#new_comment_field")
    if (!el) return false
    const v = el.value
    const urls = (v.match(/user-attachments\/assets\//g) || []).length
    return !/!\[Uploading/i.test(v) && urls >= n
  },
  images.length,
  { timeout: 90000 },
)

const md = await commentTa.inputValue()

// コメントは投稿しないので入力欄をクリアして痕跡を残さない。
await commentTa.evaluate((el) => {
  el.value = ""
  el.dispatchEvent(new Event("input", { bubbles: true }))
})

// GitHub は画像を <img ... src="...assets/uuid"> 形式で挿入する。markdown 形式も拾う。
const entries = []
const imgRe = /<img[^>]*?alt="([^"]*)"[^>]*?src="([^"]*user-attachments\/assets\/[^"]+)"[^>]*?>/g
for (const m of md.matchAll(imgRe)) entries.push({ alt: m[1], url: m[2], markdown: m[0] })
const mdRe = /!\[([^\]]*)\]\((https:\/\/github\.com\/user-attachments\/assets\/[^)]+)\)/g
for (const m of md.matchAll(mdRe)) entries.push({ alt: m[1], url: m[2], markdown: m[0] })

console.log(`ATTACHMENTS_JSON ${JSON.stringify(entries)}`)
for (const e of entries) console.log(`- ${e.alt}: ${e.url}`)

await browser.close()
