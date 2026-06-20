import { v4 as uuid } from "uuid"
import { type AgentStreamSink, runAgentQuery } from "./agent-query"
import { artifactStore } from "./artifact-store"
import {
  addSessionUsage,
  getSdkSessionId,
  patchSession,
  setSdkSessionId,
} from "./dynamodb-sessions"
import { createLogger, serializeError } from "./logger"
import { resolvePiModel } from "./models"
import type { SSEWriter } from "./sse"
import { generateSessionTitle } from "./title-generator"
import { webSearchTool } from "./tools/web-search"

const log = createLogger("pi-agent")

// pi-coding-agent の cwd / セッションファイル出力先。
// docker-compose は WORKDIR_USER=/home/node/workdir で export する。CLAUDE_CWD は
// 旧構成からの後方互換フォールバック。両方未設定 (mock / 素の node 実行) では undefined。
const USER_CWD = process.env.WORKDIR_USER ?? process.env.CLAUDE_CWD

// 共通 Skills のディレクトリ。pi では `--skill <path>` 相当を skillPaths で渡す。
// docker-compose は ./common-skills を RO bind し、`WIZ_CLAUDE_COMMON_PLUGIN_PATH` で
// パスを伝える。未設定なら共通 skill 無しで pi 起動。
const COMMON_SKILLS_DIR = process.env.WIZ_CLAUDE_COMMON_PLUGIN_PATH

// pi 設定ディレクトリ (settings.json / auth.json / models.json / sessions/ など)。
const PI_AGENT_DIR = process.env.PI_AGENT_DIR

// pi の built-in tool allowlist。Claude SDK 時代の "Write/Edit/Read/Glob/Grep/Bash..." 列挙に
// 概ね対応するが、pi の標準 tool は小文字: read / bash / edit / write / grep / find / ls。
// MCP / Skill auto-trigger / TodoWrite / WebFetch などは pi には無いので外す。
const DEFAULT_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"]

// Claude には HTML を必ず ```html フェンスで返してもらう。
// HtmlFenceParser はこの正確な開始マーカーを探して html_block_* SSE を流すので、
// 無タグの ``` や生 HTML だと拾えずに iframe 描画も artifactStore 保存も走らない。
const HTML_FENCE_INSTRUCTION = `\
When you produce HTML for the user (full pages, snippets, or any markup the user might want to see rendered), \
always wrap it in fenced code blocks tagged exactly \`\`\`html (lowercase, no spaces). \
The closing fence must be on its own line. Do not emit bare HTML outside a fence and do not use a different language tag.`

function buildBaseOptions(modelId: string) {
  const cwd = USER_CWD
  return {
    ...resolvePiModel(modelId),
    ...(cwd ? { cwd } : {}),
    ...(PI_AGENT_DIR ? { agentDir: PI_AGENT_DIR } : {}),
    appendSystemPrompt: HTML_FENCE_INSTRUCTION,
    tools: [...DEFAULT_TOOLS, "web_search"],
    customTools: [webSearchTool],
    ...(COMMON_SKILLS_DIR ? { skillPaths: [COMMON_SKILLS_DIR] } : {}),
  }
}

interface ParsedEvent {
  event: string
  data: object
}

/**
 * pi-coding-agent の tool 名はもともと小文字 ("read" / "bash" 等) なので、
 * MCP 接頭辞 (`mcp__<server>__<tool>`) のような変換は基本不要。
 * 拡張ツールが pi で `mcp__` 風の名前を採用するケースに備えて変換ロジックは残す。
 */
export function formatMcpToolName(rawName: string): string | null {
  if (!rawName.startsWith("mcp__")) return null
  const rest = rawName.slice("mcp__".length)
  const sep = rest.indexOf("__")
  if (sep < 0) return rest
  const server = rest.slice(0, sep)
  const tool = rest.slice(sep + 2)
  return `${server} / ${tool}`
}

