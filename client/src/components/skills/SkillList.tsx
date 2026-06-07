import { ChevronDown, ChevronRight, Sparkles, User } from "lucide-react"
import { useState } from "react"
import { useT } from "../../i18n"
import type { CommonSkillSummary, PersonalSkillSummary, SkillCreatedBy } from "../../lib/api"
import { useSkillStore } from "../../store/skill-store"

interface SkillListProps {
  personal: PersonalSkillSummary[]
  common: CommonSkillSummary[]
  loading: boolean
}

export function SkillList({ personal, common, loading }: SkillListProps) {
  const t = useT()
  const [commonOpen, setCommonOpen] = useState(true)
  const openEdit = useSkillStore((s) => s.openEdit)
  const openView = useSkillStore((s) => s.openView)

  return (
    <div className="py-2">
      {/* 個人用 */}
      <div className="px-3 pt-1 pb-2 text-xs font-medium uppercase text-secondary">
        {t("skills.tabPersonal")}
        <span className="ml-1 text-secondary">({personal.length})</span>
      </div>
      {personal.length === 0 && !loading && (
        <div className="px-3 py-2 text-xs text-secondary">
          <p>{t("skills.empty")}</p>
          <p className="mt-1 opacity-80">{t("skills.emptyHint")}</p>
        </div>
      )}
      <ul>
        {personal.map((s) => (
          <li key={s.name}>
            <SkillRow
              name={s.name}
              description={s.description}
              meta={
                <span>
                  {formatDate(s.updatedAt)} ・ {labelForCreatedBy(s.createdBy, t)}
                </span>
              }
              showNewBadge={Date.now() - s.updatedAt < 5 * 60 * 1000}
              onClick={() => openEdit(s.name)}
            />
          </li>
        ))}
      </ul>

      {/* 共通 (RO) */}
      <button
        type="button"
        onClick={() => setCommonOpen((v) => !v)}
        className="mt-3 flex w-full items-center gap-1 px-3 pt-1 pb-2 text-xs font-medium uppercase text-secondary hover:bg-white/5"
      >
        {commonOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{t("skills.tabCommon")}</span>
        <span className="ml-1">({common.length})</span>
      </button>
      {commonOpen && (
        <ul>
          {common.map((s) => (
            <li key={s.name}>
              <SkillRow
                name={s.name}
                description={s.description}
                dimmed
                onClick={() => openView(s)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface SkillRowProps {
  name: string
  description: string
  meta?: React.ReactNode
  dimmed?: boolean
  showNewBadge?: boolean
  onClick: () => void
}

function SkillRow({ name, description, meta, dimmed, showNewBadge, onClick }: SkillRowProps) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 hover:bg-white/10 transition-colors ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        {dimmed ? (
          <Sparkles size={12} className="shrink-0 text-secondary" aria-hidden />
        ) : (
          <User size={12} className="shrink-0 text-secondary" aria-hidden />
        )}
        <span className="text-sm text-primary truncate" title={name}>
          {name}
        </span>
        {showNewBadge && (
          <span className="ml-1 shrink-0 rounded bg-clay/20 px-1.5 py-0.5 text-[10px] font-medium text-clay">
            {t("skills.newBadge")}
          </span>
        )}
      </div>
      {description && (
        <p
          className="mt-0.5 text-xs text-secondary"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {description}
        </p>
      )}
      {meta && <div className="mt-0.5 text-[10px] text-secondary opacity-80">{meta}</div>}
    </button>
  )
}

function labelForCreatedBy(by: SkillCreatedBy, t: ReturnType<typeof useT>): string {
  if (by === "agent") return t("skills.createdByAgent")
  if (by === "user") return t("skills.createdByUser")
  return t("skills.createdByUnknown")
}

function formatDate(ms: number): string {
  try {
    const d = new Date(ms)
    return d.toLocaleString()
  } catch {
    return ""
  }
}
