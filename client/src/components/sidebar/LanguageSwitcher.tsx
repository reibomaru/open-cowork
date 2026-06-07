import { Languages } from "lucide-react"
import { useI18nStore, useT } from "../../i18n"
import type { Locale } from "../../i18n/messages"

export function LanguageSwitcher() {
  const locale = useI18nStore((s) => s.locale)
  const setLocale = useI18nStore((s) => s.setLocale)
  const t = useT()

  const next: Locale = locale === "ja" ? "en" : "ja"
  const nextLabel = t(`language.${next}` as const)

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      className="p-1.5 rounded-md hover:bg-white/10 text-secondary transition-colors flex items-center gap-1"
      title={t("language.switchTo", { lang: nextLabel })}
      aria-label={t("language.switchTo", { lang: nextLabel })}
    >
      <Languages size={16} />
      <span className="text-xs font-medium uppercase">{locale}</span>
    </button>
  )
}
