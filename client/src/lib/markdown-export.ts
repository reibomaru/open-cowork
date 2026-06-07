// Markdown のエクスポート (PDF / Word)
//
// PDF: 既にレンダリング済みの .markdown-body DOM をクローンして、
//      print 用 CSS と共に非表示 iframe に書き込み window.print() を呼ぶ。
//      Mermaid SVG, Prism ハイライト, KaTeX もそのまま保持できる。
//
// Word: 元の Markdown 文字列を unified/remark-parse でパースし、
//      mdast → docx の Document に変換して .docx として保存する。

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  type ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { getKatexCss, getMarkdownThemeCss } from "../components/files/MarkdownView"

// ---- 共通 -------------------------------------------------------------

export function stripMarkdownExtension(name: string): string {
  return name.replace(/\.(md|markdown)$/i, "")
}

// ---- PDF --------------------------------------------------------------

/**
 * レンダリング済みの .markdown-body DOM から HTML を生成し、
 * サーバーサイドの Playwright エンドポイント (/api/export/pdf) に送信して
 * PDF バイナリをダウンロードする。印刷ダイアログは表示されない。
 */
export async function exportMarkdownToPdf(opts: {
  hostElement: HTMLElement
  fileName: string
}): Promise<void> {
  const { hostElement, fileName } = opts
  const body = hostElement.querySelector(".markdown-body")
  if (!body) throw new Error("markdown body not found")

  const html = buildPrintHtml({
    title: stripMarkdownExtension(fileName),
    bodyHtml: body.outerHTML,
    themeCss: getMarkdownThemeCss("light"),
    katexCss: getKatexCss(),
  })

  const { api } = await import("./api")
  const blob = await api.exportPdf(html, fileName)
  triggerBlobDownload(blob, fileName)
}

