import clsx from "clsx"
import { Check, ChevronDown, FolderOpen, FolderPlus, Loader2, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useT } from "../../i18n"
import { api } from "../../lib/api"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"

interface WorkdirEntry {
  path: string
  name: string
}

/**
 * 新規タスク画面の「プロジェクトまたはフォルダーで作業する」ピッカー。
 * WORKDIR_USER 配下のサブディレクトリを選んで、編集範囲を限定したセッションを作る。
 * 選択値は ui-store の selectedWorkingDir に保持し、ChatArea が createSession に渡す。
 */
export function WorkingDirPicker() {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const selected = useUIStore((s) => s.selectedWorkingDir)
  const setSelected = useUIStore((s) => s.setSelectedWorkingDir)

  const [open, setOpen] = useState(false)
  const [dirs, setDirs] = useState<WorkdirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadDirs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getWorkdirs()
      setDirs(res.dirs)
    } catch (err) {
      console.error("failed to fetch workdirs", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void loadDirs()
  }, [open, loadDirs])

  // 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const filtered = query
    ? dirs.filter((d) => d.path.toLowerCase().includes(query.toLowerCase()))
    : dirs

  const choose = (path: string) => {
    setSelected(path)
    setOpen(false)
    setQuery("")
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(null)
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    setCreateError(null)
    try {
      const created = await api.createWorkdir(name)
      setSelected(created.path)
      setCreating(false)
      setNewName("")
      setOpen(false)
      setQuery("")
    } catch (err) {
      console.error("failed to create workdir", err)
      setCreateError(t("workingDir.createError"))
    } finally {
      setBusy(false)
    }
  }

  const isLight = theme === "light"

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("workingDir.ariaOpen")}
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border",
          selected
            ? isLight
              ? "border-ink/30 text-ink bg-ink/5"
              : "border-clay/40 text-clay bg-clay/10"
            : "border-app text-secondary hover:text-primary hover:bg-white/[0.06]",
        )}
      >
        <FolderOpen size={15} className="shrink-0" />
        <span className="truncate max-w-[260px]">{selected ?? t("workingDir.button")}</span>
        {selected ? (
          <Tooltip label={t("workingDir.clear")}>
            <span
              role="button"
              tabIndex={0}
              aria-label={t("workingDir.clear")}
              onClick={clear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setSelected(null)
                }
              }}
              className="shrink-0 -mr-1 p-0.5 rounded hover:bg-black/10"
            >
              <X size={13} />
            </span>
          </Tooltip>
        ) : (
          <ChevronDown size={14} className="shrink-0" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={clsx(
            "absolute top-full left-0 mt-2 w-[320px] py-1 rounded-xl border shadow-lg z-20",
            isLight ? "bg-white border-app text-primary" : "bg-[#1d1d1d] border-app text-primary",
          )}
        >
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-input border border-app">
              <Search size={14} className="shrink-0 text-secondary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("workingDir.search")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-secondary"
              />
            </div>
          </div>

          {creating ? (
            <div className="px-3 py-2">
              <input
                // biome-ignore lint/a11y/noAutofocus: フォーム展開直後に名前入力へフォーカスしたい
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleCreate()
                  }
                }}
                placeholder={t("workingDir.createPlaceholder")}
                className="w-full bg-input border border-app rounded-lg px-2.5 py-1.5 text-sm outline-none placeholder:text-secondary"
              />
              {createError && <p className="mt-1 text-xs text-red-400">{createError}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false)
                    setNewName("")
                    setCreateError(null)
                  }}
                  className="px-2.5 py-1 text-xs rounded-md text-secondary hover:text-primary"
                >
                  <X size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim() || busy}
                  className={clsx(
                    "px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1",
                    !newName.trim() || busy
                      ? "bg-white/5 text-secondary cursor-not-allowed"
                      : isLight
                        ? "bg-ink hover:bg-ink-soft text-white"
                        : "bg-clay hover:bg-clay-deep text-black",
                  )}
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {t("workingDir.create")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setCreating(true)
                setCreateError(null)
              }}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left border-b border-app-subtle",
                isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.06]",
              )}
            >
              <FolderPlus size={15} className="shrink-0 text-secondary" />
              <span>{t("workingDir.createNew")}</span>
            </button>
          )}

          <div className="max-h-[240px] overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-4 flex items-center justify-center text-secondary">
                <Loader2 size={14} className="animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-secondary">
                {t("workingDir.noResults")}
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.path}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(d.path)}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left",
                    isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.06]",
                  )}
                >
                  <FolderOpen size={15} className="shrink-0 text-secondary" />
                  <span className="truncate flex-1">{d.path}</span>
                  {selected === d.path && <Check size={14} className="shrink-0 text-clay" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
