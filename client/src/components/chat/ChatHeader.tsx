import {
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"
import { useT } from "../../i18n"
import { useSessionStore } from "../../store/session-store"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"
import { ModelSelector } from "./ModelSelector"
import { UsageBadge } from "./UsageBadge"

export function ChatHeader() {
  const { sidebarOpen, toggleSidebar, rightPanelOpen, toggleRightPanel, selectedModelId } =
    useUIStore()
  const t = useT()
  const session = useSessionStore((s) => {
    const id = s.activeSessionId
    return id ? s.sessions.find((sess) => sess.id === id) : null
  })

  return (
    <div className="h-14 flex items-center px-5 border-b border-app shrink-0">
      <Tooltip label={sidebarOpen ? t("chat.closeSidebar") : t("chat.openSidebar")}>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? t("chat.closeSidebar") : t("chat.openSidebar")}
          className="p-1.5 rounded-md hover:bg-white/10 text-secondary transition-colors mr-3"
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </Tooltip>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          {session && (
            <span className="text-sm font-medium text-primary truncate">{session.title}</span>
          )}
          {session?.workingDir && (
            <Tooltip label={t("workingDir.scoped", { dir: session.workingDir })}>
              <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-app px-1.5 py-0.5 text-[11px] text-secondary max-w-[200px]">
                <FolderOpen size={12} className="shrink-0" />
                <span className="truncate">{session.workingDir}</span>
              </span>
            </Tooltip>
          )}
          {/* セッションがあればそのモデルを編集、無ければ次に作るセッションの既定 (preference) を編集 */}
          <ModelSelector
            sessionId={session?.id ?? null}
            currentModel={session?.model ?? selectedModelId}
          />
        </div>
      </div>

      {session && (
        <div className="mr-3 shrink-0">
          <UsageBadge usage={session.usage} />
        </div>
      )}

      <Tooltip label={rightPanelOpen ? t("chat.closePanel") : t("chat.openPanel")}>
        <button
          type="button"
          onClick={toggleRightPanel}
          aria-label={rightPanelOpen ? t("chat.closePanel") : t("chat.openPanel")}
          className="p-1.5 rounded-md hover:bg-white/10 text-secondary transition-colors"
        >
          {rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </Tooltip>
    </div>
  )
}
