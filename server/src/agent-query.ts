import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { getModel, type KnownProvider, type Model } from "@earendil-works/pi-ai"
import { createLogger, serializeError } from "./logger"

const log = createLogger("agent-query")

export interface AgentToolUseStart {
  /** tool_call id (pi-coding-agent 内 unique) */
  id: string
  /** ツール名 ("read" / "bash" / "edit" / 拡張ツール名 等) */
  name: string
  /** ツール引数 (pi-coding-agent は tool_execution_start 時点で確定値を渡してくる) */
  input?: Record<string, unknown>
}

/**
 * 1 ターン分のトークン使用量・コストのデルタ。
 * pi-coding-agent の AssistantMessage.usage から正規化したもの。
 */
export interface AgentTurnUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}

export interface AgentStreamSink {
  /**
   * pi-coding-agent のセッションファイルパス (UUID 互換 sessionId とは別)。
   * resume 時に SessionManager.open(path) に渡せる identifier。
   */
  onSessionId(piSessionFile: string): void
  onTextDelta(text: string): void | Promise<void>
  /** tool_execution_start を変換した通知。skill 利用検知などに使う。 */
  onToolUseStart?(tool: AgentToolUseStart): void | Promise<void>
  onResult?(resultText: string, hasStreamedText: boolean): void | Promise<void>
  /** turn_end メッセージから取れたトークン使用量・コスト (1 ターン分のデルタ)。 */
  onUsage?(usage: AgentTurnUsage): void | Promise<void>
  onDone?(): void | Promise<void>
  onError(err: Error): void | Promise<void>
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function extractTurnUsage(message: unknown): AgentTurnUsage {
  if (!message || typeof message !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
    }
  }
  const usage = (message as { usage?: Record<string, unknown> }).usage
  if (!usage) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
    }
  }
  const cost = (usage.cost as Record<string, unknown> | undefined)?.total
  return {
    inputTokens: safeNum(usage.input),
    outputTokens: safeNum(usage.output),
    cacheReadInputTokens: safeNum(usage.cacheRead),
    cacheCreationInputTokens: safeNum(usage.cacheWrite),
    costUSD: safeNum(cost),
  }
}

export interface AgentQueryOptions {
  cwd?: string
  agentDir?: string
  provider?: string
  model?: string
  tools?: string[]
  /** appendSystemPrompt と排他: 既定 system prompt 全体を置き換える。 */
  systemPrompt?: string
  appendSystemPrompt?: string
  apiKeys?: Record<string, string>
  resumeSessionFile?: string
  skillPaths?: string[]
  /** カスタムツール (defineTool で作ったもの)。pi-coding-agent の customTools に直渡し。 */
  customTools?: ToolDefinition[]
  /** 呼び出し元から中断したい場合の AbortController (もしくは signal)。 */
  abortSignal?: AbortSignal
}

export interface AgentQueryParams {
  prompt: string
  sessionId?: string
  options: AgentQueryOptions
}

/**
 * pi-coding-agent SDK を使って 1 プロンプト分の応答をストリームする。
 *
 * Claude Agent SDK 時代の挙動とのマッピング:
 *   - system.init.session_id   → session.sessionFile (resume identifier)
 *   - stream_event/text_delta → message_update (assistantMessageEvent.text_delta)
 *   - tool_use                → tool_execution_start
 *   - result                  → turn_end (usage / message.content)
 */
