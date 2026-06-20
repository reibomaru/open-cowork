import {
  type Api,
  type KnownProvider,
  type Model,
  complete,
  getEnvApiKey,
  getModel,
} from "@earendil-works/pi-ai"
import { createLogger, serializeError } from "./logger"

const log = createLogger("title-generator")

// セッションタイトル要約用モデル。コスト・速度重視で lite 系モデルを既定にする。
// getModel() は KnownProvider のみ解決するため、カスタムプロバイダ (ollama 等) の場合は
// Model オブジェクトを手動構築してフォールバックする。
const TITLE_GEN_PROVIDER = process.env.TITLE_GEN_PROVIDER ?? "google"
const TITLE_GEN_MODEL = process.env.TITLE_GEN_MODEL ?? "gemini-2.5-flash-lite"
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://host.docker.internal:11434/v1"

const HAIKU_TIMEOUT_MS = 5000
const MAX_USER_CHARS = 2000
const MAX_ASSISTANT_CHARS = 2000

export interface GenerateSessionTitleParams {
  userMessage: string
  assistantMessage: string
}

const PROMPT_TEMPLATE = `\
You write very short, factual titles for chat sessions in a sidebar.

# Requirements
- Output exactly ONE noun phrase as the title and nothing else.
- Summarize the user's first instruction and the assistant's reply into the title.
- Match the dominant language of the conversation:
  - If the user message + assistant reply are mostly in Japanese, output a Japanese title (20 文字程度・最大 25 文字).
  - If they are mostly in English, output an English title (around 5 words, max 40 characters).
- No punctuation, no quotes, no emojis, no trailing "..." or "…".
- Specific enough that someone scanning the sidebar knows what the session is about.
- Do not include any prefix like "Title:" or any explanation. Just the title text.

# Conversation
[User]
{{user}}

[Assistant]
{{assistant}}

# Title
`

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return `${s.slice(0, maxChars)}\n…（以下省略）`
}

export interface GenerateSessionTitleOptions {
  signal?: AbortSignal
}

/**
 * Haiku を呼んでセッションタイトル文字列を返す。タイムアウト or 失敗時は null。
 * 単発呼び出し。リトライは行わない。
 */
export async function generateSessionTitle(
  params: GenerateSessionTitleParams,
  options: GenerateSessionTitleOptions = {},
): Promise<string | null> {
  const userClipped = truncate(params.userMessage.trim(), MAX_USER_CHARS)
  const assistantClipped = truncate(params.assistantMessage.trim(), MAX_ASSISTANT_CHARS)
  if (!userClipped || !assistantClipped) return null

  const prompt = PROMPT_TEMPLATE.replace("{{user}}", userClipped).replace(
    "{{assistant}}",
    assistantClipped,
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS)
  const externalSignal = options.signal
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true })
  }
  try {
    // KnownProvider ならビルトインカタログから取得、なければカスタム Model を構築
    const model: Model<Api> | undefined = getModel(
      TITLE_GEN_PROVIDER as KnownProvider,
      TITLE_GEN_MODEL as never,
    ) as Model<Api> | undefined
    const resolved: Model<Api> = model ?? {
      id: TITLE_GEN_MODEL,
      name: TITLE_GEN_MODEL,
      api: "openai-completions" as Api,
      provider: TITLE_GEN_PROVIDER,
      baseUrl: OLLAMA_BASE_URL,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 131072,
      maxTokens: 8192,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStrictMode: false,
        supportsLongCacheRetention: false,
      },
    }
    // provider に応じた API キーを解決する (google→GEMINI_API_KEY 等)。ollama 等の
    // 認証不要プロバイダは任意の非空文字列で通るため "ollama" にフォールバックする。
    const apiKey = getEnvApiKey(TITLE_GEN_PROVIDER) ?? "ollama"
    const result = await complete(
      resolved,
      { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
      { maxTokens: 80, temperature: 0.2, signal: controller.signal, apiKey },
    )
    const textBlock = result.content.find((c) => c.type === "text")
    return sanitize(textBlock?.text)
  } catch (err) {
    log.warn("haiku session title generation failed", {
      error: serializeError(err),
    })
    return null
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener("abort", onExternalAbort)
  }
}

function sanitize(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let s = raw.trim()
  if (!s) return null
  s = s.replace(/^```[a-zA-Z0-9]*\n?/, "").replace(/```$/, "")
  s = s.trim()
  s = s.split(/\r?\n/)[0].trim()
  s = s.replace(/^["'`「『]+|["'`」』]+$/g, "").trim()
  s = s.replace(/(?:\.{3}|…)+$/, "").trim()
  if (!s) return null
  if (s.length > 50) s = s.slice(0, 50)
  return s
}
