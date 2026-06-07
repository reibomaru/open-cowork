import { Code, Download, ExternalLink, Loader2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useT } from "../../i18n"
import type { HtmlBlock } from "../../types/message"
import { Collapsible } from "../ui/Collapsible"
import { Tooltip } from "../ui/Tooltip"

interface HtmlBlockRendererProps {
  block: HtmlBlock
}

export function HtmlBlockRenderer({ block }: HtmlBlockRendererProps) {
  const t = useT()
  const [iframeHeight, setIframeHeight] = useState(300)
  // ストリーミング中は毎チャンクで iframe を作り直すとちらつくのでスロットリング。
  // status が complete になったら即座に最終 HTML を反映する。
  const [renderedHtml, setRenderedHtml] = useState(block.html)
  useEffect(() => {
    if (block.status === "complete") {
      setRenderedHtml(block.html)
      return
    }
    const t = setTimeout(() => setRenderedHtml(block.html), 200)
    return () => clearTimeout(t)
  }, [block.html, block.status])

  // Listen for height messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "html-block-resize" && event.data?.height) {
        setIframeHeight(Math.min(event.data.height + 16, 800))
      }
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const handleDownload = useCallback(() => {
    const blob = new Blob([block.html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${block.title || "output"}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [block.html, block.title])

  const handleOpenInNewTab = useCallback(() => {
    const blob = new Blob([block.html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
  }, [block.html])

  // Inject a resize script into the HTML so the iframe reports its height.
  // streaming 中もスクリプトを注入して、HTML が伸びるたびに高さを追従させる。
  const htmlWithResizeScript = renderedHtml
    ? `${renderedHtml}<script>
(function() {
  function reportHeight() {
    var h = document.documentElement.scrollHeight || document.body.scrollHeight;
    parent.postMessage({ type: 'html-block-resize', height: h }, '*');
  }
  if (document.readyState === 'complete') reportHeight();
  else window.addEventListener('load', reportHeight);
  new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true });
})();
</script>`
    : ""

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <Code size={14} className="text-neutral-400 shrink-0" />
      <span className="text-primary font-medium">HTML</span>
      {block.title && <span className="text-secondary text-xs truncate">{block.title}</span>}
      {block.status === "streaming" && <Loader2 size={14} className="text-neutral-400 animate-spin" />}
      {block.status === "complete" && (
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <Tooltip label={t("htmlBlock.download")}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDownload()
              }}
              aria-label={t("htmlBlock.download")}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <Download size={12} className="text-secondary" />
            </button>
          </Tooltip>
          <Tooltip label={t("htmlBlock.openInNewTab")}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleOpenInNewTab()
              }}
              aria-label={t("htmlBlock.openInNewTab")}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <ExternalLink size={12} className="text-secondary" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )

  return (
    <div className="my-2">
      <Collapsible header={header} defaultOpen={true}>
        <div className="bg-white rounded-b-lg overflow-hidden">
          {renderedHtml ? (
            // streaming / complete どちらも手元の HTML を srcDoc に流して描画する。
            // 以前は完了後に `/api/artifacts/:filename` を src で読みに行っていたが、
            // iframe のフレームナビゲーションには SPA の customFetch が介在せず
            // X-User-Id が付かないため、認証が有効な構成では 401/302 になり cross-origin
            // で弾かれる。block.html は既に store に揃っているのでサーバ往復を廃し
            // srcDoc 経路に一本化する。
            <iframe
              sandbox="allow-scripts"
              srcDoc={htmlWithResizeScript}
              title={block.title || "HTML content"}
              className="w-full border-none"
              style={{ height: iframeHeight }}
            />
          ) : (
            <div className="flex items-center gap-2 p-4 text-sm text-secondary">
              <Loader2 size={16} className="animate-spin text-neutral-400" />
              <span>HTML content generating...</span>
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  )
}
