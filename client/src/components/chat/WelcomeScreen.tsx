import { Loader2, Package, Sparkles, User } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useT } from "../../i18n"
import type { CommonSkillSummary, PersonalSkillSummary } from "../../lib/api"
import { useSkillStore } from "../../store/skill-store"
import { useUIStore } from "../../store/ui-store"

interface SkillEntry {
  name: string
  description: string
  source: "personal" | "common"
}

export function WelcomeScreen() {
  const theme = useUIStore((s) => s.theme)
  const isLight = theme === "light"
  const t = useT()
  const personal = useSkillStore((s) => s.personal)
  const common = useSkillStore((s) => s.common)
  const skillsLoading = useSkillStore((s) => s.loading)
  const refetchSkillsIfStale = useSkillStore((s) => s.refetchIfStale)
  const setPendingInputText = useUIStore((s) => s.setPendingInputText)

  // PromptInput でも初回 fetch するが、welcome 表示時点で確実に取りに行く
  // (skill-store 側で 3s throttle されるので重複は無害)。
  useEffect(() => {
    void refetchSkillsIfStale()
  }, [refetchSkillsIfStale])

  const skills = useMemo<SkillEntry[]>(() => {
    const p = personal.map<SkillEntry>((s: PersonalSkillSummary) => ({
      name: s.name,
      description: s.description,
      source: "personal",
    }))
    const c = common.map<SkillEntry>((s: CommonSkillSummary) => ({
      name: s.name,
      description: s.description,
      source: "common",
    }))
    return [...p, ...c]
  }, [personal, common])

  const insertSkill = (name: string) => {
    setPendingInputText(`/${name} `)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="text-center">
          <h2
            className="text-2xl font-semibold text-primary mb-2"
            style={{ fontFamily: "var(--font-family-title)" }}
          >
            {t("chat.welcomeTitle")}
          </h2>
          <p className="text-secondary text-sm leading-relaxed max-w-2xl mx-auto whitespace-pre-line">
            {t("chat.welcomeBody")}
          </p>
        </div>

        <SkillCatalog
          skills={skills}
          loading={skillsLoading}
          onInsert={insertSkill}
          headerLabel={t("chat.skillsHeader")}
          hintLabel={t("chat.skillsHint")}
          emptyLabel={t("chat.skillsEmpty")}
          useLabel={t("chat.skillsUse")}
          personalLabel={t("chat.skillsGroupPersonal")}
          commonLabel={t("chat.skillsGroupCommon")}
          isLight={isLight}
        />
      </div>
    </div>
  )
}

interface SkillCatalogProps {
  skills: SkillEntry[]
  loading: boolean
  onInsert: (name: string) => void
  headerLabel: string
  hintLabel: string
  emptyLabel: string
  useLabel: string
  personalLabel: string
  commonLabel: string
  isLight: boolean
}

function SkillCatalog({
  skills,
  loading,
  onInsert,
  headerLabel,
  hintLabel,
  emptyLabel,
  useLabel,
  personalLabel,
  commonLabel,
  isLight,
}: SkillCatalogProps) {
  return (
    <section className="mt-10">
      <div
        className={`rounded-2xl border border-app overflow-hidden ${
          isLight ? "bg-white/60" : "bg-white/[0.03]"
        }`}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-app-subtle">
          <div className="flex items-center gap-2">
            <Package size={16} className={isLight ? "text-ink" : "text-clay"} />
            <h3 className="text-sm font-semibold text-primary">{headerLabel}</h3>
            <span className="text-xs text-secondary">({skills.length})</span>
          </div>
          <span className="text-[11px] text-secondary">{hintLabel}</span>
        </header>

        {loading && skills.length === 0 ? (
          <div className="px-4 py-6 flex items-center justify-center gap-2 text-sm text-secondary">
            <Loader2 size={14} className="animate-spin" />
          </div>
        ) : skills.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-secondary">{emptyLabel}</div>
        ) : (
          <ul className="divide-y divide-app max-h-[360px] overflow-y-auto">
            {skills.map((s) => (
              <li key={`${s.source}-${s.name}`}>
                <button
                  type="button"
                  onClick={() => onInsert(s.name)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.06] transition-colors group"
                >
                  {s.source === "personal" ? (
                    <User size={14} className="shrink-0 text-secondary" aria-hidden />
                  ) : (
                    <Sparkles size={14} className="shrink-0 text-secondary" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-primary truncate">{s.name}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                          s.source === "personal"
                            ? "bg-clay/20 text-clay"
                            : "bg-white/10 text-secondary"
                        }`}
                      >
                        {s.source === "personal" ? personalLabel : commonLabel}
                      </span>
                    </div>
                    {s.description && (
                      <p
                        className="mt-0.5 text-xs text-secondary"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {s.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      isLight
                        ? "border-ink/30 text-ink bg-ink/5 group-hover:bg-ink/10"
                        : "border-clay/40 text-clay bg-clay/10"
                    }`}
                  >
                    {useLabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
