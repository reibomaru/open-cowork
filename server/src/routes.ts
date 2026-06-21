import { mkdir, readFile, readdir, stat } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { SessionManager } from "@earendil-works/pi-coding-agent"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { v4 as uuid } from "uuid"
import { z } from "zod"
import { artifactStore } from "./artifact-store"
import * as dao from "./dynamodb-sessions"
import { MAX_FILE_SIZE, UploadError, type UploadedFile, fileStore } from "./file-store"
import { createLogger } from "./logger"
import { MODEL_IDS, getAvailableModels, getDefaultModelId, resolveModelLabel } from "./models"
import { formatMcpToolName, streamClaudeAgentResponse, summarizeToolInput } from "./pi-agent"
import { SkillError, skillStore } from "./skill-store"
import type { Session, StoredMessage } from "./types"
import { SERVER_VERSION } from "./version"
import { normalizeWorkingDirInput, resolveWorkingDirUnder } from "./workdir-path"

const log = createLogger("routes")

// pi-coding-agent の cwd と同じディレクトリ。docker-compose が ./workdir を bind mount し、
// WORKDIR_USER=/home/node/workdir で export する。ローカル開発で env 未設定でも動くよう
// CLAUDE_CWD も後方互換で拾う。
const WORKDIR_USER = process.env.WORKDIR_USER ?? process.env.CLAUDE_CWD

type PendingAgent = {
  kind: "agent"
  prompt: string
  sessionId: string
  model: string
  /**
   * セッションタイトルを Haiku で要約する候補かどうか。
   * POST /messages 時点で titleGenerated 未確定だったときに true となり、
   * SSE の onDone 後に generateSessionTitle を 1 回だけ走らせる。
   * Haiku 呼び出し結果に関係なくこのスレッドでは再試行しない。
   */
  generateTitle: boolean
  /** Haiku への入力に使うユーザーの最初の発話原文（添付プレフィックスを含まない）。 */
  userMessageText: string
  /** Haiku 呼び出しの送信元ユーザー。dao.patchSession に必要。 */
  userId: string
  /** セッションの作業ディレクトリ (workdir root からの相対パス)。未指定は workdir 全体。 */
  workingDir?: string
}
const pendingStreams: Record<string, PendingAgent> = {}

type Variables = { userId: string }
const app = new Hono<{ Variables: Variables }>()

/**
 * 実 DAO を使って所有権検証付きで取得する。存在しない / 不一致は null。
 * 存在情報を漏らさないよう呼び出し側はそのまま 404 を返す。
 */
async function getOwnedSession(sessionId: string, userId: string): Promise<Session | null> {
  const session = await dao.getSession(userId, sessionId)
  if (!session || session.ownerId !== userId) return null
  return session
}

/**
 * pi のセッションエントリが model_change なら {provider, modelId} を返す。
 * getBranch() は root → leaf 順なので、走査しながら直近の model_change を「現在のモデル」
 * として保持し、後続の assistant メッセージに紐付けることで「どのモデルが回答したか」を復元する。
 */
function readModelChange(entry: unknown): { provider: string; modelId: string } | null {
  if (!entry || typeof entry !== "object") return null
  const e = entry as { type?: string; provider?: unknown; modelId?: unknown }
  if (e.type !== "model_change") return null
  if (typeof e.provider !== "string" || typeof e.modelId !== "string") return null
  return { provider: e.provider, modelId: e.modelId }
}

/**
 * pi-coding-agent SessionManager.getPath() が返す entry を SPA 描画用の
 * StoredMessage に変換する。pi の AgentMessage は
 *   - role: "user" | "assistant" | "toolResult" | "bashExecution" | "custom" | ...
 *   - content: string | array of {type, text|thinking|toolCall|...}
 * という形なので、表示対象は user / assistant 系のみで、tool_use 等は skillReferences に変換する。
 */