function shortenPath(p: string): string {
  if (!USER_CWD) return p
  if (p === USER_CWD) return "."
  const prefix = `${USER_CWD}/`
  return p.startsWith(prefix) ? p.slice(prefix.length) : p
}

function truncate(s: string, max = 200): string {
  const oneLine = s.replace(/\s+/g, " ").trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

/**
 * pi の tool 引数から chip 用の 1 行説明を作る。
 * pi の built-in tool は read/bash/edit/write/grep/find/ls。Claude SDK 時代の
 * Read/Edit/Bash/... の Large-case 名も互換で拾う。
 */
export function summarizeToolInput(
  name: string,
  input: Record<string, unknown> | undefined,
): string | undefined {
  if (!input) return undefined
  const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined)
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined)

  const lower = name.toLowerCase()
  switch (lower) {
    case "read":
    case "write":
    case "edit":
    case "multiedit":
    case "notebookedit": {
      const fp = str(input.file_path) ?? str(input.path) ?? str(input.notebook_path)
      return fp ? truncate(shortenPath(fp)) : undefined
    }
    case "bash":
    case "bashoutput": {
      const cmd = str(input.command)
      return cmd ? truncate(cmd) : undefined
    }
    case "glob":
    case "find": {
      const pattern = str(input.pattern) ?? str(input.glob)
      const path = str(input.path) ?? str(input.cwd)
      if (!pattern) return undefined
      return truncate(path ? `${pattern} in ${shortenPath(path)}` : pattern)
    }
    case "grep": {
      const pattern = str(input.pattern)
      const path = str(input.path)
      if (!pattern) return undefined
      return truncate(path ? `${pattern} in ${shortenPath(path)}` : pattern)
    }
    case "ls": {
      const path = str(input.path) ?? str(input.cwd)
      return path ? truncate(shortenPath(path)) : undefined
    }
    case "webfetch": {
      const url = str(input.url)
      return url ? truncate(url) : undefined
    }
    case "websearch":
    case "web_search": {
      const query = str(input.query)
      return query ? truncate(query) : undefined
    }
    case "todowrite": {
      const todos = input.todos
      const n = Array.isArray(todos) ? todos.length : num(input.count)
      return typeof n === "number" ? `${n} todos` : undefined
    }
    default: {
      const fp = str(input.file_path) ?? str(input.path)
      if (fp) return truncate(shortenPath(fp))
      const cmd = str(input.command)
      if (cmd) return truncate(cmd)
      const pattern = str(input.pattern) ?? str(input.glob)
      if (pattern) return truncate(pattern)
      const query = str(input.query)
      if (query) return truncate(query)
      const url = str(input.url)
      if (url) return truncate(url)
      return undefined
    }
  }
}

/**
 * Streaming parser that detects ```html fences in text chunks
 * and converts them to html_block_start/delta/end events.
 */
class HtmlFenceParser {
  private buffer = ""
  private inHtmlBlock = false
  private currentBlockId: string | null = null

