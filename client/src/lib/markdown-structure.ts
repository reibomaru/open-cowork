import GithubSlugger from "github-slugger"

export interface TocItem {
  depth: number
  text: string
  id: string
}

/**
 * 先頭の YAML frontmatter (`---` で囲まれたブロック) を分離する。
 * frontmatter が無ければ frontmatter は null、body は元のまま。
 */
export function splitFrontmatter(src: string): {
  frontmatter: string | null
  body: string
} {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(src)
  if (!m || m.index !== 0) return { frontmatter: null, body: src }
  return { frontmatter: m[1], body: src.slice(m[0].length) }
}

/** 見出し表示・slug 用に inline markdown 記法を素のテキストへ落とす。 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // image
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // link → text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(\*|_)([^*_]+)\1/g, "$2") // italic
    .replace(/~~([^~]+)~~/g, "$1") // strikethrough
    .trim()
}

/**
 * Markdown 本文から見出しを抽出して TOC を組み立てる。
 * id は rehype-slug と同じ github-slugger で生成するためアンカーと一致する。
 * fenced code block 内の `#` は見出し扱いしない。
 */
export function extractToc(body: string): TocItem[] {
  const slugger = new GithubSlugger()
  const items: TocItem[] = []
  let fence: string | null = null

  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0].repeat(3)
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence !== null) continue

    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!h) continue
    const text = stripInlineMarkdown(h[2])
    if (!text) continue
    items.push({ depth: h[1].length, text, id: slugger.slug(text) })
  }
  return items
}
