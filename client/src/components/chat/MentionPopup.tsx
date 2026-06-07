import clsx from "clsx"
import { File as FileIcon, Folder, Loader2 } from "lucide-react"
import { useEffect, useRef } from "react"
import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"

export interface MentionItem {
  name: string
  path: string
  type: "file" | "dir"
  // 検索用に lowercase 済みのキャッシュを保持し、キー入力ごとの toLowerCase() を避ける。
  nameLower: string
  pathLower: string
}

interface MentionPopupProps {
  items: MentionItem[]
  selectedIndex: number
  onSelect: (item: MentionItem) => void
  onHover: (index: number) => void
  loading?: boolean
  /** popup の root に被せるクラス。位置 (absolute / bottom-full 等) は親で制御する */
  className?: string
}

/**
 * `@` で起動するファイルサジェストパネル。
 * - 表示専用。キー操作 (↑↓ / Enter / Esc / IME) は親 (PromptInput) で捌く。
 * - 選択行は `selectedIndex` で制御し、表示領域からはみ出したら scrollIntoView する。
 */
export function MentionPopup({
  items,
  selectedIndex,
  onSelect,
  onHover,
  loading,
  className,
}: MentionPopupProps) {
  const theme = useUIStore((s) => s.theme)
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const el = itemRefs.current[selectedIndex]
    if (!el) return
    el.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  return (
    <div
      role="listbox"
      aria-label={t("mention.ariaLabel")}
      tabIndex={-1}
      className={clsx(
        "w-[320px] max-h-[280px] overflow-y-auto rounded-xl border shadow-xl z-20",
        theme === "light"
          ? "bg-white border-app text-primary"
          : "bg-[#1d1d1d] border-app text-primary",
        className,
      )}
      ref={listRef}
    >
      {loading && items.length === 0 ? (
        <div className="px-3 py-3 text-xs text-secondary flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" />
          <span>{t("mention.loading")}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="px-3 py-3 text-xs text-secondary">{t("mention.empty")}</div>
      ) : (
        <div className="py-1">
          {items.map((it, i) => {
            const active = i === selectedIndex
            return (
              <button
                key={`${it.type}:${it.path}`}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  // textarea が blur しないように mousedown で確定する
                  e.preventDefault()
                  onSelect(it)
                }}
                onMouseEnter={() => onHover(i)}
                className={clsx(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left",
                  active
                    ? theme === "light"
                      ? "bg-black/[0.06]"
                      : "bg-white/[0.10]"
                    : theme === "light"
                      ? "hover:bg-black/[0.04]"
                      : "hover:bg-white/[0.06]",
                )}
              >
                {it.type === "dir" ? (
                  <Folder size={14} className="text-neutral-400 shrink-0" />
                ) : (
                  <FileIcon size={14} className="text-secondary shrink-0" />
                )}
                <span className="truncate text-primary">{it.name}</span>
                <span className="ml-auto truncate text-[10px] text-secondary max-w-[180px]">
                  {it.path}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="px-3 py-1.5 text-[10px] text-secondary border-t border-app">
        {t("mention.hint")}
      </div>
    </div>
  )
}

/**
 * カーソル位置で `@` トリガが立っているかを判定する。
 * - 行頭、または直前が空白 (改行含む) のときだけ有効。
 * - `@` 以降にスペース / 改行が入ったら閉じる扱い (この関数自体が null を返す)。
 *
 * @returns 起動中であれば {triggerStart: '@' の位置, query: '@' 以降の文字列}、それ以外は null
 */
export function detectMentionTrigger(
  text: string,
  caret: number,
): { triggerStart: number; query: string } | null {
  // 後ろから `@` を探す
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === "@") {
      // `@` の直前は文頭 or 空白でなければトリガ無効
      const prev = i === 0 ? "" : text[i - 1]
      if (i !== 0 && !/\s/.test(prev)) return null
      const query = text.slice(i + 1, caret)
      // query にスペースが入っていたら閉じる
      if (/\s/.test(query)) return null
      return { triggerStart: i, query }
    }
    if (/\s/.test(ch)) {
      // `@` に出会う前に空白を跨いだら無効
      return null
    }
  }
  return null
}

/**
 * 検索文字列でフィルタしてランキングする。
 * - 1: name 先頭一致 (lowercase)
 * - 2: name 部分一致
 * - 3: path 部分一致
 * 同ランクは path 昇順。`items` は flattenFileTree 時点で path 昇順に並んでおり、
 * lowercase もキャッシュ済みのため、ホットパスでは sort と toLowerCase() を行わない。
 */
export function filterMentionItems(items: MentionItem[], query: string): MentionItem[] {
  if (!query) {
    // items は flattenFileTree で既に path 昇順なので copy/sort 不要。
    return items.slice(0, 50)
  }
  const q = query.toLowerCase()
  const rank1: MentionItem[] = []
  const rank2: MentionItem[] = []
  const rank3: MentionItem[] = []
  for (const it of items) {
    if (it.nameLower.startsWith(q)) rank1.push(it)
    else if (it.nameLower.includes(q)) rank2.push(it)
    else if (it.pathLower.includes(q)) rank3.push(it)
  }
  // items が path 昇順なので、各 rank の中も path 昇順を保つ。
  const merged = [...rank1, ...rank2, ...rank3]
  return merged.slice(0, 50)
}

/**
 * server の tree レスポンスを flat な MentionItem[] に展開する。
 * dir 自身も挿入対象として含む。
 *
 * 入力は Hono クライアントから `unknown` 相当で渡される想定なので、各要素を
 * ランタイムで検証して不正なノードは無視する。サーバスキーマが変わっても
 * popup が静かに壊れず空配列で耐えるための防御。
 *
 * 戻り値は path 昇順でソート済み (filterMentionItems が毎キーで sort せず済むように)。
 */
export interface FileTreeNodeLike {
  name: string
  path: string
  type: "file" | "dir"
  children?: FileTreeNodeLike[]
}

function isFileTreeNode(value: unknown): value is FileTreeNodeLike {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.name !== "string" || typeof v.path !== "string") return false
  if (v.type !== "file" && v.type !== "dir") return false
  if (v.children !== undefined && !Array.isArray(v.children)) return false
  return true
}

export function flattenFileTree(input: unknown): MentionItem[] {
  // server 形式は { skills: FileNode[], workspace: FileNode[] }。
  // 念のため旧 array 形式 (FileNode[]) も受け付けて、その場合は workspace 扱いで展開する。
  let nodes: unknown[]
  if (Array.isArray(input)) {
    nodes = input
  } else if (input && typeof input === "object") {
    const v = input as { skills?: unknown; workspace?: unknown }
    nodes = [
      ...(Array.isArray(v.skills) ? v.skills : []),
      ...(Array.isArray(v.workspace) ? v.workspace : []),
    ]
  } else {
    return []
  }

  const acc: MentionItem[] = []
  const visit = (list: unknown[]) => {
    for (const n of list) {
      if (!isFileTreeNode(n)) continue
      acc.push({
        name: n.name,
        path: n.path,
        type: n.type,
        nameLower: n.name.toLowerCase(),
        pathLower: n.path.toLowerCase(),
      })
      if (n.type === "dir" && Array.isArray(n.children) && n.children.length > 0) {
        visit(n.children)
      }
    }
  }
  visit(nodes)
  acc.sort((a, b) => a.path.localeCompare(b.path))
  return acc
}
