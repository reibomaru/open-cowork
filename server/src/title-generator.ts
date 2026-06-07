import { type KnownProvider, complete, getModel } from "@earendil-works/pi-ai"
import { createLogger, serializeError } from "./logger"

const log = createLogger("title-generator")

// セッションタイトル要約用の Haiku。pi-ai 経由で anthropic provider を叩く。
// Bedrock を使いたい場合は環境変数で TITLE_GEN_PROVIDER=bedrock 等に切り替える。
const TITLE_GEN_PROVIDER = process.env.TITLE_GEN_PROVIDER ?? "anthropic"
const TITLE_GEN_MODEL = process.env.TITLE_GEN_MODEL ?? "claude-haiku-4-5"

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
- Match the dominant language of the conversation:
  - If the user message + assistant reply are mostly in Japanese, output a Japanese title (15 文字程度・最大 25 文字).
  - If they are mostly in English, output an English title (around 4–6 words, max 50 characters).
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
    const model = getModel(TITLE_GEN_PROVIDER as KnownProvider, TITLE_GEN_MODEL as never)
    if (!model) {
      log.warn("title-generator: model not found", {
        provider: TITLE_GEN_PROVIDER,
        model: TITLE_GEN_MODEL,
      })
      return null
    }
    const result = await complete(
      model,
      { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
      { maxTokens: 80, temperature: 0.2, signal: controller.signal },
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