  process(chunk: string): ParsedEvent[] {
    const events: ParsedEvent[] = []
    this.buffer += chunk

    while (this.buffer.length > 0) {
      if (this.inHtmlBlock) {
        const closeIdx = this.buffer.indexOf("\n```")
        if (closeIdx !== -1) {
          const htmlContent = this.buffer.slice(0, closeIdx)
          if (htmlContent) {
            events.push({
              event: "html_block_delta",
              data: { id: this.currentBlockId, chunk: htmlContent },
            })
          }
          events.push({
            event: "html_block_end",
            data: { id: this.currentBlockId },
          })
          this.inHtmlBlock = false
          this.currentBlockId = null
          this.buffer = this.buffer.slice(closeIdx + 4)
          if (this.buffer.startsWith("\n")) {
            this.buffer = this.buffer.slice(1)
          }
        } else {
          const safeLen = Math.max(0, this.buffer.length - 4)
          if (safeLen > 0) {
            events.push({
              event: "html_block_delta",
              data: { id: this.currentBlockId, chunk: this.buffer.slice(0, safeLen) },
            })
            this.buffer = this.buffer.slice(safeLen)
          }
          break
        }
      } else {
        const openIdx = this.buffer.indexOf("```html")
        if (openIdx !== -1) {
          const textBefore = this.buffer.slice(0, openIdx)
          if (textBefore) {
            events.push({
              event: "text_delta",
              data: { chunk: textBefore },
            })
          }
          this.currentBlockId = uuid()
          events.push({
            event: "html_block_start",
            data: { id: this.currentBlockId },
          })
          this.inHtmlBlock = true
          this.buffer = this.buffer.slice(openIdx + 7)
          if (this.buffer.startsWith("\n")) {
            this.buffer = this.buffer.slice(1)
          }
        } else {
          const safeLen = Math.max(0, this.buffer.length - 7)
          if (safeLen > 0) {
            events.push({
              event: "text_delta",
              data: { chunk: this.buffer.slice(0, safeLen) },
            })
            this.buffer = this.buffer.slice(safeLen)
          }
          break
        }
      }
    }

    return events
  }

  flush(): ParsedEvent[] {
    const events: ParsedEvent[] = []
    if (this.inHtmlBlock) {
      if (this.buffer) {
        events.push({
          event: "html_block_delta",
          data: { id: this.currentBlockId, chunk: this.buffer },
        })
      }
      events.push({
        event: "html_block_end",
        data: { id: this.currentBlockId },
      })
    } else if (this.buffer) {
      events.push({
        event: "text_delta",
        data: { chunk: this.buffer },
      })
    }
    this.buffer = ""
    this.inHtmlBlock = false
    this.currentBlockId = null
    return events
  }
}

export interface StreamClaudeAgentParams {
  prompt: string
  userId: string
  sessionId: string
  modelId: string
  titleGenerationInput?: { userMessage: string }
}

function stripAttachmentPrefix(prompt: string): string {
  let rest = prompt
  while (rest.startsWith("[画像ファイル") || rest.startsWith("[添付ファイル")) {
    const blank = rest.indexOf("\n\n")
    if (blank === -1) return ""
    rest = rest.slice(blank + 2)
  }
  return rest
}

/**
 * pi-coding-agent を使って 1 ターン応答を SSE にストリームする。
 * 旧 `streamClaudeAgentResponse` の名前を残しているのは routes.ts 側との互換目的。
 */
