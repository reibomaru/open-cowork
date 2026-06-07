import { Loader2, Plus, RefreshCw } from "lucide-react"
import { useEffect } from "react"
import { useT } from "../../i18n"
import { useSkillStore } from "../../store/skill-store"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"
import { SkillEditorModal } from "./SkillEditorModal"
import { SkillList } from "./SkillList"

export function SkillsPanel() {
  const t = useT()
  const skillsRefreshTick = useUIStore((s) => s.skillsRefreshTick)
  const fetchAll = useSkillStore((s) => s.fetchAll)
  const loading = useSkillStore((s) => s.loading)
  const error = useSkillStore((s) => s.error)
  const personal = useSkillStore((s) => s.personal)
  const common = useSkillStore((s) => s.common)
  const openNew = useSkillStore((s) => s.openNew)
  const editorMode = useSkillStore((s) => s.editorMode)

  // 初回マウント + ui-store の skillsRefreshTick が増えた時に refetch する。
  // assistant turn 終了 (SSE の "done" / "error" イベント) は hooks/use-sse.ts 側で
  // requestSkillsRefresh() を呼んで tick を進めている。
  useEffect(() => {
    void skillsRefreshTick
    fetchAll()
  }, [fetchAll, skillsRefreshTick])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-app">
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-secondary hover:bg-white/10"
          title={t("skills.newButton")}
        >
          <Plus size={14} />
          <span>{t("skills.newButton")}</span>
        </button>
        <Tooltip label={t("skills.refresh")}>
          <button
            type="button"
            onClick={() => fetchAll()}
            aria-label={t("skills.refresh")}
            className="p-1 rounded text-secondary hover:bg-white/10"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </Tooltip>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-neutral-500 border-b border-app" role="alert">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <SkillList personal={personal} common={common} loading={loading} />
      </div>

      {editorMode !== null && <SkillEditorModal />}
    </div>
  )
}
