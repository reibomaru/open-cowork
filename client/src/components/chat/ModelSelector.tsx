import type { ModelId } from "@server/models"
import clsx from "clsx"
import { Check, ChevronDown, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { api } from "../../lib/api"
import { useSessionStore } from "../../store/session-store"
import { useUIStore } from "../../store/ui-store"

interface ModelOption {
  id: string
  label: string
  description: string
}

let cached: { models: ModelOption[]; defaultModelId: string } | null = null
let inflight: Promise<{ models: ModelOption[]; defaultModelId: string }> | null = null

// /api/models のレスポンスはセッション間で共通かつ不変なのでモジュールスコープにキャッシュする。
function fetchModels(): Promise<{ models: ModelOption[]; defaultModelId: string }> {
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight
  inflight = api.getModels().then((r) => {
    cached = r
    inflight = null
    return cached
  })
  return inflight
}

interface ModelSelectorProps {
  /** セッションが存在する場合に渡す。null なら preference モード (次に作る session の既定) */
  sessionId: string | null
  /** セッションがある場合はその model、無い場合は preference (もしくはサーバ既定) */
  currentModel: string | null
}

export function ModelSelector({ sessionId, currentModel }: ModelSelectorProps) {
  const updateSessionModel = useSessionStore((s) => s.updateSessionModel)
  const setSelectedModelId = useUIStore((s) => s.setSelectedModelId)
  const [models, setModels] = useState<ModelOption[]>(cached?.models ?? [])
  const [defaultModelId, setDefaultModelId] = useState<string | null>(
    cached?.defaultModelId ?? null,
  )
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (cached) return
    fetchModels()
      .then((r) => {
        setModels(r.models)
        setDefaultModelId(r.defaultModelId)
      })
      .catch(() => {
        // 取得に失敗した場合は現在値だけで描画する (UI を壊さない)。
      })
  }, [])

  // sessionId が null のときは preference を、それ以外はセッションのモデルを優先する。
  // どちらも未定なら API の defaultModelId にフォールバックする。
  const effectiveModel = currentModel ?? defaultModelId ?? ""
  const current = models.find((m) => m.id === effectiveModel)
  const triggerLabel = current?.label ?? effectiveModel ?? "Model"

  const handleSelect = async (next: ModelId) => {
    setOpen(false)
    if (next === effectiveModel) return
    // セッションがあれば PATCH。preference (次回新規セッションの既定) も併せて更新して
    // 「いま選んだモデルが次の New Session でも既定になる」直感に合わせる。
    if (sessionId) {
      setPending(true)
      try {
        await updateSessionModel(sessionId, next)
        setSelectedModelId(next)
      } finally {
        setPending(false)
      }
    } else {
      setSelectedModelId(next)
    }
  }

  const disabled = pending || models.length === 0

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        aria-label="使用モデル"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
          "border border-app-subtle text-primary",
          "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        title={current?.description}
      >
        <Sparkles size={12} className="text-clay" />
        <span>{triggerLabel}</span>
        <ChevronDown
          size={12}
          className={clsx("text-secondary transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          {/* outside click / Escape 用の透明バックドロップ */}
          <div
            className="fixed inset-0 z-10"
            role="button"
            tabIndex={0}
            aria-label="閉じる"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false)
            }}
          />
          <div
            aria-label="モデル一覧"
            className="absolute left-0 top-full mt-1.5 z-20 w-64 rounded-lg bg-app border border-app shadow-lg py-1"
          >
            {models.map((m) => {
              const selected = m.id === effectiveModel
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleSelect(m.id as ModelId)}
                  className={clsx(
                    "w-full text-left px-3 py-2 flex items-start gap-2 transition-colors",
                    "hover:bg-black/5 dark:hover:bg-white/10",
                    selected && "bg-clay/10",
                  )}
                >
                  <span className="flex-shrink-0 w-4 mt-0.5">
                    {selected ? <Check size={14} className="text-clay" /> : null}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={clsx(
                        "block text-sm font-medium",
                        selected ? "text-clay" : "text-primary",
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="block text-xs text-secondary mt-0.5 leading-snug">
                      {m.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
