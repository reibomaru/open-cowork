import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import { basename, extname, join, resolve, sep } from "node:path"
import { createLogger, serializeError } from "./logger"

const log = createLogger("file-store")

// アップロードファイルの保存先。Claude SDK の cwd と揃え、Read/Glob/Grep ですぐ参照できるようにする。
// workdir 直下に flat 保存する (旧: <workdir>/uploads/ サブフォルダ)。
// 優先順位:
//   1. UPLOAD_DIR が明示されていればそれを使う
//   2. WORKDIR_USER / CLAUDE_CWD があればその直下
//   3. どちらも無ければ process.cwd()
const UPLOAD_DIR = resolve(
  process.env.UPLOAD_DIR ?? process.env.WORKDIR_USER ?? process.env.CLAUDE_CWD ?? process.cwd(),
)

// バイト単位。デフォルト 10MB。
export const MAX_FILE_SIZE = Number(process.env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024)

// セキュリティ上、実行可能ファイル系・OS バイナリ系は受け入れない。
// 拡張子はテキスト / 文書 / 表計算 / 画像 / 圧縮の代表的なもののみ。
const ALLOWED_EXTENSIONS = new Set([
  // テキスト・コード系
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".sql",
  ".sh",
  ".toml",
  ".ini",
  ".env",
  // 文書系
  ".pdf",
  ".docx",
  ".xlsx",
  ".xlsm",
  ".pptx",
  // 画像
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
])

export interface UploadedFile {
  id: string
  /** ユーザーが指定した元のファイル名 (sanitize 済み) */
  name: string
  /** バイト数 */
  size: number
  /** ブラウザが申告した MIME (検証は拡張子で行うので参考値) */
  mimeType: string
  /** Agent が読める絶対パス */
  path: string
  /** 作成 UNIX ms */
  createdAt: number
}

export class UploadError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "UploadError"
    this.status = status
  }
}

// 危険文字 / path traversal で問題になる文字のセット。
// 制御文字 (U+0000-U+001F, U+007F) は char code で個別判定する。
const FORBIDDEN_FILENAME_CHARS = new Set(["<", ">", ":", '"', "|", "?", "*", "/", "\\"])

// MIME → 拡張子のフォールバック。クリップボードペースト / 一部 D&D で
// ブラウザが拡張子なしの File を渡してくるケースに備える。
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "text/tab-separated-values": ".tsv",
  "text/html": ".html",
  "application/json": ".json",
  "application/xml": ".xml",
  "text/xml": ".xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": ".xlsm",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}

// path traversal を防ぐため、ベース名 + 許可拡張子のみに正規化する。
// MIME タイプを渡せば、拡張子が無いファイル名にはここで補完する。
function sanitizeFilename(input: string, mimeType?: string): string {
  // basename で path 構造を除去
  const base = basename(input).replace(/\\/g, "/").split("/").pop() ?? "file"
  // 制御文字 / 危険文字を 1 文字ずつ落とす (Biome の noControlCharactersInRegex 回避)
  let cleaned = ""
  for (const ch of base) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    if (FORBIDDEN_FILENAME_CHARS.has(ch)) continue
    cleaned += ch
  }
  cleaned = cleaned.replace(/^\.+/, "").trim()
  if (cleaned.length === 0) cleaned = "file"

  // 拡張子チェック: 無ければ MIME から補完する。
  // dot を含まない / 末尾が dot の場合は extname が "" を返すので、ここで明示判定する。
  const currentExt = extname(cleaned).toLowerCase()
  if (!currentExt && mimeType) {
    const guessed = MIME_TO_EXT[mimeType.toLowerCase().split(";")[0].trim()]
    if (guessed) {
      cleaned = `${cleaned.replace(/\.+$/, "")}${guessed}`
    }
  }

  return cleaned.slice(0, 200)
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }
}

/**
 * 旧 `<workdir>/uploads/` 配下のファイルを `<workdir>/` 直下に flatten する
 * best-effort なマイグレーション。さらにそこに残っていた旧構造
 * `uploads/<sessionId>/<uuid>_<name>` も平坦化する。
 * 起動時に 1 度呼ぶ。失敗しても上位には伝えない。
 */
