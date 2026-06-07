// 利用可能なモデルのカタログ (pi-coding-agent 経由)。
//
// id        : API / DB / UI で使う識別子。
// label     : UI 表示用の短いラベル。
// description: 用途・コスト/性能の指針。UI のヘルプテキストとして表示する。
// provider  : pi-coding-agent / pi-ai が認識するプロバイダ名 (例: "anthropic", "openai", "google", "amazon-bedrock")。
// model     : 上記 provider の中での model id (例: "claude-opus-4-5")。
//
// MODEL_PROVIDER env で全モデルのプロバイダを一括切り替えできる。
// 個別に override したい場合は CLAUDE_MODEL_* / CLAUDE_MODEL_*_PROVIDER を使う。

export interface ModelDescriptor {
  id: string
  label: string
  description: string
  provider: string
  model: string
}

// 既定 provider。anthropic API key (ANTHROPIC_API_KEY) を使う想定。
// Bedrock を使う場合は MODEL_PROVIDER=bedrock を設定し、AWS 認証を別途用意する。
const DEFAULT_PROVIDER = process.env.MODEL_PROVIDER ?? "anthropic"

export const MODELS = [
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