export async function streamClaudeAgentResponse(
  stream: SSEWriter,
  params: StreamClaudeAgentParams,
): Promise<void> {
  const { prompt, userId, sessionId, modelId, titleGenerationInput } = params
  const previousSessionFile = await getSdkSessionId(userId, sessionId)

  const options = {
    ...buildBaseOptions(modelId),
    ...(previousSessionFile ? { resumeSessionFile: previousSessionFile } : {}),
  }

  // slash-style "/<name>" 入力を検知し、client に通知する。pi 側は file-based
  // prompt template として `.pi/prompts/<name>.md` を展開するため、UI 側で chip を
  // 出したいなら手前で通知しておく。
  const slashMatch = stripAttachmentPrefix(prompt).match(/^\/([a-z0-9][a-z0-9-]{1,62})\b/)
  if (slashMatch) {
    const skillName = slashMatch[1]
    await stream
      .writeSSE({
        event: "skill_invoked",
        data: JSON.stringify({ id: `slash-${Date.now()}`, name: skillName, source: "slash" }),
      })
      .catch((err) =>
        log.error("failed to emit slash skill_invoked", {
          sessionId,
          skillName,
          error: String(err),
        }),
      )
  }

  const parser = new HtmlFenceParser()
  const ASSISTANT_TEXT_BUFFER_MAX = 8000
  let assistantTextBuffer = ""

  const handleEvent = async (pe: ParsedEvent): Promise<void> => {
    if (pe.event === "html_block_start") {
      const { id } = pe.data as { id: string }
      await artifactStore.start(id)
    } else if (pe.event === "html_block_delta") {
      const { id, chunk } = pe.data as { id: string; chunk: string }
      artifactStore.append(id, chunk)
    } else if (pe.event === "html_block_end") {
      const { id } = pe.data as { id: string }
      const url = await artifactStore.end(id)
      if (url) (pe.data as { id: string; url?: string }).url = url
    }
    await stream.writeSSE({
      event: pe.event,
      data: JSON.stringify(pe.data),
    })
  }

  const emitEvents = async (events: ParsedEvent[]) => {
    for (const pe of events) {
      await handleEvent(pe)
    }
  }

  const sink: AgentStreamSink = {
    onSessionId(piSessionFile) {
      setSdkSessionId(userId, sessionId, piSessionFile).catch((err) => {
        log.error("failed to persist pi sessionFile", {
          userId,
          sessionId,
          piSessionFile,
          error: String(err),
        })
      })
    },
    async onTextDelta(text) {
      if (titleGenerationInput && assistantTextBuffer.length < ASSISTANT_TEXT_BUFFER_MAX) {
        assistantTextBuffer += text
      }
      await emitEvents(parser.process(text))
    },
    async onToolUseStart(tool) {
      if (tool.name.startsWith("mcp__")) {
        const display = formatMcpToolName(tool.name)
        if (display) {
          const detail = summarizeToolInput(tool.name, tool.input)
          await stream.writeSSE({
            event: "skill_invoked",
            data: JSON.stringify({
              id: tool.id,
              name: display,
              source: "mcp",
              ...(detail ? { detail } : {}),
            }),
          })
        }
      } else {
        const detail = summarizeToolInput(tool.name, tool.input)
        await stream.writeSSE({
          event: "skill_invoked",
          data: JSON.stringify({
            id: tool.id,
            name: tool.name,
            source: "builtin",
            ...(detail ? { detail } : {}),
          }),
        })
      }
    },
    onUsage(delta) {
      addSessionUsage(userId, sessionId, delta).catch((err) => {
        log.error("failed to persist session usage", {
          userId,
          sessionId,
          error: serializeError(err),
        })
      })
      return stream
        .writeSSE({ event: "usage", data: JSON.stringify(delta) })
        .catch((err) => log.error("failed to emit usage SSE", { sessionId, error: String(err) }))
    },
    async onDone() {
      await emitEvents(parser.flush())
    },
    onError(err) {
      return stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: err.message }),
      })
    },
  }

  await runAgentQuery({ prompt, options, sessionId }, sink)

  if (titleGenerationInput) {
    await runTitleGenerationWithCap({
      userId,
      sessionId,
      userMessage: titleGenerationInput.userMessage,
      assistantMessage: assistantTextBuffer,
    })
  }
}

const TITLE_GEN_HARD_CAP_MS = 8000

async function runTitleGenerationWithCap(input: {
  userId: string
  sessionId: string
  userMessage: string
  assistantMessage: string
}): Promise<void> {
  const { userId, sessionId, userMessage, assistantMessage } = input
  let title: string | null = null
  const hardCapController = new AbortController()
  const hardCapTimer = setTimeout(() => hardCapController.abort(), TITLE_GEN_HARD_CAP_MS)
  try {
    if (assistantMessage.trim()) {
      title = await generateSessionTitle(
        { userMessage, assistantMessage },
        { signal: hardCapController.signal },
      )
    }
  } catch (err) {
    log.warn("haiku session title generation threw", {
      userId,
      sessionId,
      error: serializeError(err),
    })
  } finally {
    clearTimeout(hardCapTimer)
  }
  const patch = title ? { title, titleGenerated: true } : { titleGenerated: true }
  try {
    await patchSession(userId, sessionId, patch)
    log.info("haiku session title applied", {
      userId,
      sessionId,
      generated: title !== null,
    })
  } catch (err) {
    log.error("haiku title patch failed", {
      userId,
      sessionId,
      error: serializeError(err),
    })
  }
}
