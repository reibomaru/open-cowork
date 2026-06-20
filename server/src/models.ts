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
//
// 起動時に各プロバイダの認証情報 (API キーなど) の有無をチェックし、
// 利用可能なプロバイダのモデルのみ /api/models で返す。

import { getEnvApiKey } from "@earendil-works/pi-ai"
import { createLogger } from "./logger"

const log = createLogger("models")

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

// env で指定されたデフォルトモデル候補。initAvailableModels() で利用可能性を検証する。
const _configuredDefault = process.env.DEFAULT_MODEL ?? "claude-opus-4-7"

// initAvailableModels() で確定する実効デフォルトモデル ID。
let _resolvedDefaultModelId: string = _configuredDefault

/** 利用可能モデルの中から選ばれたデフォルトモデル ID を返す。 */
export function getDefaultModelId(): string {
  return _resolvedDefaultModelId
}

export function isValidModelId(id: string): boolean {
  return MODELS.some((m) => m.id === id)
}

// ── プロバイダ疎通チェック (ping) ──
//
// プロバイダ単位の認証チェックだけでなく、モデル単位の存在チェックも行う。
// Ollama のようにローカルにプルしたモデルしか使えないプロバイダでは、
// プロバイダが alive でもモデルが無ければ利用不可として弾く。

const PING_TIMEOUT_MS = 8000

/**
 * プロバイダごとに利用可能なモデル名の Set を返す。
 * Set が空 = プロバイダ自体が利用不可。
 * Set に "*" が含まれる = プロバイダは利用可能で、全モデルを許可 (API 系)。
 */
async function fetchAvailableModelIds(provider: string): Promise<Set<string>> {
  const none = new Set<string>()
  try {
    switch (provider) {
      case "google": {
        const apiKey = getEnvApiKey("google")
        if (!apiKey) return none
        // モデル一覧取得 — 無料・API キー認証チェック込み
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
          { signal: AbortSignal.timeout(PING_TIMEOUT_MS) },
        )
        if (!res.ok) return none
        const body = (await res.json()) as { models?: { name?: string }[] }
        // name は "models/gemini-2.5-pro" 形式。"models/" を除去して id だけにする。
        const ids = new Set<string>()
        for (const m of body.models ?? []) {
          if (m.name) ids.add(m.name.replace(/^models\//, ""))
        }
        return ids
      }
      case "anthropic": {
        const apiKey = getEnvApiKey("anthropic")
        if (!apiKey) return none
        const isOAuth = !!process.env.ANTHROPIC_OAUTH_TOKEN
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: {
            ...(isOAuth ? { Authorization: `Bearer ${apiKey}` } : { "x-api-key": apiKey }),
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        })
        if (!res.ok) return none
        const body = (await res.json()) as { data?: { id?: string }[] }
        const ids = new Set<string>()
        for (const m of body.data ?? []) {
          if (m.id) ids.add(m.id)
        }
        return ids
      }
      case "ollama": {
        const baseUrl = process.env.OLLAMA_BASE_URL
        if (!baseUrl) return none
        // OpenAI 互換 /models — レスポンス: { data: [{ id: "gemma4:12b" }, ...] }
        const res = await fetch(`${baseUrl}/models`, {
          signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        })
        if (!res.ok) return none
        const body = (await res.json()) as { data?: { id?: string }[] }
        const ids = new Set<string>()
        for (const m of body.data ?? []) {
          if (m.id) ids.add(m.id)
        }
        return ids
      }
      case "amazon-bedrock": {
        // Bedrock は AWS SDK 経由のため軽量 ping が難しい。
        // env チェックが通れば全モデル許可とする。
        return getEnvApiKey("amazon-bedrock") ? new Set(["*"]) : none
      }
      default: {
        return getEnvApiKey(provider) ? new Set(["*"]) : none
      }
    }
  } catch (err) {
    log.warn(`ping failed for provider "${provider}"`, {
      error: err instanceof Error ? err.message : String(err),
    })
    return none
  }
}

/** 利用可能モデルのキャッシュ。initAvailableModels() で確定する。 */
let _availableModels: ModelDescriptor[] | null = null

/**
 * 各プロバイダへ ping を送り、モデル単位で利用可能性を確定する。
 * サーバ起動時に 1 回だけ呼ぶこと。
 */
export async function initAvailableModels(): Promise<void> {
  const providers = [...new Set(MODELS.map((m) => m.provider))]

  // 各プロバイダを並行して問い合わせ
  const results = await Promise.all(
    providers.map(async (p) => ({ provider: p, modelIds: await fetchAvailableModelIds(p) })),
  )

  const providerModels = new Map<string, Set<string>>()
  for (const { provider, modelIds } of results) {
    providerModels.set(provider, modelIds)
  }

  // ログ出力
  const available: string[] = []
  const unavailable: string[] = []
  for (const p of providers) {
    const ids = providerModels.get(p)
    if (ids && ids.size > 0) {
      available.push(ids.has("*") ? p : `${p} (${[...ids].join(", ")})`)
    } else {
      unavailable.push(p)
    }
  }
  log.info("provider availability (ping)", { available, unavailable })

  // モデル単位でフィルタ: "*" ならプロバイダの全モデル許可、それ以外は id が含まれるもののみ
  _availableModels = MODELS.filter((m) => {
    const ids = providerModels.get(m.provider)
    if (!ids || ids.size === 0) return false
    if (ids.has("*")) return true
    return ids.has(m.model)
  })

  if (_availableModels.length === 0) {
    log.warn("no models available — all models will be listed but may fail at runtime")
    _availableModels = [...MODELS]
  }

  // デフォルトモデルの確定: env 指定値が利用可能なら採用、そうでなければ先頭モデル
  if (_availableModels.some((m) => m.id === _configuredDefault)) {
    _resolvedDefaultModelId = _configuredDefault
  } else {
    _resolvedDefaultModelId = _availableModels[0]?.id ?? _configuredDefault
    log.info("configured DEFAULT_MODEL is unavailable, falling back", {
      configured: _configuredDefault,
      resolved: _resolvedDefaultModelId,
    })
  }

  log.info("available models", {
    models: _availableModels.map((m) => m.id),
    defaultModelId: _resolvedDefaultModelId,
  })
}

/**
 * 利用可能なモデル一覧を返す。initAvailableModels() 未実行時は全モデルを返す。
 */
export function getAvailableModels(): readonly ModelDescriptor[] {
  return _availableModels ?? [...MODELS]
}

/** getAvailableModels() の結果に含まれる id か判定する。 */
export function isAvailableModelId(id: string): boolean {
  return getAvailableModels().some((m) => m.id === id)
}

/**
 * 公開 model id から pi-coding-agent SDK 向けの {provider, model} を返す。
 * 不明な id はフォールバック (getDefaultModelId(), 無ければ先頭) に解決する。
 */
export function resolvePiModel(modelId: string): { provider: string; model: string } {
  const m = MODELS.find((mm) => mm.id === modelId)
  if (!m) {
    const fallback = MODELS.find((mm) => mm.id === _resolvedDefaultModelId) ?? MODELS[0]
    return { provider: fallback.provider, model: fallback.model }
  }
  return { provider: m.provider, model: m.model }
}
