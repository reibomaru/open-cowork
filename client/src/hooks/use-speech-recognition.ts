import { useCallback, useEffect, useRef, useState } from "react"
import { type Locale, useLocale } from "../i18n"

// Minimal type surface for the Web Speech API since lib.dom omits it.
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

export type SpeechRecognitionErrorKind =
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "unknown"

interface UseSpeechRecognitionOptions {
  onFinalResult?: (transcript: string) => void
}

interface UseSpeechRecognitionResult {
  isSupported: boolean
  isListening: boolean
  interimTranscript: string
  error: SpeechRecognitionErrorKind | null
  start: () => void
  stop: () => void
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

// i18n locale → Web Speech API の BCP-47 タグ。Record にしておくことで locale を
// 追加した際に型エラーで対応漏れを検知できる (網羅性チェック)。
const LOCALE_TO_BCP47: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
}

function mapError(code: string): SpeechRecognitionErrorKind {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed"
    case "no-speech":
      return "no-speech"
    case "audio-capture":
      return "audio-capture"
    case "network":
      return "network"
    default:
      return "unknown"
  }
}

export function useSpeechRecognition({
  onFinalResult,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const locale = useLocale()
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<SpeechRecognitionErrorKind | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalCallbackRef = useRef(onFinalResult)
  // ユーザが明示的に停止した / 致命的エラーで止めたいときに true。
  // 連続認識の onend は無音タイムアウト等でも発火するため、これを見て自動再開を抑制する。
  const manualStopRef = useRef(false)

  useEffect(() => {
    finalCallbackRef.current = onFinalResult
  }, [onFinalResult])

  const isSupported = getCtor() !== null

  const stop = useCallback(() => {
    manualStopRef.current = true
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    manualStopRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    const rec = new Ctor()
    rec.lang = LOCALE_TO_BCP47[locale] ?? "en-US"
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (event) => {
      let interim = ""
      let finalChunk = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) finalChunk += text
        else interim += text
      }
      setInterimTranscript(interim)
      if (finalChunk) {
        finalCallbackRef.current?.(finalChunk)
      }
    }
    rec.onerror = (event) => {
      const kind = mapError(event.error)
      // no-speech は連続ディクテーション中の無音区間で普通に起きる。エラー表示せず
      // onend → 自動再開に任せ、長文入力が途切れないようにする。
      if (kind === "no-speech") {
        setInterimTranscript("")
        return
      }
      // 権限拒否・マイク不可・ネットワーク等は復旧不能なので自動再開を止めてエラー表示。
      manualStopRef.current = true
      setError(kind)
      setInterimTranscript("")
    }
    rec.onend = () => {
      setInterimTranscript("")
      // ユーザ停止でも致命的エラーでもない (無音タイムアウト等) なら継続のため再開する。
      if (!manualStopRef.current) {
        try {
          rec.start()
          return
        } catch {
          // 再開に失敗したら通常停止扱いにフォールバック。
        }
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    setError(null)
    setInterimTranscript("")
    try {
      rec.start()
      recognitionRef.current = rec
      setIsListening(true)
    } catch {
      setError("unknown")
    }
  }, [locale])

  useEffect(() => {
    return () => {
      manualStopRef.current = true
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  return { isSupported, isListening, interimTranscript, error, start, stop }
}
