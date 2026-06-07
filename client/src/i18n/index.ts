import { create } from "zustand"
import { type Locale, type TKey, messages } from "./messages"

const LOCALE_STORAGE_KEY = "cowork.locale"
const DEFAULT_LOCALE: Locale = "ja"

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored === "ja" || stored === "en") return stored
  return DEFAULT_LOCALE
}

interface I18nStore {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18nStore = create<I18nStore>((set) => ({
  locale: detectInitialLocale(),
  setLocale: (locale) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
      document.documentElement.lang = locale
    }
    set({ locale })
  },
}))

if (typeof document !== "undefined") {
  document.documentElement.lang = useI18nStore.getState().locale
}

function lookup(locale: Locale, key: string): string {
  const parts = key.split(".")
  // biome-ignore lint/suspicious/noExplicitAny: traversing a nested object tree
  let cur: any = messages[locale]
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return key
    cur = cur[p]
  }
  return typeof cur === "string" ? cur : key
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const v = params[name]
    return v == null ? "" : String(v)
  })
}

export function useT() {
  const locale = useI18nStore((s) => s.locale)
  return (key: TKey, params?: Record<string, string | number>): string =>
    interpolate(lookup(locale, key), params)
}

export function useLocale(): Locale {
  return useI18nStore((s) => s.locale)
}

export type { Locale, TKey }