function normalizePiEntry(entry: unknown, sessionId: string): StoredMessage | null {
  if (!entry || typeof entry !== "object") return null
  const e = entry as {
    type?: string
    id?: string
    message?: { role?: string; content?: unknown; timestamp?: number | string }
  }
  // pi-coding-agent の SessionEntry は SessionMessageEntry を含む union 型。
  // 表示対象は role が user / assistant の message entry のみ。
  if (e.type !== "message" || !e.message) return null
  const msg = e.message
  const role = msg.role
  if (role !== "user" && role !== "assistant") return null

  const id = e.id ?? `entry-${Math.random().toString(36).slice(2)}`
  const text = extractText(msg.content)
  const skillReferences: StoredMessage["skillReferences"] = []
  let content = text
  let attachments: StoredMessage["attachments"]

  if (role === "user") {
    const slash = parseSlashCommandWrapper(content)
    if (slash) {
      content = slash.displayText
      skillReferences.push({
        id: `slash-${id}`,
        name: slash.name,
        source: "slash",
      })
    }
    const parsed = parseUserPromptPrefix(content)
    if (parsed.attachments.length > 0) {
      content = parsed.stripped
      attachments = parsed.attachments
        .map((ap) => {
          const fid = extractFileIdFromPath(ap.path)
          if (!fid) return null
          const mimeType = getMimeFromName(ap.name)
          return {
            id: fid,
            name: ap.name,
            size: ap.size,
            mimeType,
            isImage: mimeType.startsWith("image/"),
          }
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    }
  }

  if (role === "assistant") {
    const usedTools = extractAssistantSkillRefsFromPi(msg.content)
    for (const ref of usedTools) skillReferences.push(ref)
  }

  if (!content && skillReferences.length === 0) return null

  return {
    id,
    sessionId,
    role,
    content,
    timestamp: parseTimestamp(msg.timestamp),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(skillReferences.length > 0 ? { skillReferences } : {}),
  }
}

/**
 * pi-coding-agent の AssistantMessage.content 配列から tool_call を抽出して
 * SkillReferenceInfo に変換する。
 * pi の content は {type, text|thinking|toolCall|...}。toolCall は {id, name, arguments}.
 */
function extractAssistantSkillRefsFromPi(
  content: unknown,
): NonNullable<StoredMessage["skillReferences"]> {
  if (!Array.isArray(content)) return []
  const refs: NonNullable<StoredMessage["skillReferences"]> = []
  const seen = new Set<string>()
  const pushUnique = (ref: NonNullable<StoredMessage["skillReferences"]>[number]) => {
    const key = `${ref.source}:${ref.name}:${ref.detail ?? ""}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push(ref)
  }
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const b = block as { type?: string; id?: string; name?: string; arguments?: unknown }
    if (b.type !== "toolCall" || !b.name) continue
    const args =
      b.arguments && typeof b.arguments === "object"
        ? (b.arguments as Record<string, unknown>)
        : undefined
    if (b.name.startsWith("mcp__")) {
      const display = formatMcpToolName(b.name)
      if (!display) continue
      const detail = summarizeToolInput(b.name, args)
      pushUnique({
        id: b.id ?? `mcp-${refs.length}`,
        name: display,
        source: "mcp",
        ...(detail ? { detail } : {}),
      })
    } else {
      const detail = summarizeToolInput(b.name, args)
      pushUnique({
        id: b.id ?? `builtin-${refs.length}`,
        name: b.name,
        source: "builtin",
        ...(detail ? { detail } : {}),
      })
    }
  }
  return refs
}

/**
 * slash command の transcript 表現を解釈する。
 * 例: `<command-message>greeting</command-message><command-name>/greeting</command-name><command-args>hi</command-args>`
 *   → { name: 'greeting', displayText: '/greeting hi' }
 * wrapper が無ければ null。
 */
function parseSlashCommandWrapper(text: string): { name: string; displayText: string } | null {
  const nameMatch = text.match(/<command-name>\/([^<\s]+)<\/command-name>/)
  if (!nameMatch) return null
  const name = nameMatch[1]
  const argsMatch = text.match(/<command-args>([\s\S]*?)<\/command-args>/)
  const args = argsMatch?.[1]?.trim() ?? ""
  const displayText = args ? `/${name} ${args}` : `/${name}`
  return { name, displayText }
}

/**
 * normalizePiEntry で user 発話に付いた slash 由来の skillReferences を、
 * 後続最初の assistant message に移し替える。chip 表示位置を「常に assistant の上」に
 * 統一するための後処理。
 */
function relocateSlashSkillRefsToAssistant(messages: StoredMessage[]): void {
  let pending: NonNullable<StoredMessage["skillReferences"]> = []
  for (const m of messages) {
    if (m.role === "user" && m.skillReferences && m.skillReferences.length > 0) {
      const slashRefs = m.skillReferences.filter((r) => r.source === "slash")
      const others = m.skillReferences.filter((r) => r.source !== "slash")
      if (slashRefs.length > 0) {
        pending = [...pending, ...slashRefs]
        m.skillReferences = others.length > 0 ? others : undefined
      }
    } else if (m.role === "assistant" && pending.length > 0) {
      const existing = m.skillReferences ?? []
      // dedup: 同じ name+source は付けない
      const seen = new Set(existing.map((r) => `${r.source}:${r.name}`))
      for (const p of pending) {
        const key = `${p.source}:${p.name}`
        if (!seen.has(key)) {
          existing.push(p)
          seen.add(key)
        }
      }
      if (existing.length > 0) m.skillReferences = existing
      pending = []
    }
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === "object" && "type" in block) {
      const b = block as { type: string; text?: unknown }
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text)
      }
    }
  }
  return parts.join("")
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"])

function isImageFile(f: { name: string }): boolean {
  const dot = f.name.lastIndexOf(".")
  if (dot < 0) return false
  return IMAGE_EXTENSIONS.has(f.name.slice(dot).toLowerCase())
}

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".tsv": "text/tab-separated-values; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml",
  ".html": "text/html; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

function getMimeFromName(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  return EXT_TO_MIME[name.slice(dot).toLowerCase()] ?? "application/octet-stream"
}

/**
 * agent 向けプロンプトに差し込んだ「[画像ファイル ...]」「[添付ファイル ...]」
 * プレフィックスを user 発話から取り除き、添付ファイル一覧を抽出する。
 *
 * 差し込み元: POST /messages の promptForAgent 構築箇所と同じ書式。
 * 各エントリ: `- <name> (path: <absolutePath>, <size> bytes)`
 */
function parseUserPromptPrefix(content: string): {
  stripped: string
  attachments: Array<{ name: string; path: string; size: number }>
} {
  if (!content.startsWith("[画像ファイル") && !content.startsWith("[添付ファイル")) {
    return { stripped: content, attachments: [] }
  }

  const lines = content.split("\n")
  const attachments: Array<{ name: string; path: string; size: number }> = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith("[画像ファイル") || line.startsWith("[添付ファイル")) {
      i++
      continue
    }
    if (line === "") {
      i++
      continue
    }
    // 名前 / path / size はそれぞれパースする。path は最短一致で `, <digits> bytes` 直前まで。
    const m = line.match(/^-\s+(.+)\s+\(path:\s+(.+?),\s+(\d+)\s+bytes\)\s*$/)
    if (m) {
      attachments.push({ name: m[1], path: m[2], size: Number(m[3]) })
      i++
      continue
    }
    // ヘッダ / 箇条書き以外に到達したらそこから先がユーザ発話
    break
  }

  return { stripped: lines.slice(i).join("\n"), attachments }
}

/** 保存パス `${UPLOAD_DIR}/<filename>` の basename を fileId として取り出す。
 * 旧構造 `${UPLOAD_DIR}/<sessionId>/<uuid>_<name>` で生成された transcript も
 * 拾えるよう、uuid prefix が付いていれば取り除く。 */
function extractFileIdFromPath(filePath: string): string | null {
  const base = filePath.split("/").pop() ?? ""
  if (!base) return null
  const legacyUuid = base.match(/^[0-9a-f-]{36}_(.+)$/i)
  return legacyUuid ? legacyUuid[1] : base
}

function parseTimestamp(ts: unknown): number {
  if (typeof ts === "string") {
    const t = Date.parse(ts)
    if (!Number.isNaN(t)) return t
  }
  if (typeof ts === "number") return ts
  return 0
}

interface FileNode {
  name: string
  /**
   * workdir root からの相対パス。プレビュー fetch (path query) と
   * client の「パスをコピー」UI で使う。
   * 絶対パス (/home/node/workdir/...) はコンテナ内部実装の漏洩になるので返さない。
   */
  path: string
  type: "file" | "dir"
  size?: number
  children?: FileNode[]
}

// `.claude` は workspace 側からは隠し、`.claude/skills/` のみ別ルートで露出する。
const FILETREE_SKIP = new Set([
  "node_modules",
  ".git",
  ".DS_Store",
  ".cache",
  "dist",
  "build",
  ".claude",
])
const FILETREE_MAX_DEPTH = 5

async function buildFileTree(absDir: string, root: string, depth: number): Promise<FileNode[]> {
  if (depth > FILETREE_MAX_DEPTH) return []
  let dirents: import("node:fs").Dirent[]
  try {
    dirents = await readdir(absDir, { withFileTypes: true, encoding: "utf8" })
  } catch {
    return []
  }
  const entries = dirents
    .filter((d) => !FILETREE_SKIP.has(d.name))
    .sort((a, b) => {
      const ad = a.isDirectory() ? 0 : 1
      const bd = b.isDirectory() ? 0 : 1
      if (ad !== bd) return ad - bd
      return a.name.localeCompare(b.name)
    })
  const nodes: FileNode[] = []
  for (const entry of entries) {
    const absPath = join(absDir, entry.name)
    const relPath = relative(root, absPath)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "dir",
        children: await buildFileTree(absPath, root, depth + 1),
      })
    } else if (entry.isFile()) {
      let size: number | undefined
      try {
        size = (await stat(absPath)).size
      } catch {
        size = undefined
      }
      nodes.push({ name: entry.name, path: relPath, type: "file", size })
    }
  }
  return nodes
}

/**
 * 作業ディレクトリ用の相対パスを検証し、{ abs, rel } を返す。不正 (traversal / null 文字 /
 * 長すぎる) または WORKDIR_USER 未設定なら null。検証ロジックは workdir-path.ts に切り出し済み。
 */
function resolveWorkingDir(rel: string): { abs: string; rel: string } | null {
  if (!WORKDIR_USER) return null
  return resolveWorkingDirUnder(WORKDIR_USER, rel)
}

/** FileNode ツリーから dir ノードだけを平坦化して { path, name } 一覧にする。 */
function flattenDirs(nodes: FileNode[]): Array<{ path: string; name: string }> {
  const out: Array<{ path: string; name: string }> = []
  for (const n of nodes) {
    if (n.type !== "dir") continue
    out.push({ path: n.path, name: n.name })
    if (n.children) out.push(...flattenDirs(n.children))
  }
  return out
}

const routes = app
  // --- Version ---
  // フロントが「いま動いているサーバ版」を表示するためのエンドポイント。
  // server/VERSION → server/package.json → "unknown" の順に解決した値を返す
  // (解決ロジックは ./version.ts、起動時 1 回キャッシュ済み)。
  .get("/api/version", (c) => {
    return c.json({ version: SERVER_VERSION })
  })

  // --- Models ---
  // provider / model は内部解決用なので id / label / description のみ返す。
  // 認証情報が揃っていないプロバイダのモデルは除外する。
  .get("/api/models", (c) => {
    const models = getAvailableModels()
    return c.json({
      models: models.map(({ id, label, description }) => ({ id, label, description })),
      defaultModelId: getDefaultModelId(),
    })
  })

  // --- Sessions ---
  .get("/api/sessions", async (c) => {
    const userId = c.get("userId")
    const sessions = await dao.listByUserId(userId)
    return c.json(sessions)
  })
  .get("/api/sessions/:id", async (c) => {
    const userId = c.get("userId")
    const id = c.req.param("id")
    // getSession は ConsistentRead 済みなので、ターン直後の usage 累計も最新が返る。
    // セッション一覧 (listByUserId) は LSI 経由で usage* を projection しないため、
    // 累計使用量の権威ある読み出しはこの単体取得を使う。
    const session = await getOwnedSession(id, userId)
    if (!session) return c.json({ error: "Not found" }, 404)
    return c.json(session)
  })
  .post(
    "/api/sessions",
    // クライアントが「次に作るセッションのモデル」を選んでいれば JSON で渡す。
    // 渡されなければサーバ既定 (getDefaultModelId()) を使う。
    zValidator(
      "json",
      z
        .object({
          model: z.enum(MODEL_IDS).optional(),
          // 作業ディレクトリ (workdir root からの相対パス)。指定セッションは編集範囲が
          // この配下に制限される。省略 / 空文字は workdir 全体 (従来挙動)。
          workingDir: z.string().max(512).optional(),
        })
        .optional(),
    ),
    async (c) => {
      const userId = c.get("userId")
      const body = c.req.valid("json")
      const now = Date.now()

      // workingDir が指定されていれば検証し、存在しなければ作成する。
      let workingDir: string | undefined
      const rawWorkingDir = body?.workingDir ? normalizeWorkingDirInput(body.workingDir) : ""
      if (rawWorkingDir) {
        const resolved = resolveWorkingDir(rawWorkingDir)
        if (!resolved) return c.json({ error: "invalid workingDir" }, 400)
        try {
          await mkdir(resolved.abs, { recursive: true })
        } catch (err) {
          log.error("failed to create workingDir", {
            userId,
            dir: resolved.rel,
            error: String(err),
          })
          return c.json({ error: "failed to create workingDir" }, 500)
        }
        workingDir = resolved.rel
      }

      const session: Session = {
        id: uuid(),
        ownerId: userId,
        title: "New Session",
        createdAt: now,
        updatedAt: now,
        status: "active",
        model: body?.model ?? getDefaultModelId(),
        permissionMode: "ask",
        ...(workingDir ? { workingDir } : {}),
      }
      await dao.putSession(session)
      return c.json(session)
    },
  )
  .patch(
    "/api/sessions/:id",
    zValidator(
      "json",
      z.object({
        title: z.string().optional(),
        status: z.enum(["active", "archived"]).optional(),
        model: z.enum(MODEL_IDS).optional(),
        permissionMode: z.string().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get("userId")
      const id = c.req.param("id")
      const body = c.req.valid("json")

      // ユーザーが手動で title を編集したら titleGenerated を立てて、
      // 以後の自動要約 (1 通目 Haiku) で上書きされないようにする。
      const patch: dao.SessionPatch = { ...body }
      if (body.title !== undefined) {
        patch.titleGenerated = true
      }
      // patchSession は ConditionExpression で存在チェック。null は所有権 or 不在。
      const updated = await dao.patchSession(userId, id, patch)
      if (!updated) return c.json({ error: "Not found" }, 404)
      return c.json(updated)
    },
  )
  .delete("/api/sessions/:id", async (c) => {
    const userId = c.get("userId")
    const id = c.req.param("id")

    const session = await getOwnedSession(id, userId)
    if (!session) return c.json({ error: "Not found" }, 404)
    await dao.deleteSession(userId, id)
    delete pendingStreams[id]
    return c.body(null, 204)
  })

  // --- Messages ---
  .get("/api/sessions/:id/messages", async (c) => {
    const userId = c.get("userId")
    const id = c.req.param("id")

    const session = await getOwnedSession(id, userId)
    if (!session) return c.json({ error: "Not found" }, 404)
    if (!session.sdkSessionId) {
      log.info("messages: no sdkSessionId yet", { userId, sessionId: id })
      return c.json([])
    }

    try {
      // pi-coding-agent では sdkSessionId に SessionManager.open() で開ける JSONL ファイルの
      // 絶対パスを保存している (Claude Agent SDK 時代の "UUID + dir" とは別の identifier)。
      const sm = SessionManager.open(session.sdkSessionId)
      const entries = sm.getBranch() // root → 現在の leaf までのパス
      // root → leaf 順に走査し、直近の model_change を「現在のモデル」として保持。
      // 以降の assistant メッセージに付与すると「どのモデルが回答したか」を復元できる。
      const stored: StoredMessage[] = []
      let currentModel: StoredMessage["model"]
      for (const entry of entries) {
        const mc = readModelChange(entry)
        if (mc) {
          currentModel = resolveModelLabel(mc.provider, mc.modelId)
          continue
        }
        const m = normalizePiEntry(entry, id)
        if (!m) continue
        if (m.role === "assistant" && currentModel) m.model = currentModel
        stored.push(m)
      }
      relocateSlashSkillRefsToAssistant(stored)
      log.info("messages: fetched", {
        userId,
        sessionId: id,
        sdkSessionId: session.sdkSessionId,
        workdir: WORKDIR_USER,
        rawCount: entries.length,
        normalizedCount: stored.length,
      })
      return c.json(stored)
    } catch (err) {
      log.error("pi SessionManager.open / getPath failed", {
        userId,
        sessionId: id,
        sdkSessionId: session.sdkSessionId,
        workdir: WORKDIR_USER,
        error: String(err),
      })
      return c.json([])
    }
  })
  .post(
    "/api/sessions/:id/messages",
    zValidator(
      "json",
      z.object({
        content: z.string(),
        attachedFileIds: z.array(z.string()).optional(),
        model: z.enum(MODEL_IDS).optional(),
      }),
    ),
    async (c) => {
      const userId = c.get("userId")
      const sessionId = c.req.param("id")
      const { content, attachedFileIds, model: requestModel } = c.req.valid("json")

      // 添付ファイルがある場合は agent に渡すプロンプトの先頭に絶対パスを差し込む。
      // Read/Glob/Grep は writableRoot 配下に限らず全許可なので、エージェント側は
      // この絶対パスを直接 Read できる。画像は Claude Code の Read ツールが Vision
      // 入力としてそのままモデルへ渡すため、画像かどうかを明示してエージェントに
      // 「中身を確認したいなら Read を呼ぶ」と意思決定させる。
      let promptForAgent = content
      let attachedFiles: UploadedFile[] = []
      if (attachedFileIds && attachedFileIds.length > 0) {
        attachedFiles = await fileStore.getByIds(attachedFileIds)
        if (attachedFiles.length > 0) {
          const images = attachedFiles.filter((f) => isImageFile(f))
          const others = attachedFiles.filter((f) => !isImageFile(f))
          const lines: string[] = []
          if (images.length > 0) {
            lines.push(
              "[画像ファイル — Read ツールで開くと Claude が Vision で内容を直接参照できます]",
            )
            for (const f of images) {
              lines.push(`- ${f.name} (path: ${f.path}, ${f.size} bytes)`)
            }
          }
          if (others.length > 0) {
            if (lines.length > 0) lines.push("")
            lines.push("[添付ファイル — 必要に応じて Read ツールで参照してください]")
            for (const f of others) {
              lines.push(`- ${f.name} (path: ${f.path}, ${f.size} bytes)`)
            }
          }
          promptForAgent = `${lines.join("\n")}\n\n${content}`
        }
      }

      const session = await getOwnedSession(sessionId, userId)
      if (!session) return c.json({ error: "Not found" }, 404)

      // 自動タイトル付け: "New Session" のままなら 1 通目を要約。
      // updatedAt は LSI sortKey なので必ず更新する。
      // Haiku 要約が成功するまでの「とりあえずタイトル」として先頭 50 文字を入れる。
      // 1 通目応答完了後に Haiku が走り、より良いタイトルへ置き換えるか、
      // 失敗時はこのフォールバックタイトルがそのまま残る。
      const now = Date.now()
      const activeModel = requestModel ?? session.model
      const titlePatch =
        session.title === "New Session"
          ? {
              title: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
            }
          : {}
      await dao.patchSession(
        userId,
        sessionId,
        { ...titlePatch, ...(requestModel ? { model: requestModel } : {}) },
        now,
      )

      // titleGenerated がまだ立っていなければ、この応答が完了したタイミングで Haiku を走らせる。
      // 既に Haiku が試行済 or ユーザー手動編集済のセッションは対象外。
      const shouldGenerateTitle = session.titleGenerated !== true

      // SSE エンドポイントが拾うキューに積む。pi-coding-agent の SessionManager が
      // PI_AGENT_DIR/sessions/<file>.jsonl にメッセージを書き出すので、ここでは
      // 別途 messagesBySession への push は不要。
      pendingStreams[sessionId] = {
        kind: "agent",
        prompt: promptForAgent,
        sessionId,
        model: activeModel,
        generateTitle: shouldGenerateTitle,
        userMessageText: content,
        userId,
        ...(session.workingDir ? { workingDir: session.workingDir } : {}),
      }

      // 旧 API 互換: client は userMessage/assistantMessageId を期待するため最低限返す。
      // 実体はその場で SSE で配信される SDK transcript が真の情報源。
      const userMsg: StoredMessage = {
        id: uuid(),
        sessionId,
        role: "user",
        content,
        timestamp: now,
      }
      const assistantMsgId = uuid()
      return c.json({
        userMessage: userMsg,
        assistantMessageId: assistantMsgId,
      })
    },
  )

  // --- SSE Stream ---
  .get("/api/sessions/:id/stream", async (c) => {
    const userId = c.get("userId")
    const sessionId = c.req.param("id")

    const session = await getOwnedSession(sessionId, userId)
    if (!session) return c.json({ error: "Not found" }, 404)

    const pending = pendingStreams[sessionId]

    if (!pending) {
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ event: "done", data: "{}" })
      })
    }

    delete pendingStreams[sessionId]

    return streamSSE(c, async (stream) => {
      await streamClaudeAgentResponse(stream, {
        prompt: pending.prompt,
        userId,
        sessionId: pending.sessionId,
        modelId: pending.model,
        workingDir: pending.workingDir,
        titleGenerationInput: pending.generateTitle
          ? { userMessage: pending.userMessageText }
          : undefined,
      })
      // pending.generateTitle === true のターンだけ Haiku 要約が走り、サーバ側で
      // セッションタイトル/titleGenerated フラグが書き換わっている可能性がある。
      // それ以外のターンでサイドバー一覧 refetch を抑止するためのヒントを done に同梱する。
      const titleUpdated = pending.generateTitle === true
      await stream.writeSSE({ event: "done", data: JSON.stringify({ titleUpdated }) })
    })
  })

  // --- Files (uploads) ---
  // セッションに紐づくファイルアップロード。multipart/form-data の `file` フィールドを 1 つ受け取る。
  // 保存先は `${UPLOAD_DIR}/${sessionId}/<uuid>_<sanitized>`。エージェントは絶対パスで Read できる。
  // 制限: 拡張子ホワイトリスト / サイズ上限 (デフォルト 10MB) / 1 セッションあたりの保持数上限。
  .post("/api/sessions/:id/files", async (c) => {
    const userId = c.get("userId")
    const sessionId = c.req.param("id")

    const session = await getOwnedSession(sessionId, userId)
    if (!session) return c.json({ error: "Not found" }, 404)

    const contentLength = Number(c.req.header("content-length") ?? "0")
    // 余裕を持って 2 倍程度を上限に。multipart の境界文字列でわずかに膨れるため。
    if (contentLength > MAX_FILE_SIZE * 2) {
      return c.json({ error: "payload too large" }, 413)
    }

    let form: FormData
    try {
      form = await c.req.formData()
    } catch (err) {
      log.warn("upload: formData parse failed", {
        sessionId,
        error: String(err),
      })
      return c.json({ error: "invalid multipart body" }, 400)
    }

    const entry = form.get("file")
    if (!entry || typeof entry === "string") {
      return c.json({ error: "missing file field" }, 400)
    }
    const blob = entry as File

    try {
      const saved = await fileStore.save({
        name: blob.name,
        type: blob.type,
        size: blob.size,
        arrayBuffer: () => blob.arrayBuffer(),
      })
      // path はサーバ内部の絶対パスなので client には返さない (情報露出を最小限に)
      return c.json({
        id: saved.id,
        name: saved.name,
        size: saved.size,
        mimeType: saved.mimeType,
        createdAt: saved.createdAt,
      })
    } catch (err) {
      if (err instanceof UploadError) {
        return c.json({ error: err.message }, err.status as 400 | 413 | 415 | 429)
      }
      log.error("upload save failed", { sessionId, error: String(err) })
      return c.json({ error: "upload failed" }, 500)
    }
  })
  // session に紐付かないファイルアップロード。FileTree (working directory タブ) の
  // Upload ボタン経由で使う。保存先 / 制限は `/api/sessions/:id/files` と同じ
  // fileStore.save() を使うので、結果として同じ UPLOAD_DIR に flat 保存される。
  .post("/api/uploads", async (c) => {
    const userId = c.get("userId")

    const contentLength = Number(c.req.header("content-length") ?? "0")
    if (contentLength > MAX_FILE_SIZE * 2) {
      return c.json({ error: "payload too large" }, 413)
    }

    let form: FormData
    try {
      form = await c.req.formData()
    } catch (err) {
      log.warn("upload: formData parse failed", { userId, error: String(err) })
      return c.json({ error: "invalid multipart body" }, 400)
    }

    const entry = form.get("file")
    if (!entry || typeof entry === "string") {
      return c.json({ error: "missing file field" }, 400)
    }
    const blob = entry as File

    try {
      const saved = await fileStore.save({
        name: blob.name,
        type: blob.type,
        size: blob.size,
        arrayBuffer: () => blob.arrayBuffer(),
      })
      return c.json({
        id: saved.id,
        name: saved.name,
        size: saved.size,
        mimeType: saved.mimeType,
        createdAt: saved.createdAt,
      })
    } catch (err) {
      if (err instanceof UploadError) {
        return c.json({ error: err.message }, err.status as 400 | 413 | 415 | 429)
      }
      log.error("upload save failed", { userId, error: String(err) })
      return c.json({ error: "upload failed" }, 500)
    }
  })
  .get("/api/sessions/:id/files", async (c) => {
    const userId = c.get("userId")
    const sessionId = c.req.param("id")

    const session = await getOwnedSession(sessionId, userId)
    if (!session) return c.json({ error: "Not found" }, 404)

    // ユーザー単位フラット保存に変更したので、sessionId に関わらず同じ一覧を返す。
    // 所有権チェックは session 経由でユーザー特定する代理として残してある。
    const files = await fileStore.list()
    return c.json(
      files.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        createdAt: f.createdAt,
      })),
    )
  })
  .delete("/api/sessions/:id/files/:fileId", async (c) => {
    const userId = c.get("userId")
    const sessionId = c.req.param("id")
    const fileId = c.req.param("fileId")

    const session = await getOwnedSession(sessionId, userId)
    if (!session) return c.json({ error: "Not found" }, 404)

    const ok = await fileStore.delete(fileId)
    if (!ok) return c.json({ error: "Not found" }, 404)
    return c.body(null, 204)
  })
  // セッション添付の実体を返す。リロード時に user message のサムネイル再現に使う。
  // 認証は他の `/api/*` と同じく authMiddleware (X-User-Id / Bearer JWT) に依存。
  // client は customFetchHeaders で取得して blob URL を作る (img 直接参照では JWT が
  // 渡らないので利用しない)。
  .get("/api/sessions/:id/files/:fileId", async (c) => {
    const userId = c.get("userId")
    const sessionId = c.req.param("id")
    const fileId = c.req.param("fileId")

    const session = await getOwnedSession(sessionId, userId)
    if (!session) return c.json({ error: "Not found" }, 404)

    const files = await fileStore.list()
    const target = files.find((f) => f.id === fileId)
    if (!target) return c.json({ error: "Not found" }, 404)

    let buf: Buffer
    try {
      buf = await readFile(target.path)
    } catch {
      return c.json({ error: "Not found" }, 404)
    }
    const mimeType = getMimeFromName(target.name)
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(buf.byteLength),
      },
    })
  })

  // --- Plans ---
  .post("/api/plans/:id/approve", (c) => {
    return c.json({ status: "approved" as const })
  })
  .post("/api/plans/:id/reject", (c) => {
    return c.json({ status: "rejected" as const })
  })

  // --- Working dir file tree ---
  // 右パネルに表示する用。artifactStore.getDir() (= Claude SDK の cwd) 配下を
  // 再帰スキャンしてツリー構造で返す。
  // 2 セクション (skills / workspace) で分けて返し、UI 側で 2 ツリーとして描画する。
  //   - skills    : <root>/.claude/skills/ 配下
  //   - workspace : <root> 配下 (`.claude` は除外)
  // path は workdir root からの相対パスで、`/api/files/content` プレビューと互換。
  // 後方互換のため一部クライアントは配列で消費していた経路を残しつつ、
  // 新クライアントは `{skills, workspace}` を読む。
  .get("/api/files", async (c) => {
    const root = artifactStore.getDir()
    try {
      const workspace = await buildFileTree(root, root, 0)
      const skillsAbs = join(root, ".claude", "skills")
      let skills: FileNode[] = []
      try {
        skills = await buildFileTree(skillsAbs, root, 0)
      } catch {
        skills = []
      }
      return c.json({ skills, workspace })
    } catch (err) {
      log.error("buildFileTree failed", { root, error: String(err) })
      return c.json({ skills: [], workspace: [] })
    }
  })

  // --- Working dir file content ---
  // 右パネルでクリックされたファイルを modal でプレビューするための実体配信。
  // path traversal を防ぐため、resolve 後のパスが artifactStore.getDir() 配下に
  // 収まっていることを確認する。サイズ上限を超えるものは 413 を返す。
  .get("/api/files/content", async (c) => {
    const relPath = c.req.query("path")
    if (!relPath || relPath.length > 512 || relPath.includes("\0")) {
      return c.json({ error: "invalid path" }, 400)
    }
    const root = artifactStore.getDir()
    const rootAbs = resolve(root)
    const fileAbs = resolve(rootAbs, relPath)
    if (fileAbs !== rootAbs && !fileAbs.startsWith(`${rootAbs}/`)) {
      return c.json({ error: "invalid path" }, 400)
    }
    let st: import("node:fs").Stats
    try {
      st = await stat(fileAbs)
    } catch {
      return c.json({ error: "Not found" }, 404)
    }
    if (!st.isFile()) {
      return c.json({ error: "Not a file" }, 400)
    }
    const PREVIEW_MAX_BYTES = 10 * 1024 * 1024
    if (st.size > PREVIEW_MAX_BYTES) {
      return c.json({ error: "file too large for preview" }, 413)
    }
    let buf: Buffer
    try {
      buf = await readFile(fileAbs)
    } catch {
      return c.json({ error: "Not found" }, 404)
    }
    const fileName = relPath.split("/").pop() ?? relPath
    const mimeType = getMimeFromName(fileName)
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=60",
        "Content-Length": String(buf.byteLength),
      },
    })
  })

  // --- Working directories (project picker) ---
  // セッション作成時の「作業ディレクトリ」候補。WORKDIR_USER 配下のサブディレクトリを
  // 平坦化して返す。FILETREE_SKIP / 深さ上限は buildFileTree のものを流用する。
  .get("/api/workdirs", async (c) => {
    if (!WORKDIR_USER) return c.json({ dirs: [] })
    const root = resolve(WORKDIR_USER)
    try {
      const tree = await buildFileTree(root, root, 0)
      return c.json({ dirs: flattenDirs(tree) })
    } catch (err) {
      log.error("list workdirs failed", { root, error: String(err) })
      return c.json({ dirs: [] })
    }
  })
  // 「新規プロジェクトを作成」。相対パスを受け取り検証して mkdir する。
  .post(
    "/api/workdirs",
    zValidator("json", z.object({ path: z.string().min(1).max(512) })),
    async (c) => {
      const userId = c.get("userId")
      const { path } = c.req.valid("json")
      const rel = normalizeWorkingDirInput(path)
      if (!rel) return c.json({ error: "invalid path" }, 400)
      const resolved = resolveWorkingDir(rel)
      if (!resolved) return c.json({ error: "invalid path" }, 400)
      try {
        await mkdir(resolved.abs, { recursive: true })
      } catch (err) {
        log.error("create workdir failed", { userId, dir: resolved.rel, error: String(err) })
        return c.json({ error: "failed to create directory" }, 500)
      }
      const name = resolved.rel.split("/").pop() ?? resolved.rel
      return c.json({ path: resolved.rel, name }, 201)
    },
  )

  // --- Personal skills ---
  // workdir/.claude/skills/<name>/SKILL.md を CRUD する。SDK 側は project scope で
  // この場所を自動探索するため、保存内容は次回 Claude query から即時反映される。
  // docs/personal-skill-management-spec.md 参照。
  .get("/api/skills", async (c) => {
    try {
      const skills = await skillStore.list()
      return c.json({ skills })
    } catch (err) {
      log.error("skills list failed", { error: String(err) })
      return c.json({ error: "internal", message: "failed to list skills" }, 500)
    }
  })
  .get("/api/skills/common", async (c) => {
    try {
      const skills = await skillStore.listCommon()
      return c.json({ skills })
    } catch (err) {
      log.error("skills listCommon failed", { error: String(err) })
      return c.json({ error: "internal", message: "failed to list common skills" }, 500)
    }
  })
  .post(
    "/api/skills",
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(64),
        description: z.string().min(1).max(2000),
        body: z.string().max(1024 * 1024),
      }),
    ),
    async (c) => {
      const userId = c.get("userId")
      const input = c.req.valid("json")
      try {
        const created = await skillStore.create({
          name: input.name,
          description: input.description,
          body: input.body,
          createdBy: "user",
        })
        log.info("skill created via API", { userId, name: created.name })
        return c.json(created, 201)
      } catch (err) {
        if (err instanceof SkillError) {
          return c.json(
            { error: err.code, message: err.message },
            err.status as 400 | 409 | 413 | 429,
          )
        }
        log.error("skill create failed", { userId, error: String(err) })
        return c.json({ error: "internal", message: "failed to create skill" }, 500)
      }
    },
  )
  .get("/api/skills/:name", async (c) => {
    const name = c.req.param("name")
    try {
      const skill = await skillStore.get(name)
      if (!skill) return c.json({ error: "not_found", message: "skill not found" }, 404)
      return c.json(skill)
    } catch (err) {
      log.error("skill get failed", { name, error: String(err) })
      return c.json({ error: "internal", message: "failed to get skill" }, 500)
    }
  })
  .put(
    "/api/skills/:name",
    zValidator(
      "json",
      z.object({
        description: z.string().min(1).max(2000),
        body: z.string().max(1024 * 1024),
      }),
    ),
    async (c) => {
      const userId = c.get("userId")
      const name = c.req.param("name")
      const input = c.req.valid("json")
      try {
        const updated = await skillStore.update(name, input)
        log.info("skill updated via API", { userId, name })
        return c.json(updated)
      } catch (err) {
        if (err instanceof SkillError) {
          return c.json({ error: err.code, message: err.message }, err.status as 400 | 404 | 413)
        }
        log.error("skill update failed", { userId, name, error: String(err) })
        return c.json({ error: "internal", message: "failed to update skill" }, 500)
      }
    },
  )
  .delete("/api/skills/:name", async (c) => {
    const userId = c.get("userId")
    const name = c.req.param("name")
    try {
      const ok = await skillStore.delete(name)
      if (!ok) return c.json({ error: "not_found", message: "skill not found" }, 404)
      log.info("skill deleted via API", { userId, name })
      return c.body(null, 204)
    } catch (err) {
      log.error("skill delete failed", { userId, name, error: String(err) })
      return c.json({ error: "internal", message: "failed to delete skill" }, 500)
    }
  })

  // --- HTML artifacts ---
  // claude-agent が html_block_start/delta/end の流れで cwd 直下に <slug>-<id>.html を書き出す。
  // path traversal を防ぐため、ファイル名に path separator / 親参照 / null を含まないこと、
  // 解決後の絶対パスが artifactStore.getDir() 配下に収まることを確認する。
  // iframe で読まれることが前提なので resize スクリプトを末尾に注入する。
  .get("/api/artifacts/:filename", async (c) => {
    const filename = c.req.param("filename")
    if (
      !filename ||
      filename.length > 200 ||
      !filename.toLowerCase().endsWith(".html") ||
      /[/\\\0]/.test(filename) ||
      filename.includes("..")
    ) {
      return c.text("invalid filename", 400)
    }
    const dir = artifactStore.getDir()
    const filePath = join(dir, filename)
    // resolve 後のパスが artifactStore 配下に収まっているか最終チェック
    const dirAbs = resolve(dir)
    const fileAbs = resolve(filePath)
    if (fileAbs !== dirAbs && !fileAbs.startsWith(`${dirAbs}/`)) {
      return c.text("invalid filename", 400)
    }
    let html: string
    try {
      html = await readFile(filePath, "utf8")
    } catch {
      return c.text("not found", 404)
    }
    const withScript = `${html}<script>
(function(){
  function reportHeight(){
    var h = document.documentElement.scrollHeight || document.body.scrollHeight;
    parent.postMessage({ type:'html-block-resize', height: h }, '*');
  }
  if (document.readyState==='complete') reportHeight();
  else window.addEventListener('load', reportHeight);
  new MutationObserver(reportHeight).observe(document.body, { childList:true, subtree:true });
})();
</script>`
    return c.html(withScript)
  })

// ---- PDF エクスポート ---------------------------------------------------
// クライアントから印刷用 HTML を受け取り、Playwright (headless Chromium) で
// page.pdf() を呼んでダイアログなしの PDF バイナリを返す。
// Docker dev イメージには chromium apk + PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH が設定済み。

const EXPORT_PDF_SCHEMA = z.object({
  html: z.string().max(10 * 1024 * 1024),
  fileName: z.string().max(255).default("document.pdf"),
})

routes.post("/api/export/pdf", zValidator("json", EXPORT_PDF_SCHEMA), async (c) => {
  const { html, fileName } = c.req.valid("json")
  let browser: import("playwright").Browser | null = null
  try {
    const { chromium } = await import("playwright")
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle", timeout: 20000 })
    // Web フォント (Noto Sans JP 等) が完全に適用されるのを待つ
    await page.evaluate(() => document.fonts.ready)
    // Mermaid / KaTeX のクライアントサイドレンダリングを待つ
    await page.waitForTimeout(2000)
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "15mm", right: "15mm" },
      displayHeaderFooter: false,
    })
    const safeName = fileName.replace(/[^\w\-.]/g, "_")
    return new Response(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.text(`PDF export failed: ${msg}`, 500)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
})

export type AppType = typeof routes
export default routes
