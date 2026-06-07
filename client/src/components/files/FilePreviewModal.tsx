import { Download, ExternalLink, FileText, Loader2, Monitor, Printer, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useT } from "../../i18n"
import { WorkdirFileError, api } from "../../lib/api"
import {
  exportMarkdownToDocx,
  exportMarkdownToPdf,
  stripMarkdownExtension,
} from "../../lib/markdown-export"
import { Tooltip } from "../ui/Tooltip"
import { CodeViewer, detectLanguageFromName } from "./CodeViewer"
import { MarkdownView } from "./MarkdownView"
import { PresenterMode } from "./PresenterMode"

interface FilePreviewModalProps {
  path: string
  name: string
  onClose: () => void
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; reason: "tooLarge" | "generic" }
  | { kind: "ready"; blobUrl: string; mimeType: string; text?: string }

type MdViewMode = "preview" | "raw"

const TEXT_PREVIEW_LIMIT = 1024 * 1024 // 1MB を超えるテキストは生表示しない

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true
  return (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-javascript"
  )
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/")
}

function isPdfMime(mime: string): boolean {
  return mime === "application/pdf"
}

function isHtmlMime(mime: string): boolean {
  return mime.startsWith("text/html")
}

function isMarkdownMime(mime: string): boolean {
  return mime.startsWith("text/markdown") || mime.startsWith("text/x-markdown")
}

function isMarkdownFile(name: string, mimeType: string): boolean {
  if (isMarkdownMime(mimeType)) return true
  const lower = name.toLowerCase()
  return lower.endsWith(".md") || lower.endsWith(".markdown")
}

export function FilePreviewModal({ path, name, onClose }: FilePreviewModalProps) {
  const t = useT()
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [mdMode, setMdMode] = useState<MdViewMode>("preview")
  const [exportingKind, setExportingKind] = useState<"pdf" | "docx" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [presenterOpen, setPresenterOpen] = useState(false)
  const markdownHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    setState({ kind: "loading" })

    api
      .fetchWorkdirFileBlob(path)
      .then(async ({ blob, mimeType }) => {
        if (cancelled) return
        let text: string | undefined
        // text 系は <pre> で描画したいので、blob から先に text() しておく。
        if (isTextMime(mimeType) && blob.size <= TEXT_PREVIEW_LIMIT) {
          try {
            text = await blob.text()
          } catch {
            text = undefined
          }
        }
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        createdUrl = url
        setState({ kind: "ready", blobUrl: url, mimeType, text })
      })
      .catch((err) => {
        if (cancelled) return
        const tooLarge = err instanceof WorkdirFileError && err.status === 413
        setState({ kind: "error", reason: tooLarge ? "tooLarge" : "generic" })
      })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const showMdToggle =
    state.kind === "ready" && state.text !== undefined && isMarkdownFile(name, state.mimeType)
  const showMdExport = showMdToggle
  const markdownText = state.kind === "ready" ? state.text : undefined

  const onClickPdf = async () => {
    const host = markdownHostRef.current
    if (!host) return
    setExportError(null)
    setExportingKind("pdf")
    try {
      await exportMarkdownToPdf({
        hostElement: host,
        fileName: `${stripMarkdownExtension(name)}.pdf`,
      })
    } catch {
      setExportError(t("filePreview.exportFailed"))
    } finally {
      setExportingKind(null)
    }
  }

  const onClickDocx = async () => {
    if (markdownText == null) return
    setExportError(null)
    setExportingKind("docx")
    try {
      await exportMarkdownToDocx({
        markdown: markdownText,
        fileName: `${stripMarkdownExtension(name)}.docx`,
      })
    } catch {
      setExportError(t("filePreview.exportFailed"))
    } finally {
      setExportingKind(null)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onClose()
        }}
        role="presentation"
      >
        <div
          className="relative w-[min(90vw,960px)] h-[min(85vh,720px)] flex flex-col rounded-lg border border-app bg-sidebar shadow-xl"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={name}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-app">
            <span className="truncate text-sm text-primary" title={name}>
              {name}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {showMdToggle && (
                <div className="mr-1 inline-flex rounded border border-app overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setMdMode("preview")}
                    className={`px-2 py-1 ${
                      mdMode === "preview"
                        ? "bg-white/15 text-primary"
                        : "text-secondary hover:bg-white/5"
                    }`}
                    aria-pressed={mdMode === "preview"}
                  >
                    {t("filePreview.preview")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMdMode("raw")}
                    className={`px-2 py-1 border-l border-app ${
                      mdMode === "raw"
                        ? "bg-white/15 text-primary"
                        : "text-secondary hover:bg-white/5"
                    }`}
                    aria-pressed={mdMode === "raw"}
                  >
                    {t("filePreview.raw")}
                  </button>
                </div>
              )}
              {showMdExport && (
                <>
                  <Tooltip label={t("filePreview.presenterTooltip")}>
                    <button
                      type="button"
                      onClick={() => setPresenterOpen(true)}
                      className="p-1.5 rounded hover:bg-white/10 text-secondary"
                      aria-label={t("filePreview.presenter")}
                    >
                      <Monitor size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip
                    label={
                      mdMode === "raw"
                        ? t("filePreview.downloadPdfPreviewOnly")
                        : t("filePreview.downloadPdf")
                    }
                  >
                    <button
                      type="button"
                      onClick={onClickPdf}
                      disabled={exportingKind !== null || mdMode === "raw"}
                      className="p-1.5 rounded hover:bg-white/10 text-secondary disabled:opacity-40"
                      aria-label={t("filePreview.downloadPdf")}
                    >
                      {exportingKind === "pdf" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Printer size={14} />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip label={t("filePreview.downloadWord")}>
                    <button
                      type="button"
                      onClick={onClickDocx}
                      disabled={exportingKind !== null}
                      className="p-1.5 rounded hover:bg-white/10 text-secondary disabled:opacity-40"
                      aria-label={t("filePreview.downloadWord")}
                    >
                      {exportingKind === "docx" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <FileText size={14} />
                      )}
                    </button>
                  </Tooltip>
                </>
              )}
              {state.kind === "ready" && (
                <Tooltip label={t("filePreview.download")}>
                  <a
                    href={state.blobUrl}
                    download={name}
                    className="p-1.5 rounded hover:bg-white/10 text-secondary"
                    aria-label={t("filePreview.download")}
                  >
                    <Download size={14} />
                  </a>
                </Tooltip>
              )}
              {state.kind === "ready" && (
                <Tooltip label={t("filePreview.openInNewTab")}>
                  <a
                    href={state.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-white/10 text-secondary"
                    aria-label={t("filePreview.openInNewTab")}
                  >
                    <ExternalLink size={14} />
                  </a>
                </Tooltip>
              )}
              <Tooltip label={t("filePreview.close")}>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-white/10 text-secondary"
                  aria-label={t("filePreview.close")}
                >
                  <X size={16} />
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-black/10">
            <FilePreviewBody
              state={state}
              name={name}
              mdMode={mdMode}
              t={t}
              markdownHostRef={markdownHostRef}
            />
          </div>
          {exportError && (
            <div
              role="alert"
              className="px-4 py-2 text-xs text-neutral-300 border-t border-neutral-500/30 bg-neutral-500/10"
            >
              {exportError}
            </div>
          )}
        </div>
      </div>
      {presenterOpen && markdownText != null && (
        <PresenterMode
          content={markdownText}
          title={name}
          onClose={() => setPresenterOpen(false)}
        />
      )}
    </>
  )
}

