import { Plug2, Sparkles, Wrench } from "lucide-react"
import { useT } from "../../i18n"
import type { SkillReference } from "../../types/message"

interface SkillReferenceChipProps {
  reference: SkillReference
}

export function SkillReferenceChip({ reference }: SkillReferenceChipProps) {
  const t = useT()
  const { source, name, detail } = reference

  // source 別にラベル / アイコン / カラーを切り替えて、skill / MCP / 標準ツールを
  // 視覚的に区別できるようにする。
  const { label, Icon, colorClass, detailClass } = (() => {
    switch (source) {
      case "slash":
        return {
          label: t("skills.chip.invoked", { name }),
          Icon: Sparkles,
          colorClass: "bg-clay/15 text-clay",
          detailClass: "text-clay/70",
        }
      case "tool":
        return {
          label: t("skills.chip.referenced", { name }),
          Icon: Sparkles,
          colorClass: "bg-clay/15 text-clay",
          detailClass: "text-clay/70",
        }
      case "mcp":
        return {
          label: t("skills.chip.mcp", { name }),
          Icon: Plug2,
          colorClass: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
          detailClass: "text-sky-600/70 dark:text-sky-300/70",
        }
      case "builtin":
        return {
          label: t("skills.chip.builtin", { name }),
          Icon: Wrench,
          colorClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
          detailClass: "text-violet-700/70 dark:text-violet-300/70",
        }
    }
  })()

  // detail (例: Read のファイルパス / Bash のコマンド) は chip 右側に等幅で出して
  // ツール本体の名前 (label) と視覚的に分離する。長文は CSS で truncate。
  const titleAttr = detail ? `${name} — ${detail}` : name
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs max-w-full ${colorClass}`}
      title={titleAttr}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{label}</span>
      {detail && <span className={`truncate font-mono text-[11px] ${detailClass}`}>{detail}</span>}
    </div>
  )
}
