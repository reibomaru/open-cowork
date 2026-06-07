import { Coins } from "lucide-react"
import { useT } from "../../i18n"
import type { SessionUsage } from "../../types/session"

/** 1234567 → "1.2M" / 12345 → "12.3k" / 999 → "999"。バッジ用の短縮表記。 */
function abbreviateTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** コストを USD 表示用に整形する。サブセント精度を出すため 4 桁固定。 */
function formatCost(usd: number): string {
  return usd.toFixed(4)
}

/**
 * セッション累計のトークン使用量とコストを表示するバッジ。
 * usage 未確定 (1 ターンも完了していない / mock 以外で未取得) のときは何も描画しない。
 */
export function UsageBadge({ usage }: { usage: SessionUsage | undefined }) {
  const t = useT()
  if (!usage) return null

  const totalTokens =
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadInputTokens +
    usage.cacheCreationInputTokens

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-secondary whitespace-nowrap"
      aria-label={t("chat.usage.label")}
    >
      <Coins size={14} />
      <span>
        {t("chat.usage.total", {
          tokens: abbreviateTokens(totalTokens),
          cost: formatCost(usage.costUSD),
        })}
      </span>
    </span>
  )
}
