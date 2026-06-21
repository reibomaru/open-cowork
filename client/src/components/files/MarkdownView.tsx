// github-markdown-css を ?inline で取り込み、theme に応じて style を差し替える。
// 直接 import すると light/dark が両方適用されて後勝ちになるため、明示切替する。
import githubMarkdownDarkCss from "github-markdown-css/github-markdown-dark.css?inline"
import githubMarkdownLightCss from "github-markdown-css/github-markdown-light.css?inline"
import katexCss from "katex/dist/katex.min.css?inline"
import { Check, Copy, List, X } from "lucide-react"
import mermaid from "mermaid"
import { Highlight, themes as prismThemes } from "prism-react-renderer"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"
import { remarkAlert } from "remark-github-blockquote-alert"
import remarkMath from "remark-math"
import { useT } from "../../i18n"
import { extractToc, splitFrontmatter } from "../../lib/markdown-structure"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"
import { MermaidZoomModal } from "./MermaidZoomModal"

export function getMarkdownThemeCss(theme: "light" | "dark"): string {
  return theme === "dark" ? githubMarkdownDarkCss : githubMarkdownLightCss
}

export function getKatexCss(): string {
  return katexCss
}

let mermaidLastTheme: "light" | "dark" | null = null

function ensureMermaidInitialized(theme: "light" | "dark") {
  if (mermaidLastTheme === theme) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme === "dark" ? "dark" : "default",
    fontFamily: "inherit",
  })
  mermaidLastTheme = theme
}

