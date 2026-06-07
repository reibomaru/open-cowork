import { Highlight, themes as prismThemes } from "prism-react-renderer"
import { useUIStore } from "../../store/ui-store"

// 拡張子ベースで prism-react-renderer (= Prism) の言語名にマッピングする。
// prism-react-renderer の同梱言語のみを使う前提なので、未収載の言語は無理に変換しない。
const EXT_TO_LANG: Record<string, string> = {
  ts: "tsx",
  tsx: "tsx",
  js: "jsx",
  jsx: "jsx",
  mjs: "jsx",
  cjs: "jsx",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  sql: "sql",
  html: "markup",
  xml: "markup",
  svg: "markup",
  css: "css",
  scss: "scss",
  less: "less",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "docker",
}

export function detectLanguageFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower === "dockerfile" || lower.endsWith("/dockerfile")) return "docker"
  const dot = lower.lastIndexOf(".")
  if (dot < 0) return "text"
  const ext = lower.slice(dot + 1)
  return EXT_TO_LANG[ext] ?? "text"
}

interface CodeViewerProps {
  code: string
  language: string
}

export function CodeViewer({ code, language }: CodeViewerProps) {
  const theme = useUIStore((s) => s.theme)
  const isDark = theme === "dark"
  const prismTheme = isDark ? prismThemes.vsDark : prismThemes.github
  // 行番号ガターと本文を分けるための border/gutter 色
  const gutterColor = isDark ? "#858585" : "#237893"
  const gutterBorder = isDark ? "#2d2d2d" : "#e7e7e7"

  return (
    <Highlight code={code} language={language} theme={prismTheme}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => {
        const lineNumWidth = `${String(tokens.length).length + 1}ch`
        return (
          <pre
            className={`${className} m-0 text-[12.5px] leading-[1.55] font-mono`}
            style={{
              ...style,
              padding: 0,
              minHeight: "100%",
              overflow: "auto",
            }}
          >
            <code className="block">
              {tokens.map((line, i) => {
                const lineProps = getLineProps({ line })
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: line index is stable per render
                    key={i}
                    {...lineProps}
                    className={`${lineProps.className ?? ""} flex`}
                    style={{ ...lineProps.style }}
                  >
                    <span
                      aria-hidden="true"
                      className="select-none shrink-0 text-right pr-3 pl-3"
                      style={{
                        width: `calc(${lineNumWidth} + 1.5rem)`,
                        color: gutterColor,
                        borderRight: `1px solid ${gutterBorder}`,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="pl-4 pr-4 whitespace-pre flex-1">
                      {line.length === 0 || (line.length === 1 && line[0].empty) ? (
                        // 空行に高さを持たせる
                        <span>{"​"}</span>
                      ) : (
                        line.map((token, key) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: token order is stable per render
                          <span key={key} {...getTokenProps({ token })} />
                        ))
                      )}
                    </span>
                  </div>
                )
              })}
            </code>
          </pre>
        )
      }}
    </Highlight>
  )
}
