import clsx from "clsx"
import { Sparkles, User } from "lucide-react"
import { useEffect, useRef } from "react"
import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"

export interface SlashSkillItem {
  name: string
  description: string
  /** "personal" = 個人用 (slash 直接呼び出し可) / "common" = plugin 配下 (auto-trigger 中心) */
  source: "personal" | "common"
}

interface SlashCommandMenuProps {
  items: SlashSkillItem[]
  /** 現在ハイライトされている index。親が状態管理する。 */
  activeIndex: number
  onChangeActiveIndex: (next: number) => void
  onSelect: (item: SlashSkillItem) => void
  onClose: () => void
}

export function SlashCommandMenu({
  items,
  activeIndex,
  onChangeActiveIndex,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const listRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // ハイライト中の要素を可視範囲にスクロール
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  return (
    <div
      ref={rootRef}
      aria-label={t("skills.slashMenu.title")}
      className={clsx(
        "absolute bottom-full left-0 right-0 mb-2 rounded-xl border shadow-lg z-20 overflow-hidden",
        theme === "light" ? "bg-white border-app" : "bg-[#1d1d1d] border-app",
      )}
    >
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-secondary border-b border-app flex items-center justify-between gap-3">
        <span>{t("skills.slashMenu.title")}</span>
        <span className="normal-case tracking-normal opacity-80 truncate">
          {t("skills.slashMenu.hint")}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-xs text-secondary">{t("skills.slashMenu.empty")}</div>
      ) : (
        <div
          ref={listRef}
          role="listbox"
          aria-label={t("skills.slashMenu.title")}
          tabIndex={-1}
          className="max-h-[280px] overflow-y-auto py-1"
        >
          {items.map((item, idx) => {
            const active = idx === activeIndex
            return (
              <button
                key={`${item.source}-${item.name}`}
                type="button"
                role="option"
                aria-selected={active}
                data-idx={idx}
                onMouseEnter={() => onChangeActiveIndex(idx)}
                onMouseDown={(e) => {
                  // textarea から focus を奪わないように mousedown を抑止
                  e.preventDefault()
                  onSelect(item)
                }}
                className={clsx(
                  "w-full text-left px-3 py-2 flex items-start gap-2 transition-colors",
                  active
                    ? theme === "light"
                      ? "bg-black/[0.06]"
                      : "bg-white/[0.10]"
                    : theme === "light"
                      ? "hover:bg-black/[0.04]"
                      : "hover:bg-white/[0.06]",
                )}
              >
                {item.source === "personal" ? (
                  <User size={12} className="mt-1 shrink-0 text-secondary" aria-hidden />
                ) : (
                  <Sparkles size={12} className="mt-1 shrink-0 text-secondary" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-primary font-medium truncate">/{item.name}</span>
                    <span
                      className={clsx(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                        item.source === "personal"
                          ? "bg-clay/20 text-clay"
                          : "bg-white/10 text-secondary",
                      )}
                    >
                      {item.source === "personal"
                        ? t("skills.slashMenu.personal")
                        : t("skills.slashMenu.common")}
                    </span>
                  </div>
                  {item.description && (
                    <p
                      className="mt-0.5 text-xs text-secondary"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.description}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
