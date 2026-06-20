// 利用可能なモデルのカタログ (pi-coding-agent 経由)。
//
// id        : API / DB / UI で使う識別子。
// label     : UI 表示用の短いラベル。
// description: 用途・コスト/性能の指針。UI のヘルプテキストとして表示する。
// provider  : pi-coding-agent / pi-ai が認識するプロバイダ名 (例: "anthropic", "openai", "google", "amazon-bedrock", "ollama")。
// model     : 上記 provider の中での model id (例: "claude-opus-4-5", "gemini-2.5-pro")。
//
// Claude 系: MODEL_PROVIDER env で全 Claude モデルのプロバイダを一括切り替えできる。
//            個別に override したい場合は CLAUDE_MODEL_* / CLAUDE_MODEL_*_PROVIDER を使う。
// Gemini 系: GEMINI_MODEL_*_PROVIDER (既定 "google") と GEMINI_MODEL_* で個別に上書き可能。
//            認証には GEMINI_API_KEY 環境変数を設定する。

export interface ModelDescriptor {
  id: string
  label: string
  description: string
  provider: string
  model: string
}

// Claude 系の既定 provider。anthropic API key (ANTHROPIC_API_KEY) を使う想定。
// Bedrock を使う場合は MODEL_PROVIDER=bedrock を設定し、AWS 認証を別途用意する。
const DEFAULT_PROVIDER = process.env.MODEL_PROVIDER ?? "anthropic"

// Gemini 系の既定 provider。pi-ai の "google" プロバイダ (GEMINI_API_KEY) を使う。
const DEFAULT_GEMINI_PROVIDER = process.env.GEMINI_PROVIDER ?? "google"

export const MODELS = [
  // ── Claude ──
  {
    id: "claude-opus-4-7",
    label: "Opus",
    description: "最高性能・最高コスト。複雑な分析や設計タスク向け。",
    provider: process.env.CLAUDE_MODEL_OPUS_PROVIDER ?? DEFAULT_PROVIDER,
    model: process.env.CLAUDE_MODEL_OPUS ?? "claude-opus-4-5",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet",
    description: "性能とコストのバランス型。日常的なタスクの標準モデル。",
    provider: process.env.CLAUDE_MODEL_SONNET_PROVIDER ?? DEFAULT_PROVIDER,
    model: process.env.CLAUDE_MODEL_SONNET ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5",
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku",
    description: "最速・最低コスト。簡易なタスクや大量処理向け。",
    provider: process.env.CLAUDE_MODEL_HAIKU_PROVIDER ?? DEFAULT_PROVIDER,
    model: process.env.CLAUDE_MODEL_HAIKU ?? "claude-haiku-4-5",
  },
  // ── Gemini ──
  {
    id: "gemini-2.5-pro",
    label: "Gemini Pro",
    description: "Gemini 最高性能。複雑な推論・コード生成向け。",
    provider: process.env.GEMINI_MODEL_PRO_PROVIDER ?? DEFAULT_GEMINI_PROVIDER,
    model: process.env.GEMINI_MODEL_PRO ?? "gemini-2.5-pro",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini Flash",
    description: "Gemini 高速モデル。速度とコストのバランス型。",
    provider: process.env.GEMINI_MODEL_FLASH_PROVIDER ?? DEFAULT_GEMINI_PROVIDER,
    model: process.env.GEMINI_MODEL_FLASH ?? "gemini-2.5-flash",
  },
  {
    id: "gemini-2.0-flash-lite",
    label: "Gemini Flash Lite",
    description: "Gemini 最軽量。簡易タスクや大量処理向け。",
    provider: process.env.GEMINI_MODEL_FLASH_LITE_PROVIDER ?? DEFAULT_GEMINI_PROVIDER,
    model: process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-2.0-flash-lite",
  },
] as const satisfies readonly ModelDescriptor[]

export type ModelId = (typeof MODELS)[number]["id"]

export const MODEL_IDS = MODELS.map((m) => m.id) as [ModelId, ...ModelId[]]

export const DEFAULT_MODEL_ID = process.env.DEFAULT_MODEL ?? "claude-opus-4-7"

export function isValidModelId(id: string): boolean {
  return MODELS.some((m) => m.id === id)
}

/**
 * 公開 model id から pi-coding-agent SDK 向けの {provider, model} を返す。
 * 不明な id はフォールバック (DEFAULT_MODEL_ID, 無ければ先頭) に解決する。
 */
export function resolvePiModel(modelId: string): { provider: string; model: string } {
  const m = MODELS.find((mm) => mm.id === modelId)
  if (!m) {
    const fallback = MODELS.find((mm) => mm.id === DEFAULT_MODEL_ID) ?? MODELS[0]
    return { provider: fallback.provider, model: fallback.model }
  }
  return { provider: m.provider, model: m.model }
}
