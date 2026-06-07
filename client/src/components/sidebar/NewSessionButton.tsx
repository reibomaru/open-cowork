import { Plus } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useT } from "../../i18n"
import { useSessionStore } from "../../store/session-store"
import { useUIStore } from "../../store/ui-store"

export function NewSessionButton() {
  const navigate = useNavigate()
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const theme = useUIStore((s) => s.theme)
  const t = useT()

  const handleCreate = () => {
    setActiveSession(null)
    navigate("/")
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        theme === "light"
          ? "bg-ink hover:bg-ink-soft text-white"
          : "bg-clay hover:bg-clay-deep text-black"
      }`}
    >
      <Plus size={16} />
      {t("sidebar.newSession")}
    </button>
  )
}
