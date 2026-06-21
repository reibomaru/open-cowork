import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"
import { getMarkdownThemeCss } from "./MarkdownView"

interface DocxViewProps {
  blob: Blob
}

// docx を mammoth で HTML に変換して表示する。mammoth は重いので動的 import する。
export function DocxView({ blob }: DocxViewProps) {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const [html, setHtml] = useState<string | null>(null)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    setErrored(false)
    setHtml(null)
    ;(async () => {
      try {
        const mammoth = (await import("mammoth/mammoth.browser")) as typeof import("mammoth")
        const arrayBuffer = await blob.arrayBuffer()
        if (cancelled) return
        const result = await mammoth.convertToHtml({ arrayBuffer })
        if (cancelled) return
        setHtml(result.value)
      } catch {
        if (!cancelled) setErrored(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blob])

  if (errored) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-secondary px-6 text-center">
        {t("filePreview.officeError")}
      </div>
    )
  }

  if (html === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-secondary">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{t("filePreview.loading")}</span>
      </div>
    )
  }

  return (
    <div className="markdown-view-host">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: bundled CSS string from github-markdown-css */}
      <style dangerouslySetInnerHTML={{ __html: getMarkdownThemeCss(theme) }} />
      <article
        className="markdown-body"
        style={{ padding: "24px 32px", minHeight: "100%", boxSizing: "border-box" }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mammoth が生成する制限された HTML（script なし）
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
