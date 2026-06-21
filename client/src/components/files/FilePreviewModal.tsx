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
import { CodeViewer, detectLanguageFromName, isLikelyTextFile } from "./CodeViewer"
import { DocxView } from "./DocxView"
import { MarkdownView } from "./MarkdownView"
import { PptxView } from "./PptxView"
import { PresenterMode } from "./PresenterMode"
import { XlsxView } from "./XlsxView"

interface FilePreviewModalProps {
  path: string
  name: string
  onClose: () => void
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; reason: "tooLarge" | "generic" }
  | { kind: "ready"; blob: Blob; blobUrl: string; mimeType: string; text?: string }

type MdViewMode = "preview" | "raw"

type OfficeKind = "docx" | "xlsx" | "pptx"

const TEXT_PREVIEW_LIMIT = 1024 * 1024 // 1MB を超えるテキストは生表示しない

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true
  return (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-javascript" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "text/yaml" ||
    mime === "text/x-yaml"
  )
}

// docx/xlsx/pptx かどうかを拡張子優先（サーバの MIME は信頼できないことがある）で判定する。
function detectOfficeKind(name: string, mime: string): OfficeKind | null {
  const lower = name.toLowerCase()
  if (lower.endsWith(".docx")) return "docx"
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "xlsx"
  if (lower.endsWith(".pptx")) return "pptx"
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return "docx"
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel.sheet.macroEnabled.12"
  )
    return "xlsx"
  if (mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation")
    return "pptx"
  return null
}

// 「新しいタブで開く」で blob URL を開くと、MIME 次第でブラウザがダウンロード扱いに
// してしまう。インライン表示できる MIME を返し、テキスト系は text/plain に正規化する。
function viewableBlobType(name: string, mime: string): string {
  if (mime.startsWith("text/") || isImageMime(mime) || isPdfMime(mime)) return mime
  if (isTextMime(mime) || isLikelyTextFile(name)) return "text/plain;charset=utf-8"
  return mime
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
        // MIME がバイナリ判定でも、拡張子がテキスト系なら読み込む（yaml 等のフォールバック）。
        const isOffice = detectOfficeKind(name, mimeType) !== null
        if (
          !isOffice &&
          (isTextMime(mimeType) || isLikelyTextFile(name)) &&
          blob.size <= TEXT_PREVIEW_LIMIT
        ) {
          try {
            text = await blob.text()
          } catch {
            text = undefined
          }
        }
        if (cancelled) return
        // 新しいタブで開いた際にダウンロードされないよう、表示可能な MIME に正規化する。
        const viewType = viewableBlobType(name, mimeType)
        const viewBlob = viewType === blob.type ? blob : new Blob([blob], { type: viewType })
        const url = URL.createObjectURL(viewBlob)
        createdUrl = url
        setState({ kind: "ready", blob, blobUrl: url, mimeType, text })
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
  }, [path, name])

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

  // 「新しいタブで開く」はブラウザを閉じても有効な永続 URL（サーバのエンドポイント）に向ける。
  // Office (docx/xlsx/pptx) は PDF 変換してインライン表示、その他は content をそのまま表示する。
  const newTabUrl =
    state.kind === "ready"
      ? detectOfficeKind(name, state.mimeType)
        ? api.getOfficePdfUrl(path)
        : api.getContentUrl(path)
      : ""

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
                    href={newTabUrl}
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
              path={path}
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
  path,
  name,
  mdMode,
  t,
  markdownHostRef,
}: {
  state: LoadState
  path: string
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

  const { mimeType, blobUrl, blob, text } = state

  const officeKind = detectOfficeKind(name, mimeType)
  if (officeKind === "docx") return <DocxView blob={blob} />
  if (officeKind === "xlsx") return <XlsxView blob={blob} />
  if (officeKind === "pptx") return <PptxView path={path} name={name} blob={blob} />

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