function MermaidBlock({ code }: { code: string }) {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const rawId = useId()
  const renderId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`

  useEffect(() => {
    let cancelled = false
    ensureMermaidInitialized(theme)
    setError(null)
    mermaid
      .render(renderId, code)
      .then(({ svg }) => {
        if (cancelled) return
        setSvg(svg)
        if (containerRef.current) containerRef.current.innerHTML = svg
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSvg(null)
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [code, theme, renderId])

  if (error) {
    return (
      <pre className="my-2 p-3 rounded border border-neutral-400/40 bg-neutral-500/10 text-xs text-neutral-300 whitespace-pre-wrap">
        Mermaid render failed: {error}
        {"\n\n"}
        {code}
      </pre>
    )
  }
  return (
    <>
      <Tooltip label={t("markdownView.mermaidZoom")}>
        <button
          type="button"
          onClick={() => svg && setZoomOpen(true)}
          className="my-3 block w-full cursor-zoom-in border-0 bg-transparent p-0"
          aria-label={t("markdownView.mermaidZoom")}
        >
          <div ref={containerRef} className="flex justify-center overflow-x-auto" />
        </button>
      </Tooltip>
      {zoomOpen && svg && <MermaidZoomModal svg={svg} onClose={() => setZoomOpen(false)} />}
    </>
  )
}

function PrismCodeBlock({ code, lang }: { code: string; lang: string }) {
  const theme = useUIStore((s) => s.theme)
  const prismTheme = theme === "dark" ? prismThemes.vsDark : prismThemes.github
  return (
    <Highlight code={code} language={lang} theme={prismTheme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={className} style={{ ...style, padding: "1em", overflowX: "auto" }}>
          {tokens.map((line, i) => {
            const lineProps = getLineProps({ line })
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: token lines are stable per render
              <div key={i} {...lineProps}>
                {line.map((token, key) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: token order is stable per render
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            )
          })}
        </pre>
      )}
    </Highlight>
  )
}

interface MarkdownViewProps {
  content: string
  hostRef?: React.RefObject<HTMLDivElement | null>
  /** 目次/コピーなどの操作 UI を表示する (プレゼンター表示などでは false) */
  enableControls?: boolean
}

export function MarkdownView({ content, hostRef, enableControls = true }: MarkdownViewProps) {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const css = theme === "dark" ? githubMarkdownDarkCss : githubMarkdownLightCss
  const localHostRef = useRef<HTMLDivElement | null>(null)

  const { frontmatter, body } = useMemo(() => splitFrontmatter(content), [content])
  const toc = useMemo(() => extractToc(body), [body])
  const [tocOpen, setTocOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const showToc = enableControls && toc.length >= 2
  const showCopy = enableControls

  const setHost = (node: HTMLDivElement | null) => {
    localHostRef.current = node
    if (hostRef) hostRef.current = node
  }

  const scrollToHeading = (id: string) => {
    const el = localHostRef.current?.querySelector(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
    setTocOpen(false)
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // クリップボード API 不可時は黙って無視
    }
  }

  return (
    <div className="markdown-view-host relative" ref={setHost}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: bundled CSS string from github-markdown-css */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: bundled KaTeX CSS */}
      <style dangerouslySetInnerHTML={{ __html: katexCss }} />

      {(showToc || showCopy) && (
        // sticky + h-0 でスクロールしても右上にツールバーを固定する。
        // .markdown-body の外側なので PDF エクスポートには含まれない。
        <div className="sticky top-0 z-20 h-0">
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1 rounded-full border border-app bg-sidebar/90 px-1.5 py-1 shadow backdrop-blur">
              {showToc && (
                <Tooltip label={tocOpen ? t("markdownView.hideToc") : t("markdownView.toggleToc")}>
                  <button
                    type="button"
                    onClick={() => setTocOpen((v) => !v)}
                    className={`p-1.5 rounded-full hover:bg-white/10 ${
                      tocOpen ? "text-primary" : "text-secondary"
                    }`}
                    aria-label={t("markdownView.toggleToc")}
                    aria-pressed={tocOpen}
                  >
                    <List size={14} />
                  </button>
                </Tooltip>
              )}
              {showCopy && (
                <Tooltip label={copied ? t("markdownView.copied") : t("markdownView.copyMarkdown")}>
                  <button
                    type="button"
                    onClick={onCopy}
                    className="p-1.5 rounded-full hover:bg-white/10 text-secondary"
                    aria-label={t("markdownView.copyMarkdown")}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </Tooltip>
              )}
            </div>

            {showToc && tocOpen && (
              <nav
                className="w-64 max-h-[60vh] overflow-auto rounded-lg border border-app bg-sidebar/95 p-2 text-sm shadow-xl backdrop-blur"
                aria-label={t("markdownView.tableOfContents")}
              >
                <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-app">
                  <span className="text-xs font-semibold text-secondary">
                    {t("markdownView.tableOfContents")}
                  </span>
                  <Tooltip label={t("markdownView.close")}>
                    <button
                      type="button"
                      onClick={() => setTocOpen(false)}
                      className="p-0.5 rounded hover:bg-white/10 text-secondary"
                      aria-label={t("markdownView.close")}
                    >
                      <X size={12} />
                    </button>
                  </Tooltip>
                </div>
                <ul className="space-y-0.5">
                  {toc.map((item, i) => (
                    <li key={`${item.id}-${i}`}>
                      <button
                        type="button"
                        onClick={() => scrollToHeading(item.id)}
                        className="block w-full truncate rounded px-1.5 py-1 text-left text-secondary hover:bg-white/10 hover:text-primary"
                        style={{ paddingLeft: `${(item.depth - 1) * 12 + 6}px` }}
                        title={item.text}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </div>
      )}

      <article
        className="markdown-body"
        style={{ padding: "24px 32px", minHeight: "100%", boxSizing: "border-box" }}
      >
        {frontmatter !== null && (
          <details className="frontmatter-block mb-4 rounded border border-app bg-black/5">
            <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-semibold text-secondary">
              {t("markdownView.frontmatter")}
            </summary>
            <pre className="m-0 overflow-x-auto px-3 py-2 text-xs">{frontmatter}</pre>
          </details>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, remarkAlert]}
          rehypePlugins={[rehypeKatex, rehypeSlug]}
          components={{
            // fenced code block (```lang ... ```) は PrismCodeBlock / MermaidBlock が
            // 自前で <pre> を出すので、ReactMarkdown 既定の <pre> ラップは外す。
            // 該当しない場合 (純粋な <pre> 要素) はそのまま描画。
            pre({ children, ...rest }) {
              return <pre {...rest}>{children}</pre>
            },
            code(props) {
              const { className, children, ...rest } = props
              const match = /language-(\w+)/.exec(className ?? "")
              const lang = match?.[1]?.toLowerCase()
              const codeText = String(children).replace(/\n$/, "")
              if (!lang) {
                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                )
              }
              if (lang === "mermaid") {
                return <MermaidBlock code={codeText} />
              }
              return <PrismCodeBlock code={codeText} lang={lang} />
            },
          }}
        >
          {body}
        </ReactMarkdown>
      </article>
    </div>
  )
}
