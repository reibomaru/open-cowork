import { formatDistanceToNow } from "date-fns"
import { enUS, ja } from "date-fns/locale"
import type { Locale } from "../i18n/messages"

const localeMap = { ja, en: enUS } as const

export function timeAgo(timestamp: number, locale: Locale = "ja"): string {
  return formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: localeMap[locale],
  })
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return `${str.slice(0, maxLen - 1)}…`
}
