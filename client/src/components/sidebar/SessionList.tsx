import { useT } from "../../i18n"
import { useSessionStore } from "../../store/session-store"
import { SessionItem } from "./SessionItem"

export function SessionList() {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const t = useT()

  const activeSessions = sessions.filter((s) => s.status === "active")

  if (activeSessions.length === 0) {
    return <div className="p-4 text-sm text-secondary text-center">{t("sidebar.noSessions")}</div>
  }

  return (
    <div className="py-3 space-y-1 px-3">
      {activeSessions.map((session) => (
        <SessionItem key={session.id} session={session} isActive={session.id === activeSessionId} />
      ))}
    </div>
  )
}