export async function runAgentQuery(
  params: AgentQueryParams,
  sink: AgentStreamSink,
): Promise<void> {
  const opts = params.options

  const authStorage = AuthStorage.create()
  if (opts.apiKeys) {
    for (const [provider, key] of Object.entries(opts.apiKeys)) {
      authStorage.setRuntimeApiKey(provider, key)
    }
  }
  const modelRegistry = ModelRegistry.create(authStorage)

  // getModel は引数を KnownProvider に narrow するが、設定経由で任意 provider 名を
  // 受け取りたいので型を緩めて呼び出す (動的解決は ModelRegistry.find が担う)。
  const safeGetModel = (provider: string, model: string): Model<never> | undefined =>
    getModel(provider as KnownProvider, model as never) as Model<never> | undefined

  let resolvedModel: Model<never> | undefined
  if (opts.provider && opts.model) {
    resolvedModel =
      (modelRegistry.find(opts.provider, opts.model) as Model<never> | undefined) ??
      safeGetModel(opts.provider, opts.model)
  } else if (opts.model) {
    const slash = opts.model.indexOf("/")
    if (slash > 0) {
      const provider = opts.model.slice(0, slash)
      const id = opts.model.slice(slash + 1)
      resolvedModel =
        (modelRegistry.find(provider, id) as Model<never> | undefined) ??
        safeGetModel(provider, id)
    }
  }

  const loader = new DefaultResourceLoader({
    cwd: opts.cwd ?? process.cwd(),
    agentDir: opts.agentDir ?? getAgentDir(),
    ...(opts.skillPaths ? { additionalSkillPaths: opts.skillPaths } : {}),
    ...(opts.systemPrompt
      ? { systemPromptOverride: () => opts.systemPrompt! }
      : opts.appendSystemPrompt
        ? {
            systemPromptOverride: (current: string | undefined) =>
              current
                ? `${current}\n\n${opts.appendSystemPrompt}`
                : opts.appendSystemPrompt!,
          }
        : {}),
  })
  await loader.reload()

  const sessionManager = opts.resumeSessionFile
    ? SessionManager.open(opts.resumeSessionFile)
    : opts.cwd
      ? SessionManager.create(opts.cwd)
      : SessionManager.inMemory()

  let session: AgentSession | undefined
  try {
    const created = await createAgentSession({
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(opts.agentDir ? { agentDir: opts.agentDir } : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...(opts.customTools ? { customTools: opts.customTools } : {}),
      authStorage,
      modelRegistry,
      resourceLoader: loader,
      sessionManager,
    })
    session = created.session

    if (session.sessionFile) {
      sink.onSessionId(session.sessionFile)
    }

    let hasStreamedText = false

    const unsubscribe = session.subscribe((event) => {
      void (async () => {
        try {
          if (event.type === "message_update") {
            const ame = (event as { assistantMessageEvent?: { type: string; delta?: string } })
              .assistantMessageEvent
            if (ame?.type === "text_delta" && typeof ame.delta === "string" && ame.delta) {
              hasStreamedText = true
              await sink.onTextDelta(ame.delta)
            }
          } else if (event.type === "tool_execution_start") {
            const e = event as {
              toolCallId: string
              toolName: string
              args?: Record<string, unknown>
            }
            await sink.onToolUseStart?.({
              id: e.toolCallId,
              name: e.toolName,
              input: e.args,
            })
          } else if (event.type === "turn_end") {
            const e = event as { message?: { content?: unknown } }
            if (sink.onUsage) {
              await sink.onUsage(extractTurnUsage(e.message))
            }
            if (sink.onResult && e.message?.content) {
              const text = extractAssistantText(e.message.content)
              if (text) await sink.onResult(text, hasStreamedText)
            }
          }
        } catch (innerErr) {
          log.error("event handler threw", {
            sessionId: params.sessionId,
            error: serializeError(innerErr),
          })
        }
      })()
    })

    // 呼び出し元 (例: browser-agent) からの中断要求は session.abort() に橋渡し。
    const onExternalAbort = () => {
      void session?.abort()
    }
    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) onExternalAbort()
      else opts.abortSignal.addEventListener("abort", onExternalAbort, { once: true })
    }

    try {
      await session.prompt(params.prompt)
    } finally {
      unsubscribe()
      opts.abortSignal?.removeEventListener("abort", onExternalAbort)
    }

    await sink.onDone?.()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    log.error("pi session error", {
      sessionId: params.sessionId,
      error: serializeError(err),
    })
    await sink.onError(error)
  } finally {
    session?.dispose()
  }
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as { type?: string; text?: unknown }
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text)
      }
    }
  }
  return parts.join("")
}
