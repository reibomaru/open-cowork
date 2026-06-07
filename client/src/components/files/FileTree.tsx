import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useT } from "../../i18n"
import { UploadApiError, api } from "../../lib/api"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"
import { FilePreviewModal } from "./FilePreviewModal"

// PromptInput と揃える: 1 ファイル 10MB、同時 10 件まで
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILE_MB = Math.floor(MAX_FILE_BYTES / 1024 / 1024)
const MAX_FILES_PER_BATCH = 10

interface FileNode {
  name: string
  /** workdir root からの相対パス。プレビュー fetch とコピー UI で使う。 */
  path: string
  type: "file" | "dir"
  size?: number
  children?: FileNode[]
}

interface FileTreeResponse {
  skills: FileNode[]
  workspace: FileNode[]
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // 旧ブラウザ / 非 secure context のフォールバック
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function CopyPathButton({ path }: { path: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const ok = await copyToClipboard(path)
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    },
    [path],
  )

  return (
    <Tooltip label={copied ? t("fileTree.copied") : t("fileTree.copyPath")}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={copied ? t("fileTree.copied") : t("fileTree.copyPath")}
        className="shrink-0 p-1 rounded text-secondary hover:text-primary hover:bg-white/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </Tooltip>
  )
}

function formatSize(size: number | undefined): string {
  if (size === undefined) return ""
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function FileTreeNode({
  node,
  depth,
  onOpenFile,
}: {
  node: FileNode
  depth: number
  onOpenFile: (node: FileNode) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(depth === 0)

  if (node.type === "dir") {
    return (
      <div>
        <div
          className="group w-full flex items-center gap-1.5 px-2 py-1 text-sm text-primary hover:bg-white/5 rounded"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex-1 flex items-center gap-1.5 text-left min-w-0"
          >
            {open ? (
              <ChevronDown size={14} className="text-secondary shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-secondary shrink-0" />
            )}
            {open ? (
              <FolderOpen size={14} className="text-neutral-400 shrink-0" />
            ) : (
              <Folder size={14} className="text-neutral-400 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          <CopyPathButton path={node.path} />
        </div>
        {open && node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        )}
        {open && (!node.children || node.children.length === 0) && (
          <div
            className="px-2 py-1 text-xs text-secondary italic"
            style={{ paddingLeft: 8 + (depth + 1) * 12 + 14 }}
          >
            {t("fileTree.empty")}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="group w-full flex items-center gap-1.5 px-2 py-1 text-sm text-primary hover:bg-white/5 rounded"
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <button
        type="button"
        onClick={() => onOpenFile(node)}
        className="flex-1 flex items-center gap-1.5 text-left min-w-0"
      >
        <span className="w-[14px] shrink-0" />
        <FileIcon size={14} className="text-secondary shrink-0" />
        <span className="truncate flex-1">{node.name}</span>
        {node.size !== undefined && (
          <span className="text-xs text-secondary shrink-0">{formatSize(node.size)}</span>
        )}
      </button>
      <CopyPathButton path={node.path} />
    </div>
  )
}

/**
 * VS Code 風のセクションヘッダ。クリックで展開/折りたたみ。
 * フォルダ行とは違うスタイル (太字 + 区切り) でルート扱いを明示する。
 * パスコピー / ファイル作成等の操作は持たない (= 親フォルダではなくセクション)。
 */
function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-secondary hover:bg-white/5"
    >
      {open ? (
        <ChevronDown size={12} className="shrink-0" />
      ) : (
        <ChevronRight size={12} className="shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

function SectionContent({
  nodes,
  loading,
  error,
  onOpenFile,
}: {
  nodes: FileNode[]
  loading: boolean
  error: string | null
  onOpenFile: (node: FileNode) => void
}) {
  const t = useT()
  if (error) {
    return <div className="p-3 text-sm text-neutral-400">Failed to load: {error}</div>
  }
  if (loading && nodes.length === 0) {
    return (
      <div className="p-3 text-sm text-secondary flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" />
        loading...
      </div>
    )
  }
  if (nodes.length === 0) {
    return (
      <div className="px-2 py-1 text-xs text-secondary italic" style={{ paddingLeft: 26 }}>
        {t("fileTree.empty")}
      </div>
    )
  }
  return (
    <div>
      {nodes.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} onOpenFile={onOpenFile} />
      ))}
    </div>
  )
}

export function FileTree() {
  const t = useT()
  const [data, setData] = useState<FileTreeResponse>({ skills: [], workspace: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewNode, setPreviewNode] = useState<FileNode | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  // ドラッグ中の dragenter/dragleave が子要素で何度も発火するため
  // カウンタで擬似的に「ドラッグオーバー中」を管理する。
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // SSE 完了時に use-sse から requestFilesRefresh() で tick がインクリメントされる。
  const refreshTick = useUIStore((s) => s.filesRefreshTick)
  const requestFilesRefresh = useUIStore((s) => s.requestFilesRefresh)
  const skillsOpen = useUIStore((s) => s.fileTreeSkillsOpen)
  const workspaceOpen = useUIStore((s) => s.fileTreeWorkspaceOpen)
  const split = useUIStore((s) => s.fileTreeSplit)
  const toggleSkills = useUIStore((s) => s.toggleFileTreeSkills)
  const toggleWorkspace = useUIStore((s) => s.toggleFileTreeWorkspace)
  const setSplit = useUIStore((s) => s.setFileTreeSplit)
  const canUpload = !isUploading

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = (await api.getFiles()) as unknown
      // server は { skills, workspace } を返すが、防御的に shape を検査する。
      if (res && typeof res === "object" && !Array.isArray(res)) {
        const r = res as { skills?: unknown; workspace?: unknown }
        setData({
          skills: Array.isArray(r.skills) ? (r.skills as FileNode[]) : [],
          workspace: Array.isArray(r.workspace) ? (r.workspace as FileNode[]) : [],
        })
      } else if (Array.isArray(res)) {
        // 後方互換: 旧 array 形式は workspace 扱い
        setData({ skills: [], workspace: res as FileNode[] })
      } else {
        setData({ skills: [], workspace: [] })
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // refreshTick は load 内では参照しないが、SSE 完了時の値変化で再 fetch を
  // トリガーするための「signal」依存。
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTick is a refetch signal
  useEffect(() => {
    load()
  }, [load, refreshTick])

  const uploadFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      const errors: string[] = []
      const targets: File[] = []
      for (const f of incoming) {
        if (targets.length >= MAX_FILES_PER_BATCH) {
          errors.push(t("upload.tooManyFiles", { max: MAX_FILES_PER_BATCH }))
          break
        }
        if (f.size > MAX_FILE_BYTES) {
          errors.push(t("upload.tooLarge", { name: f.name, maxMb: MAX_FILE_MB }))
          continue
        }
        targets.push(f)
      }

      if (targets.length === 0) {
        setUploadErrors(errors)
        return
      }

      setIsUploading(true)
      setUploadErrors(errors)
      try {
        // 個別の失敗が他をブロックしないように並列実行。
        const results = await Promise.allSettled(targets.map((file) => api.uploadUserFile(file)))
        const failureMessages: string[] = []
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            const file = targets[i]
            const reason = r.reason
            const detail =
              reason instanceof UploadApiError ? reason.message : String(reason ?? "unknown")
            console.error("file tree upload failed", { name: file.name, reason })
            failureMessages.push(`${t("upload.uploadFailed", { name: file.name })} (${detail})`)
          }
        })
        setUploadErrors([...errors, ...failureMessages])
      } finally {
        setIsUploading(false)
        // 成功・失敗いずれでも一度ツリーを更新する (成功分のみ反映される)。
        requestFilesRefresh()
      }
    },
    [requestFilesRefresh, t],
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (list && list.length > 0) void uploadFiles(Array.from(list))
      e.target.value = ""
    },
    [uploadFiles],
  )

  const openFileDialog = useCallback(() => {
    if (!canUpload) return
    fileInputRef.current?.click()
  }, [canUpload])

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!canUpload) return
      if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return
      e.preventDefault()
      dragCounterRef.current += 1
      setIsDragging(true)
    },
    [canUpload],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canUpload) return
      if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    },
    [canUpload],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDragging(false)
      if (!canUpload) return
      const dropped = Array.from(e.dataTransfer?.files ?? [])
      if (dropped.length > 0) void uploadFiles(dropped)
    },
    [canUpload, uploadFiles],
  )

  // 上下リサイズハンドル: 両方展開時のみ表示。skills/workspace 領域の比率を更新。
  const dragRef = useRef<{ startY: number; startSplit: number; height: number } | null>(null)
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return
      const sectionsHeight = container.querySelector("[data-sections]")?.clientHeight ?? 0
      if (sectionsHeight <= 0) return
      dragRef.current = { startY: e.clientY, startSplit: split, height: sectionsHeight }

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const { startY, startSplit, height } = dragRef.current
        const delta = (ev.clientY - startY) / height
        setSplit(startSplit + delta)
      }
      const onUp = () => {
        dragRef.current = null
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"
    },
    [setSplit, split],
  )

  const uploadTitle = isUploading ? t("fileTree.uploading") : t("fileTree.uploadTitle")

  // 境界線は常に split 比率の位置に固定する。トグルの開閉は中身を出すかだけを制御し、
  // 領域配分 (flex-grow) は変えない。閉じたセクションは空白として残る。
  const skillsStyle: React.CSSProperties = {
    flexGrow: split,
    flexBasis: 0,
    minHeight: 0,
  }
  const workspaceStyle: React.CSSProperties = {
    flexGrow: 1 - split,
    flexBasis: 0,
    minHeight: 0,
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full flex flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-app">
        <span className="text-sm text-secondary">Working directory</span>
        <div className="flex items-center gap-1">
          <Tooltip label={uploadTitle}>
            <button
              type="button"
              onClick={openFileDialog}
              disabled={!canUpload}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              aria-label={t("fileTree.upload")}
            >
              {isUploading ? (
                <Loader2 size={14} className="text-secondary animate-spin" />
              ) : (
                <Upload size={14} className="text-secondary" />
              )}
            </button>
          </Tooltip>
          <Tooltip label={t("fileTree.refresh")}>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label={t("fileTree.refresh")}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={14} className="text-secondary animate-spin" />
              ) : (
                <RefreshCw size={14} className="text-secondary" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      {uploadErrors.length > 0 && (
        <div className="px-3 py-2 text-xs text-neutral-400 border-b border-app space-y-0.5">
          {uploadErrors.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
        </div>
      )}

      <div data-sections className="flex-1 min-h-0 flex flex-col">
        {/* Skills section */}
        <div className="flex flex-col" style={skillsStyle}>
          <SectionHeader
            label={t("fileTree.sectionSkills")}
            open={skillsOpen}
            onToggle={toggleSkills}
          />
          {skillsOpen && (
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              <SectionContent
                nodes={data.skills}
                loading={loading}
                error={error}
                onOpenFile={setPreviewNode}
              />
            </div>
          )}
        </div>

        {/* 境界線 (常時表示)。split 比率を上下リサイズで調整する。 */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("fileTree.resizeSections")}
          tabIndex={0}
          onMouseDown={handleResizeMouseDown}
          className="shrink-0 h-1 cursor-row-resize select-none hover:bg-ink/40 active:bg-ink/60 outline-none border-y border-app"
        />

        {/* Workspace section */}
        <div className="flex flex-col" style={workspaceStyle}>
          <SectionHeader
            label={t("fileTree.sectionWorkspace")}
            open={workspaceOpen}
            onToggle={toggleWorkspace}
          />
          {workspaceOpen && (
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              <SectionContent
                nodes={data.workspace}
                loading={loading}
                error={error}
                onOpenFile={setPreviewNode}
              />
            </div>
          )}
        </div>
      </div>

      {isDragging && canUpload && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-neutral-500/10 border-2 border-dashed border-neutral-400 rounded-md">
          <div className="px-4 py-2 rounded-md bg-surface/90 text-sm text-primary shadow">
            {t("fileTree.dropHere")}
          </div>
        </div>
      )}
      {previewNode && (
        <FilePreviewModal
          path={previewNode.path}
          name={previewNode.name}
          onClose={() => setPreviewNode(null)}
        />
      )}
    </div>
  )
}
