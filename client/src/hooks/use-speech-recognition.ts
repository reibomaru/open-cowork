import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale } from "../i18n"

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

  useEffect(() => {
    finalCallbackRef.current = onFinalResult
  }, [onFinalResult])

  const isSupported = getCtor() !== null

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    const rec = new Ctor()
    rec.lang = locale === "ja" ? "ja-JP" : "en-US"
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
      setError(mapError(event.error))
      setIsListening(false)
      setInterimTranscript("")
    }
    rec.onend = () => {
      setIsListening(false)
      setInterimTranscript("")
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
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  return { isSupported, isListening, interimTranscript, error, start, stop }
}
