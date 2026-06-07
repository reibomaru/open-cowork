import { Moon, Sun } from "lucide-react"
import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"
import { LanguageSwitcher } from "../sidebar/LanguageSwitcher"
import { NewSessionButton } from "../sidebar/NewSessionButton"
import { ServerVersion } from "../sidebar/ServerVersion"
import { SessionList } from "../sidebar/SessionList"
import { Tooltip } from "../ui/Tooltip"

export function Sidebar() {
  const { theme, toggleTheme } = useUIStore()
  const t = useT()

  return (
    <div className="h-full w-full flex flex-col bg-sidebar border-r border-app">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-app">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <h1
              className="text-base font-semibold text-primary whitespace-nowrap"
              style={{ fontFamily: "var(--font-family-title)" }}
            >
              {t("sidebar.title")}
            </h1>
            <span
              className="shrink-0 inline-flex items-center px-1 py-0.5 rounded border border-clay/40 bg-clay/15 text-clay text-[9px] font-semibold leading-none"
              aria-label={t("sidebar.previewBadge")}
            >
              {t("sidebar.previewBadge")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Tooltip
              label={theme === "dark" ? t("sidebar.toggleToLight") : t("sidebar.toggleToDark")}
            >
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  theme === "dark" ? t("sidebar.toggleToLight") : t("sidebar.toggleToDark")
                }
                className="p-1.5 rounded-md hover:bg-white/10 text-secondary transition-colors"
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </Tooltip>
          </div>
        </div>
        <NewSessionButton />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        <SessionList />
      </div>

      {/* Footer settings */}
      <div className="px-4 py-3 border-t border-app flex flex-col gap-2">
        <ServerVersion />
      </div>
    </div>
  )
}
