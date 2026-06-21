import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useT } from "../../i18n"
import { api } from "../../lib/api"

interface PptxViewProps {
  path: string
  name: string
  blob: Blob
}

interface Slide {
  index: number
  paragraphs: string[]
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&amp;/g, "&")
}

// 1スライドの XML から段落（<a:p>）ごとのテキスト（<a:t>）を抽出する。
function extractParagraphs(xml: string): string[] {
  const paragraphs: string[] = []
  for (const paraMatch of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    let text = ""
    for (const runMatch of paraMatch[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) {
      text += decodeXmlEntities(runMatch[1])
    }
    if (text.trim().length > 0) paragraphs.push(text)
  }
  return paragraphs
}

// pptx を fflate で展開し、各スライドのテキストを抽出する（PDF 変換失敗時のフォールバック）。
async function extractSlides(blob: Blob): Promise<Slide[]> {
  const { unzipSync, strFromU8 } = await import("fflate")
  const buf = new Uint8Array(await blob.arrayBuffer())
  const files = unzipSync(buf)
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return na - nb
    })
  return slideNames.map((name, i) => ({
    index: i + 1,
    paragraphs: extractParagraphs(strFromU8(files[name])),
  }))
}

type State =
  | { kind: "loading" }
  | { kind: "pdf"; url: string }
  | { kind: "text"; slides: Slide[] }
  | { kind: "error" }

// pptx をプレビューする。まずサーバ側 LibreOffice で PDF 変換してレイアウトごと表示し、
// 変換に失敗した場合はクライアント側でテキストのみ抽出してフォールバック表示する。
export function PptxView({ path, name, blob }: PptxViewProps) {
  const t = useT()
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setState({ kind: "loading" })
    ;(async () => {
      try {
        const pdf = await api.fetchOfficePdfBlob(path)
        if (cancelled) return
        const url = URL.createObjectURL(pdf)
        createdUrl = url
        setState({ kind: "pdf", url })
      } catch {
        // PDF 変換に失敗したらテキスト抽出にフォールバックする。
        try {
          const slides = await extractSlides(blob)
          if (cancelled) return
          setState({ kind: "text", slides })
        } catch {
          if (!cancelled) setState({ kind: "error" })
        }
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [path, blob])

  if (state.kind === "loading") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-secondary">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{t("filePreview.converting")}</span>
      </div>
    )
  }

  if (state.kind === "pdf") {
    return <iframe src={state.url} title={name} className="w-full h-full bg-white" />
  }

  if (state.kind === "error") {
    return (
      <div className="h-full flex items-center justify-center text-sm text-secondary px-6 text-center">
        {t("filePreview.officeError")}
      </div>
    )
  }

  if (state.slides.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-secondary px-6 text-center">
        {t("filePreview.officeEmpty")}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 text-xs text-secondary">{t("filePreview.pptxTextOnly")}</p>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {state.slides.map((slide) => (
          <div key={slide.index} className="rounded-lg border border-app bg-sidebar p-4">
            <div className="mb-2 text-xs font-medium text-secondary">
              {t("filePreview.slideLabel", { n: slide.index })}
            </div>
            {slide.paragraphs.length === 0 ? (
              <p className="text-sm text-secondary italic">{t("filePreview.slideEmpty")}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {slide.paragraphs.map((para, i) => (
                  <p
                    // biome-ignore lint/suspicious/noArrayIndexKey: paragraph order is stable per render
                    key={i}
                    className="whitespace-pre-wrap text-sm text-primary"
                  >
                    {para}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
