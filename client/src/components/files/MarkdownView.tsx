// github-markdown-css を ?inline で取り込み、theme に応じて style を差し替える。
// 直接 import すると light/dark が両方適用されて後勝ちになるため、明示切替する。
import githubMarkdownDarkCss from "github-markdown-css/github-markdown-dark.css?inline"
import githubMarkdownLightCss from "github-markdown-css/github-markdown-light.css?inline"
import katexCss from "katex/dist/katex.min.css?inline"
import mermaid from "mermaid"
import { Highlight, themes as prismThemes } from "prism-react-renderer"
import { useEffect, useId, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { useUIStore } from "../../store/ui-store"

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
  const theme = useUIStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
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
        if (containerRef.current) containerRef.current.innerHTML = svg
      })
      .catch((err: unknown) => {
        if (cancelled) return
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
  return <div ref={containerRef} className="my-3 flex justify-center overflow-x-auto" />
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
}

export function MarkdownView({ content, hostRef }: MarkdownViewProps) {
  const theme = useUIStore((s) => s.theme)
  const css = theme === "dark" ? githubMarkdownDarkCss : githubMarkdownLightCss

  return (
    <div className="markdown-view-host" ref={hostRef}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: bundled CSS string from github-markdown-css */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: bundled KaTeX CSS */}
      <style dangerouslySetInnerHTML={{ __html: katexCss }} />
      <article
        className="markdown-body"
        style={{ padding: "24px 32px", minHeight: "100%", boxSizing: "border-box" }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
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
          {content}
        </ReactMarkdown>
      </article>
    </div>
  )
}