function FilePreviewBody({
  state,
  name,
  mdMode,
  t,
  markdownHostRef,
}: {
  state: LoadState
  name: string
  mdMode: MdViewMode
  t: ReturnType<typeof useT>
  markdownHostRef: React.RefObject<HTMLDivElement | null>
}) {
  if (state.kind === "loading") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-secondary">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{t("filePreview.loading")}</span>
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div className="h-full flex items-center justify-center text-sm text-neutral-400">
        {t(state.reason === "tooLarge" ? "filePreview.tooLarge" : "filePreview.error")}
      </div>
    )
  }

  const { mimeType, blobUrl, text } = state

  if (isImageMime(mimeType)) {
    return (
      <div className="h-full flex items-center justify-center p-2">
        <img src={blobUrl} alt={name} className="max-w-full max-h-full object-contain" />
      </div>
    )
  }

  if (isPdfMime(mimeType)) {
    return <iframe src={blobUrl} title={name} className="w-full h-full bg-white" />
  }

  if (isHtmlMime(mimeType)) {
    return (
      <iframe
        src={blobUrl}
        title={name}
        // HTML プレビューは untrusted コンテンツ扱いで sandbox する。
        sandbox=""
        className="w-full h-full bg-white"
      />
    )
  }

  if (text !== undefined && isMarkdownFile(name, mimeType) && mdMode === "preview") {
    return <MarkdownView content={text} hostRef={markdownHostRef} />
  }

  if (text !== undefined) {
    // raw 表示は VSCode 風: 行番号 + シンタックスハイライト。MD の raw は markdown
    // 言語で、それ以外は拡張子から推定する。
    // Markdown を "markdown" 言語で Prism にかけるとテーブル行がセル単位に展開されて
    // 表示が崩れるため、Raw 表示では "text" を使う。
    const lang = isMarkdownFile(name, mimeType) ? "text" : detectLanguageFromName(name)
    return <CodeViewer code={text} language={lang} />
  }

  return (
    <div className="h-full flex items-center justify-center text-sm text-secondary px-6 text-center">
      {t("filePreview.binaryNotice")}
    </div>
  )
}