async function migrateLegacyLayout(): Promise<void> {
  const legacyUploadsDir = join(UPLOAD_DIR, "uploads")
  let legacyEntries: string[]
  try {
    legacyEntries = await readdir(legacyUploadsDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return
    log.warn("legacy migration: readdir failed", { error: serializeError(err) })
    return
  }

  for (const entry of legacyEntries) {
    const entryPath = join(legacyUploadsDir, entry)
    let st: import("node:fs").Stats
    try {
      st = await stat(entryPath)
    } catch {
      continue
    }

    if (st.isDirectory()) {
      // 旧 session-uuid ディレクトリの中身を平坦化
      if (!/^[0-9a-f-]{36}$/i.test(entry)) continue
      let innerFiles: string[]
      try {
        innerFiles = await readdir(entryPath)
      } catch (err) {
        log.warn("legacy migration: readdir(sessionDir) failed", {
          sessionDir: entryPath,
          error: serializeError(err),
        })
        continue
      }
      for (const f of innerFiles) {
        const oldPath = join(entryPath, f)
        const stripped = f.replace(/^[0-9a-f-]{36}_/i, "")
        try {
          const finalName = await resolveCollision(stripped)
          await rename(oldPath, join(UPLOAD_DIR, finalName))
          log.info("legacy migration: moved", { from: oldPath, to: finalName })
        } catch (err) {
          log.warn("legacy migration: move failed", {
            oldPath,
            error: serializeError(err),
          })
        }
      }
      try {
        await rmdir(entryPath)
      } catch (err) {
        log.debug?.("legacy migration: rmdir failed (skipped)", {
          sessionDir: entryPath,
          error: serializeError(err),
        })
      }
    } else if (st.isFile()) {
      // 旧 `uploads/<name>` または `uploads/<uuid>_<name>` を直接 workdir 直下へ移す
      const stripped = entry.replace(/^[0-9a-f-]{36}_/i, "")
      try {
        const finalName = await resolveCollision(stripped)
        await rename(entryPath, join(UPLOAD_DIR, finalName))
        log.info("legacy migration: moved upload to workdir root", {
          from: entry,
          to: finalName,
        })
      } catch (err) {
        log.warn("legacy migration: rename failed", { entry, error: serializeError(err) })
      }
    }
  }

  // 空になった uploads/ を片付ける
  try {
    await rmdir(legacyUploadsDir)
  } catch (err) {
    log.debug?.("legacy migration: rmdir(uploads) skipped", {
      error: serializeError(err),
    })
  }
}

// import 副作用として一度だけ実行。`fileStore` を最初に触ったプロセスで走る。
migrateLegacyLayout().catch((err) => {
  log.warn("legacy migration: unhandled", { error: serializeError(err) })
})

/**
 * 同名ファイルがあれば macOS / Windows 流に `foo (1).jpg`, `foo (2).jpg` ...
 * とサフィックスを付けて衝突を回避する。`(N)` は元名に既に含まれていても
 * 安全に追加する (= ベース名末尾の ` (N)` を考慮しない)。
 */
async function resolveCollision(name: string): Promise<string> {
  const ext = extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  let candidate = name
  let i = 0
  while (true) {
    try {
      await access(join(UPLOAD_DIR, candidate))
    } catch {
      return candidate
    }
    i += 1
    candidate = `${base} (${i})${ext}`
  }
}

/**
 * ファイル保存はユーザー単位 (= 1 workdir) でフラットに行う:
 *   <UPLOAD_BASE>/<sanitizedName>
 *
 * id = サニタイズ後のファイル名そのものを使う。uuid prefix は付けない。
 * 同名がある場合は `foo (1).jpg` のようにサフィックスで衝突回避する。
 * セッション分離はしないので、同一ユーザー内ならどのセッションからでも
 * 同じファイルを参照できる。
 */

export const fileStore = {
  getBaseDir(): string {
    return UPLOAD_DIR
  },

  async save(file: {
    name: string
    type: string
    arrayBuffer: () => Promise<ArrayBuffer>
    size: number
  }): Promise<UploadedFile> {
    if (file.size <= 0) {
      throw new UploadError("empty file", 400)
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new UploadError(
        `file too large (max ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB)`,
        413,
      )
    }

    const sanitized = sanitizeFilename(file.name, file.type)
    const ext = extname(sanitized).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new UploadError(
        `unsupported file type: ${ext || "(no extension)"}${file.type ? ` (mime: ${file.type})` : ""}`,
        415,
      )
    }

    await mkdir(UPLOAD_DIR, { recursive: true })

    const finalName = await resolveCollision(sanitized)
    const filePath = join(UPLOAD_DIR, finalName)
    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buf)

    const record: UploadedFile = {
      id: finalName,
      name: finalName,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      path: filePath,
      createdAt: Date.now(),
    }
    log.info("upload saved", { fileId: finalName, size: file.size, path: filePath })
    return record
  },

  async list(): Promise<UploadedFile[]> {
    const entries = await safeReaddir(UPLOAD_DIR)
    const records: UploadedFile[] = []
    for (const entry of entries) {
      const filePath = join(UPLOAD_DIR, entry)
      try {
        const st = await stat(filePath)
        if (!st.isFile()) continue
        const ext = extname(entry).toLowerCase()
        if (!ALLOWED_EXTENSIONS.has(ext)) continue
        records.push({
          id: entry,
          name: entry,
          size: st.size,
          mimeType: "application/octet-stream",
          path: filePath,
          createdAt: st.birthtimeMs || st.mtimeMs,
        })
      } catch {
        // 列挙中に消えた等は無視
      }
    }
    records.sort((a, b) => a.createdAt - b.createdAt)
    return records
  },

  async getByIds(ids: string[]): Promise<UploadedFile[]> {
    if (ids.length === 0) return []
    const all = await this.list()
    const map = new Map(all.map((f) => [f.id, f]))
    const found: UploadedFile[] = []
    for (const id of ids) {
      const f = map.get(id)
      if (f) found.push(f)
    }
    return found
  },

  async delete(fileId: string): Promise<boolean> {
    // path traversal を防ぐため、resolve 後に UPLOAD_DIR 配下に収まることを確認する。
    const target = resolve(join(UPLOAD_DIR, fileId))
    if (!target.startsWith(`${UPLOAD_DIR}${sep}`)) return false
    try {
      await unlink(target)
      log.info("upload deleted", { fileId })
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
      log.error("upload delete failed", { fileId, error: serializeError(err) })
      return false
    }
  },

  /** Agent に渡すための短いテキスト記述を生成する。 */
  async readSnippet(file: UploadedFile, maxBytes = 4096): Promise<string | null> {
    const textLike = new Set([
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".tsv",
      ".json",
      ".jsonl",
      ".xml",
      ".yaml",
      ".yml",
      ".log",
      ".html",
      ".htm",
      ".css",
      ".js",
      ".ts",
      ".tsx",
      ".jsx",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".java",
      ".sql",
      ".sh",
      ".toml",
      ".ini",
      ".env",
    ])
    const ext = extname(file.name).toLowerCase()
    if (!textLike.has(ext)) return null
    try {
      const buf = await readFile(file.path)
      const slice = buf.subarray(0, maxBytes)
      return slice.toString("utf8")
    } catch {
      return null
    }
  },
}
