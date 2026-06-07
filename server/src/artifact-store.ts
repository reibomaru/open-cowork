import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { complete, getModel, type KnownProvider } from "@earendil-works/pi-ai"
import { createLogger, serializeError } from "./logger"

const log = createLogger("artifact-store")

// 生成された HTML の内容から短い日本語タイトルを Haiku に書かせる。
// 失敗時は <title> タグ → "output" の順でフォールバックする。
const HAIKU_PROVIDER = process.env.ARTIFACT_TITLE_PROVIDER ?? "anthropic"
const HAIKU_MODEL = process.env.ARTIFACT_TITLE_MODEL ?? "claude-haiku-4-5"
const HAIKU_TIMEOUT_MS = 5000

async function generateTitleWithHaiku(html: string): Promise<string | null> {
  const truncated = html.slice(0, 4000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS)
  try {
    const model = getModel(HAIKU_PROVIDER as KnownProvider, HAIKU_MODEL as never)
    if (!model) {
      log.warn("artifact-title: model not found", {
        provider: HAIKU_PROVIDER,
        model: HAIKU_MODEL,
      })
      return null
    }
    const result = await complete(
      model,
      {
        messages: [
          {
            role: "user",
            content: `以下の HTML の内容を表す簡潔な日本語タイトルを 1 つだけ出力してください。30 文字以内、ファイル名として使いやすい形（記号・改行・引用符・装飾なし）、タイトル文字列のみを返してください。\n\n${truncated}`,
            timestamp: Date.now(),
          },
        ],
      },
      { maxTokens: 80, temperature: 0.2, signal: controller.signal },
    )
    const textBlock = result.content.find((c) => c.type === "text")
    const text = textBlock?.text?.trim()
    if (!text) return null
    return (
      text
        .replace(/^["'`「『]+|["'`」』]+$/g, "")
        .split(/\r?\n/)[0]
        .trim() || null
    )
  } catch (err) {
    log.warn("haiku title generation failed", { error: serializeError(err) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

// html artifact の保存先。pi-coding-agent の cwd と揃えるのが基本方針。
//   1. ARTIFACT_DIR が明示されていればそれを使う
//   2. WORKDIR_USER (docker-compose が `/home/node/workdir` を bind mount で注入)
//   3. CLAUDE_CWD (後方互換用フォールバック)
//   4. どれも無ければ process.cwd()
// ※ process.cwd() は `/app/server` (Hono ソース) になるケースがあるため、
//    実運用では必ず WORKDIR_USER で解決されるよう env と起動時 chdir の両方を揃える。
const ARTIFACT_DIR = resolve(
  process.env.ARTIFACT_DIR ?? process.env.WORKDIR_USER ?? process.env.CLAUDE_CWD ?? process.cwd(),
)

// streaming 中はメモリにバッファし、html_block_end で <title> を抽出して
// セマンティックなファイル名で書き出す。書き出し前にファイル名が決まらないので
// createWriteStream の追記方式は使わない。HTML artifact は通常 100KB 未満で、
// メモリ滞留も短命なので問題にならない。
const buffers = new Map<string, string[]>()

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]*)<\/title>/i)
  if (!m) return null
  const t = m[1].trim().replace(/\s+/g, " ")
  return t || null
}

// ファイル名に使える形に正規化。日本語等の Unicode 文字は filesystem 上 OK なので残す。
// path separator や Windows 予約文字、制御文字、記号類は除去。
function slugify(s: string): string {
  return (
    s
      .normalize("NFKC")
      .trim()
      // 許可: Unicode 文字 (\p{L})、数字 (\p{N})、結合文字 (\p{M})、空白、dash、underscore
      .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  )
}

export const artifactStore = {
  start(blockId: string): void {
    buffers.set(blockId, [])
    log.info("artifact start", { blockId })
  },

  append(blockId: string, chunk: string): void {
    const buf = buffers.get(blockId)
    if (!buf) {
      log.warn("append on unknown blockId", { blockId })
      return
    }
    buf.push(chunk)
  },

  async end(blockId: string): Promise<string | null> {
    const buf = buffers.get(blockId)
    if (!buf) {
      log.warn("end on unknown blockId", { blockId })
      return null
    }
    buffers.delete(blockId)
    const html = buf.join("")
    // 優先: Haiku に内容を要約させる → fallback: <title> タグ → fallback: "output"
    const haikuTitle = await generateTitleWithHaiku(html)
    const htmlTitle = extractTitle(html)
    const title = haikuTitle ?? htmlTitle
    const slug = title ? slugify(title) : ""
    const base = slug || "output"
    // 短い UUID 接尾辞で同名衝突を回避（同タイトルで複数生成しても踏まない）。
    const filename = `${base}-${blockId.slice(0, 8)}.html`
    const filePath = join(ARTIFACT_DIR, filename)
    try {
      await mkdir(ARTIFACT_DIR, { recursive: true })
      await writeFile(filePath, html, "utf8")
    } catch (err) {
      log.error("artifact write failed", {
        blockId,
        filename,
        error: serializeError(err),
      })
      return null
    }
    log.info("artifact end", { blockId, filename, filePath, bytes: html.length })
    return `/api/artifacts/${encodeURIComponent(filename)}`
  },

  getDir(): string {
    return ARTIFACT_DIR
  },
}
