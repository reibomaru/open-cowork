import clsx from "clsx"
import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useI18nStore, useT } from "../../i18n"
import { timeAgo } from "../../lib/format"
import { useSessionStore } from "../../store/session-store"
import type { Session } from "../../types/session"
import { Tooltip } from "../ui/Tooltip"

interface SessionItemProps {
  session: Session
  isActive: boolean
}

export function SessionItem({ session, isActive }: SessionItemProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(session.title)
  const { setActiveSession, archiveSession, deleteSession, renameSession } = useSessionStore()
  const locale = useI18nStore((s) => s.locale)
  const t = useT()

  const handleRename = () => {
    if (title.trim()) {
      renameSession(session.id, title.trim())
    }
    setEditing(false)
  }

  return (
    <div
      className={clsx(
        "group relative flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors rounded-lg",
        isActive ? "bg-black/10 dark:bg-white/10" : "hover:bg-black/10 dark:hover:bg-white/5",
      )}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!editing) {
          setActiveSession(session.id)
          navigate(`/chat/${session.id}`)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !editing) {
          setActiveSession(session.id)
          navigate(`/chat/${session.id}`)
        }
      }}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleRename()}
            className="w-full bg-transparent border border-border-default rounded px-1 py-0.5 text-sm text-primary outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="text-sm text-primary truncate">{session.title}</div>
            <div className="text-xs text-secondary mt-0.5">
              {timeAgo(session.updatedAt, locale)}
            </div>
          </>
        )}
      </div>

      {/* Actions menu */}
      <div className="relative">
        <Tooltip label={t("sidebar.sessionMenu")}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(!menuOpen)
            }}
            aria-label={t("sidebar.sessionMenu")}
            className={clsx(
              "p-1 rounded hover:bg-white/10 text-secondary transition-opacity",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <MoreHorizontal size={14} />
          </button>
        </Tooltip>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              role="button"
              tabIndex={0}
              onClick={() => setMenuOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setMenuOpen(false)
              }}
            />
            <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg bg-app border border-app shadow-lg py-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                  setMenuOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-primary hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Pencil size={14} /> {t("sidebar.rename")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  archiveSession(session.id)
                  setMenuOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-primary hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Archive size={14} /> {t("sidebar.archive")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteSession(session.id)
                  setMenuOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Trash2 size={14} /> {t("sidebar.delete")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