export function buildPrintHtml(args: {
  title: string
  bodyHtml: string
  themeCss: string
  katexCss: string
}): string {
  const { title, bodyHtml, themeCss, katexCss } = args
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet" />
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>
  @page { size: A4; margin: 18mm 15mm; }
  html, body { background: #fff; color: #1f2328; font-family: 'Noto Sans JP', sans-serif; }
  body { margin: 0; }
  .markdown-body {
    box-sizing: border-box;
    max-width: 100%;
    margin: 0 auto;
    padding: 0 !important;
    background: #fff !important;
    font-family: 'Noto Sans JP', sans-serif;
  }
  .markdown-body pre { page-break-inside: avoid; }
  .markdown-body table { page-break-inside: auto; }
  .markdown-body img, .markdown-body svg { max-width: 100%; height: auto; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 { page-break-after: avoid; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// ---- Word (.docx) -----------------------------------------------------

// mdast の最低限の型定義
type MdNode = {
  type: string
  // biome-ignore lint/suspicious/noExplicitAny: mdast tree
  children?: any[]
  value?: string
  depth?: number
  ordered?: boolean
  lang?: string | null
  checked?: boolean | null
  align?: ("left" | "right" | "center" | null)[]
  url?: string
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const

export async function exportMarkdownToDocx(opts: {
  markdown: string
  fileName: string
}): Promise<void> {
  const { markdown, fileName } = opts
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdNode
  const blocks = convertChildrenToBlocks(tree.children ?? [])

  const doc = new Document({
    creator: "Open Cowork",
    title: fileName,
    sections: [
      {
        properties: {},
        children: blocks,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  triggerBlobDownload(blob, fileName)
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}

// block-level の修飾オプション (引用やリストでインデントするときに渡す)
interface BlockDecoration {
  indentLeft?: number
  leftBorder?: boolean
}

function convertChildrenToBlocks(
  nodes: MdNode[],
  deco: BlockDecoration = {},
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const node of nodes) {
    for (const b of convertBlockNode(node, deco)) out.push(b)
  }
  return out
}

function convertBlockNode(node: MdNode, deco: BlockDecoration): (Paragraph | Table)[] {
  switch (node.type) {
    case "heading": {
      const level = Math.max(1, Math.min(6, node.depth ?? 1)) - 1
      return [
        new Paragraph({
          heading: HEADING_LEVELS[level],
          ...paragraphDecorationOptions(deco),
          children: convertInlineChildren(node.children ?? []),
        }),
      ]
    }
    case "paragraph": {
      return [
        new Paragraph({
          ...paragraphDecorationOptions(deco),
          children: convertInlineChildren(node.children ?? []),
        }),
      ]
    }
    case "blockquote": {
      return convertChildrenToBlocks(node.children ?? [], {
        indentLeft: (deco.indentLeft ?? 0) + 360,
        leftBorder: true,
      })
    }
    case "list": {
      return convertList(node, 0, deco)
    }
    case "code": {
      return convertCodeBlock(node.value ?? "", deco)
    }
    case "thematicBreak": {
      return [
        new Paragraph({
          ...paragraphDecorationOptions(deco),
          border: {
            bottom: { color: "BFBFBF", space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
        }),
      ]
    }
    case "table": {
      return [convertTable(node)]
    }
    case "html": {
      return [
        new Paragraph({
          ...paragraphDecorationOptions(deco),
          children: [new TextRun({ text: node.value ?? "" })],
        }),
      ]
    }
    default: {
      if (node.children && node.children.length > 0) {
        return convertChildrenToBlocks(node.children, deco)
      }
      if (typeof node.value === "string" && node.value.length > 0) {
        return [
          new Paragraph({
            ...paragraphDecorationOptions(deco),
            children: [new TextRun({ text: node.value })],
          }),
        ]
      }
      return []
    }
  }
}

function paragraphDecorationOptions(deco: BlockDecoration) {
  const opts: {
    indent?: { left: number }
    border?: {
      left?: { color: string; space: number; style: typeof BorderStyle.SINGLE; size: number }
    }
  } = {}
  if (deco.indentLeft && deco.indentLeft > 0) opts.indent = { left: deco.indentLeft }
  if (deco.leftBorder) {
    opts.border = {
      left: { color: "BFBFBF", space: 8, style: BorderStyle.SINGLE, size: 12 },
    }
  }
  return opts
}

function convertList(node: MdNode, level: number, deco: BlockDecoration): Paragraph[] {
  const ordered = node.ordered === true
  const items = node.children ?? []
  const out: Paragraph[] = []
  const baseIndent = (deco.indentLeft ?? 0) + 360 * (level + 1)

  items.forEach((item: MdNode, idx: number) => {
    const checked = item.checked
    const itemChildren = item.children ?? []
    let prefixed = false
    for (const child of itemChildren) {
      if (child.type === "list") {
        for (const p of convertList(child, level + 1, deco)) out.push(p)
        continue
      }
      if (child.type === "paragraph") {
        const prefix = prefixed ? "" : makeListPrefix({ ordered, index: idx, level, checked })
        const inlineChildren = convertInlineChildren(child.children ?? [])
        const children: ParagraphChild[] = prefix
          ? [new TextRun({ text: prefix }), ...inlineChildren]
          : inlineChildren
        out.push(
          new Paragraph({
            indent: { left: baseIndent },
            children,
          }),
        )
        prefixed = true
        continue
      }
      // その他 (code, blockquote 等) はインデントだけ揃える
      const blocks = convertBlockNode(child, { indentLeft: baseIndent })
      for (const b of blocks) out.push(b as Paragraph)
    }
    if (!prefixed && itemChildren.length === 0) {
      out.push(
        new Paragraph({
          indent: { left: baseIndent },
          children: [
            new TextRun({ text: makeListPrefix({ ordered, index: idx, level, checked }) }),
          ],
        }),
      )
    }
  })
  return out
}

function makeListPrefix(args: {
  ordered: boolean
  index: number
  level: number
  checked: boolean | null | undefined
}): string {
  const { ordered, index, level, checked } = args
  if (typeof checked === "boolean") {
    return checked ? "[x] " : "[ ] "
  }
  if (ordered) return `${index + 1}. `
  const bullets = ["• ", "◦ ", "▪ "]
  return bullets[level % bullets.length]
}

function convertCodeBlock(value: string, deco: BlockDecoration): Paragraph[] {
  const lines = value.split("\n")
  return lines.map(
    (line, i) =>
      new Paragraph({
        ...paragraphDecorationOptions(deco),
        spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 120 : 0 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F6F8FA" },
        children: [
          new TextRun({
            text: line.length > 0 ? line : " ",
            font: "Consolas",
            size: 20,
          }),
        ],
      }),
  )
}

function convertTable(node: MdNode): Table {
  const rows = node.children ?? []
  const tableRows = rows.map((row: MdNode, rowIdx: number) => {
    const cells = row.children ?? []
    const tableCells = cells.map(
      (cell: MdNode) =>
        new TableCell({
          width: { size: 100 / Math.max(cells.length, 1), type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: convertInlineChildren(cell.children ?? []),
            }),
          ],
          shading:
            rowIdx === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "F0F0F0" } : undefined,
        }),
    )
    return new TableRow({ children: tableCells, tableHeader: rowIdx === 0 })
  })
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
    },
  })
}

interface InlineStyle {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
  link?: string
}

function convertInlineChildren(nodes: MdNode[], style: InlineStyle = {}): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const node of nodes) {
    for (const r of convertInlineNode(node, style)) out.push(r)
  }
  return out
}

function convertInlineNode(node: MdNode, style: InlineStyle): ParagraphChild[] {
  switch (node.type) {
    case "text":
      return [makeTextRun(node.value ?? "", style)]
    case "strong":
      return convertInlineChildren(node.children ?? [], { ...style, bold: true })
    case "emphasis":
      return convertInlineChildren(node.children ?? [], { ...style, italics: true })
    case "delete":
      return convertInlineChildren(node.children ?? [], { ...style, strike: true })
    case "inlineCode":
      return [makeTextRun(node.value ?? "", { ...style, code: true })]
    case "break":
      return [new TextRun({ text: "", break: 1 })]
    case "link": {
      return convertInlineChildren(node.children ?? [], { ...style, link: node.url })
    }
    case "image":
      return [makeTextRun(`[image: ${node.url ?? ""}]`, { ...style, italics: true })]
    case "inlineMath":
      return [makeTextRun(node.value ?? "", { ...style, italics: true })]
    case "math":
      return [makeTextRun(node.value ?? "", { ...style, italics: true })]
    default:
      if (node.children && node.children.length > 0) {
        return convertInlineChildren(node.children, style)
      }
      if (typeof node.value === "string") return [makeTextRun(node.value, style)]
      return []
  }
}

function makeTextRun(text: string, style: InlineStyle): TextRun {
  if (style.link) {
    return new TextRun({
      text,
      bold: style.bold,
      italics: style.italics,
      strike: style.strike,
      style: "Hyperlink",
      color: "0066CC",
      underline: {},
      font: style.code ? "Consolas" : undefined,
    })
  }
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    font: style.code ? "Consolas" : undefined,
    shading: style.code ? { type: ShadingType.CLEAR, color: "auto", fill: "F6F8FA" } : undefined,
  })
}
