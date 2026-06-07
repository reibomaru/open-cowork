import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"
import { FileTree } from "../files/FileTree"
import { SkillsPanel } from "../skills/SkillsPanel"

export function RightPanel() {
  const theme = useUIStore((s) => s.theme)
  const tab = useUIStore((s) => s.rightPanelTab)
  const setTab = useUIStore((s) => s.setRightPanelTab)
  const isLight = theme === "light"
  const t = useT()

  return (
    <div className="h-full w-full flex flex-col bg-sidebar border-l border-app">
      <div className="flex border-b border-app">
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          label={t("rightPanel.files")}
          isLight={isLight}
        />
        <TabButton
          active={tab === "skills"}
          onClick={() => setTab("skills")}
          label={t("rightPanel.skills")}
          isLight={isLight}
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "files" ? (
          <div className="flex-1 min-h-0">
            <FileTree />
          </div>
        ) : (
          <SkillsPanel />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  isLight,
}: {
  active: boolean
  onClick: () => void
  label: string
  isLight: boolean
}) {
  const activeBorder = isLight ? "border-ink" : "border-clay"
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 ${
        active
          ? `text-primary ${activeBorder}`
          : "text-secondary border-transparent hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  )
}
