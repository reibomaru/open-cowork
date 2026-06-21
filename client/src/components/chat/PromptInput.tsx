import clsx from "clsx"
import { ArrowUp, FileText, Loader2, Mic, Paperclip, Plus, Sparkles, Square, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type SpeechRecognitionErrorKind,
  useSpeechRecognition,
} from "../../hooks/use-speech-recognition"
import { type TKey, useT } from "../../i18n"
import { api } from "../../lib/api"
import { useSkillStore } from "../../store/skill-store"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"
import {
  type MentionItem,
  MentionPopup,
  detectMentionTrigger,
  filterMentionItems,
  flattenFileTree,
} from "./MentionPopup"
import { SlashCommandMenu, type SlashSkillItem } from "./SlashCommandMenu"

export type SendOutcome =
  | { ok: true }
  | {
      ok: false
      failedFiles: File[]
      /** 表示するエラー本文。省略時は failedFiles から組み立てる */
      message?: string
      /** ユーザに戻したい本文 (送信時にクリアした text を retype 回避のため再投入) */
      restoreContent?: string
    }

interface PromptInputProps {
  onSend: (content: string, files: File[]) => Promise<SendOutcome>
  disabled?: boolean
  disabledReason?: string
  isStreaming?: boolean
  onStop?: () => void
  /** true 中はファイル選択ダイアログを開かせず、添付済みチップにスピナーを出す */
  isUploading?: boolean
}

// 拡張子ホワイトリスト (サーバ側 file-store.ts の ALLOWED_EXTENSIONS と揃える)。
const ACCEPT_EXT = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".sql",
  ".sh",
  ".toml",
  ".ini",
  ".env",
  ".pdf",
  ".docx",
  ".xlsx",
  ".xlsm",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
].join(",")

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FILE_MB = Math.floor(MAX_FILE_BYTES / 1024 / 1024)
const MAX_FILES = 10

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function isImageFile(f: File): boolean {
  return f.type.startsWith("image/")
}

// MIME → 拡張子マップ。サーバ側 file-store.ts と揃える。
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
}

function hasExtension(name: string): boolean {
  const dot = name.lastIndexOf(".")
  return dot > 0 && dot < name.length - 1
}

// クリップボードから貼り付けた画像はファイル名が image.png 等で名前衝突しやすい上、
// 拡張子が無いことすらある。常に「label-<timestamp>.<ext>」で発行する。
function withGeneratedName(file: File, label: string): File {
  const ext = MIME_TO_EXT[file.type] ?? "png"
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  return new File([file], `${label}-${ts}.${ext}`, { type: file.type })
}

// 通常の File も拡張子が落ちていれば MIME から補完する。
function ensureExtension(file: File): File {
  if (hasExtension(file.name)) return file
  const ext = MIME_TO_EXT[file.type]
  if (!ext) return file
  const base = file.name && file.name.trim().length > 0 ? file.name : "file"
  return new File([file], `${base}.${ext}`, { type: file.type })
}

function voiceErrorMessageKey(error: SpeechRecognitionErrorKind): TKey {
  switch (error) {
    case "not-allowed":
      return "chat.voice.errorPermission"
    case "no-speech":
      return "chat.voice.errorNoSpeech"
    case "audio-capture":
      return "chat.voice.errorAudioCapture"
    case "network":
      return "chat.voice.errorNetwork"
    default:
      return "chat.voice.errorUnknown"
  }
}

// 入力先頭が `/<name-prefix>` の slash command か判定し、name 部分 (空でも可) を返す。
// 改行・空白が入った時点で slash command 判定を抜ける。
function parseSlashPrefix(text: string): string | null {
  // 末尾の自由テキストは無関係なので「先頭から ASCII の slash + 名前文字のみ」を許容。
  // 名前文字: a-z, 0-9, '-'。 大文字や `_` は skill 命名規約に無いのでマッチさせない。
  const m = text.match(/^\/([a-z0-9-]*)$/)
  return m ? m[1] : null
}

const SLASH_MENU_MAX_ITEMS = 20

export function PromptInput({
  onSend,
  disabled,
  disabledReason,
  isStreaming,
  onStop,
  isUploading,
}: PromptInputProps) {
  const theme = useUIStore((s) => s.theme)
  const t = useT()
  const [value, setValue] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // slash command menu の制御。null = 閉じている / string = filter query。
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const personalSkills = useSkillStore((s) => s.personal)
  const commonSkills = useSkillStore((s) => s.common)
  const refetchSkillsIfStale = useSkillStore((s) => s.refetchIfStale)
  const pendingInputText = useUIStore((s) => s.pendingInputText)
  const setPendingInputText = useUIStore((s) => s.setPendingInputText)

  // 初回マウントで一覧を取りに行く。SkillsPanel が開かれていない動線でも slash 補完を
  // すぐ機能させるため。throttle (3s) があるので SkillsPanel 側の fetch と重複しない。
  useEffect(() => {
    void refetchSkillsIfStale()
  }, [refetchSkillsIfStale])

  // 外部 (WelcomeScreen のスキル一覧など) から入力欄を埋めたいときの取り込み。
  // store に値が入ったらこちらで吸収し、即 null に戻して使い切る。
  useEffect(() => {
    if (pendingInputText == null) return
    setValue(pendingInputText)
    setPendingInputText(null)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const pos = el.value.length
      el.setSelectionRange(pos, pos)
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
  }, [pendingInputText, setPendingInputText])
  // 添付された File に対する Object URL のキャッシュ。File 参照 → URL の Map。
  // setFiles の度に新規 File に URL を発行し、unmount / 削除時に revoke する。
  const [previewUrls, setPreviewUrls] = useState<Map<File, string>>(new Map())
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const attachMenuRef = useRef<HTMLDivElement>(null)

  // --- @ メンション (ファイルサジェスト) ---
  // mentionAllItems: workdir 全ファイル/ディレクトリの flat list (lazy fetch + SSE 完了で再 fetch)
  // mentionTrigger:  検出中の `@` トリガ。null なら popup 非表示
  // mentionSelected: 現在のキーボード選択 index
  const [mentionAllItems, setMentionAllItems] = useState<MentionItem[]>([])
  const [mentionFetched, setMentionFetched] = useState(false)
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionTrigger, setMentionTrigger] = useState<{
    triggerStart: number
    query: string
  } | null>(null)
  const [mentionSelected, setMentionSelected] = useState(0)
  // Esc で閉じた `@` のトリガスナップショット。同じ位置 + 同じ query のままなら popup を再開しない。
  // 位置だけでなく query も比較することで、テキスト書き換えで偶然同じ位置に新しい `@` が来た
  // ケース (例: 全選択 → `@xyz` で置換) でも正しく popup を開く。
  const [mentionDismissedAt, setMentionDismissedAt] = useState<{
    triggerStart: number
    query: string
  } | null>(null)
  const filesRefreshTick = useUIStore((s) => s.filesRefreshTick)

  const loadMentionItems = useCallback(async () => {
    setMentionLoading(true)
    try {
      // flattenFileTree 側で runtime validation するので as cast は不要。
      const tree = await api.getFiles()
      setMentionAllItems(flattenFileTree(tree))
      setMentionFetched(true)
    } catch (err) {
      // fetch 失敗は popup を空表示で耐える (toast は出さない)
      console.error("mention: failed to fetch files", err)
    } finally {
      setMentionLoading(false)
    }
  }, [])

  // SSE 完了で workdir が変化したら再 fetch (FileTree と同じ signal)
  // 初回 fetch はユーザが `@` を入れたタイミングまで遅延させる。
  // filesRefreshTick の変化のみが再 fetch の trigger なので、mentionFetched は
  // dep に乗せない (乗せると初回 fetch 直後に二重実行される)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: filesRefreshTick is a refetch signal
  useEffect(() => {
    if (!mentionFetched) return
    void loadMentionItems()
  }, [filesRefreshTick, loadMentionItems])

  const filteredMentions = useMemo(() => {
    if (!mentionTrigger) return []
    return filterMentionItems(mentionAllItems, mentionTrigger.query)
  }, [mentionAllItems, mentionTrigger])

  const closeMention = useCallback((dismissed?: { triggerStart: number; query: string }) => {
    setMentionTrigger(null)
    setMentionSelected(0)
    if (dismissed !== undefined) setMentionDismissedAt(dismissed)
  }, [])

  const insertMention = useCallback(
    (item: MentionItem) => {
      const el = textareaRef.current
      if (!el || !mentionTrigger) return
      const before = value.slice(0, mentionTrigger.triggerStart)
      const after = value.slice(el.selectionEnd)
      const insertion = `${item.path} `
      const next = `${before}${insertion}${after}`
      setValue(next)
      closeMention()
      requestAnimationFrame(() => {
        const t2 = textareaRef.current
        if (!t2) return
        const caret = before.length + insertion.length
        t2.focus()
        t2.setSelectionRange(caret, caret)
        t2.style.height = "auto"
        t2.style.height = `${Math.min(t2.scrollHeight, 200)}px`
      })
    },
    [value, mentionTrigger, closeMention],
  )

  const updateMentionTrigger = useCallback(
    (text: string, caret: number) => {
      const next = detectMentionTrigger(text, caret)
      if (!next) {
        if (mentionTrigger) closeMention()
        if (mentionDismissedAt !== null) setMentionDismissedAt(null)
        return
      }
      // Esc で閉じた同じ `@` (位置 + query 一致) なら再オープンしない。
      // query が変わったら新しいトリガ扱いとして dismissal を解除する。
      if (
        mentionDismissedAt !== null &&
        mentionDismissedAt.triggerStart === next.triggerStart &&
        mentionDismissedAt.query === next.query
      ) {
        return
      }
      if (mentionDismissedAt !== null) setMentionDismissedAt(null)
      // query が変わったときだけ trigger を更新 + 選択位置をリセット。
      // ↑↓ 操作などで query が変わらない keyup でも呼ばれるため、参照を温存しないと
      // filteredMentions の useMemo が毎回無効化されてキー入力ごとに線形スキャンが走る。
      const queryChanged =
        !mentionTrigger ||
        mentionTrigger.triggerStart !== next.triggerStart ||
        mentionTrigger.query !== next.query
      if (queryChanged) {
        setMentionTrigger(next)
        setMentionSelected(0)
      }
      if (!mentionFetched && !mentionLoading) {
        void loadMentionItems()
      }
    },
    [
      closeMention,
      loadMentionItems,
      mentionDismissedAt,
      mentionFetched,
      mentionLoading,
      mentionTrigger,
    ],
  )

  // メニュー外クリック / Esc で閉じる
  useEffect(() => {
    if (!isAttachMenuOpen) return
    const handlePointer = (e: MouseEvent) => {
      if (!attachMenuRef.current) return
      if (!attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachMenuOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsAttachMenuOpen(false)
    }
    document.addEventListener("mousedown", handlePointer)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handlePointer)
      document.removeEventListener("keydown", handleKey)
    }
  }, [isAttachMenuOpen])

  const appendTranscript = useCallback((chunk: string) => {
    setValue((prev) => {
      const sep = prev.length === 0 || /\s$/.test(prev) ? "" : " "
      return prev + sep + chunk
    })
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
  }, [])

  const {
    isSupported: voiceSupported,
    isListening,
    interimTranscript,
    error: voiceError,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition({ onFinalResult: appendTranscript })

  // files が更新されたら、image だけ Object URL を作る／不要分は revoke する。
  useEffect(() => {
    setPreviewUrls((prev) => {
      const next = new Map<File, string>()
      for (const f of files) {
        if (!isImageFile(f)) continue
        const existing = prev.get(f)
        if (existing) {
          next.set(f, existing)
        } else {
          next.set(f, URL.createObjectURL(f))
        }
      }
      for (const [f, url] of prev) {
        if (!next.has(f)) URL.revokeObjectURL(url)
      }
      return next
    })
  }, [files])

  useEffect(() => {
    return () => {
      setPreviewUrls((urls) => {
        for (const url of urls.values()) URL.revokeObjectURL(url)
        return new Map()
      })
    }
  }, [])

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return
      const next: File[] = [...files]
      let localError: string | null = null
      for (const raw of incoming) {
        // 拡張子なしで来た場合は MIME から補完 (paste / 一部 D&D 対策)
        const f = ensureExtension(raw)
        if (next.length >= MAX_FILES) {
          localError = t("upload.tooManyFiles", { max: MAX_FILES })
          break
        }
        if (f.size > MAX_FILE_BYTES) {
          localError = t("upload.tooLarge", { name: f.name, maxMb: MAX_FILE_MB })
          continue
        }
        // 同名 + 同サイズは重複扱いでスキップ (paste の連発対策)
        if (next.some((x) => x.name === f.name && x.size === f.size)) continue
        next.push(f)
      }
      setFiles(next)
      setError(localError)
    },
    [files, t],
  )

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const openFileDialog = useCallback(() => {
    if (disabled || isStreaming || isUploading) return
    fileInputRef.current?.click()
  }, [disabled, isStreaming, isUploading])

  const handleSelectFileFromMenu = useCallback(() => {
    setIsAttachMenuOpen(false)
    openFileDialog()
  }, [openFileDialog])

  // 「+」メニューからスキル挿入を選んだ動線。入力欄を `/` 1 文字にして slash menu を
  // 開き、既存の SlashCommandMenu に検索 / 選択を任せる (専用 UI を増やさず流用)。
  const handleSelectSkillFromMenu = useCallback(() => {
    setIsAttachMenuOpen(false)
    setValue("/")
    setSlashQuery("")
    setSlashActiveIndex(0)
    void refetchSkillsIfStale()
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(1, 1)
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
  }, [refetchSkillsIfStale])

  const toggleAttachMenu = useCallback(() => {
    if (disabled || isStreaming || isUploading) return
    setIsAttachMenuOpen((v) => !v)
  }, [disabled, isStreaming, isUploading])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (list) addFiles(Array.from(list))
      e.target.value = ""
    },
    [addFiles],
  )

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || disabled || isUploading) return
    if (isListening) stopVoice()
    const sentFiles = files
    setValue("")
    setFiles([])
    setError(null)
    setSlashQuery(null)
    setSlashActiveIndex(0)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
    try {
      const outcome = await onSend(trimmed, sentFiles)
      if (outcome && !outcome.ok) {
        if (outcome.failedFiles.length > 0) {
          setFiles((prev) => {
            const existing = new Set(prev.map((p) => `${p.name}-${p.size}`))
            const restored = outcome.failedFiles.filter((f) => !existing.has(`${f.name}-${f.size}`))
            return [...prev, ...restored]
          })
        }
        // 中断時は textarea も元に戻す (ユーザが直後に追加入力していなければ)
        if (outcome.restoreContent) {
          const restoreContent = outcome.restoreContent
          setValue((current) => (current.trim().length === 0 ? restoreContent : current))
          requestAnimationFrame(() => {
            const el = textareaRef.current
            if (!el) return
            el.style.height = "auto"
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`
          })
        }
        setError(
          outcome.message ??
            outcome.failedFiles.map((f) => t("upload.uploadFailed", { name: f.name })).join("\n"),
        )
      }
    } catch (err) {
      console.error("onSend failed", err)
    }
  }, [value, files, disabled, isUploading, onSend, t, isListening, stopVoice])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // mention popup が開いているときは ↑↓/Enter/Tab/Esc を popup 側で吸収する。
    // IME 変換中は (Enter / Tab 含め) 何もせず、ブラウザの確定処理に任せる。
    if (mentionTrigger && !e.nativeEvent.isComposing) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionSelected((i) =>
          filteredMentions.length === 0 ? 0 : (i + 1) % filteredMentions.length,
        )
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionSelected((i) =>
          filteredMentions.length === 0
            ? 0
            : (i - 1 + filteredMentions.length) % filteredMentions.length,
        )
        return
      }
      if ((e.key === "Enter" || e.key === "Tab") && filteredMentions.length > 0) {
        e.preventDefault()
        const target = filteredMentions[mentionSelected] ?? filteredMentions[0]
        insertMention(target)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        closeMention({
          triggerStart: mentionTrigger.triggerStart,
          query: mentionTrigger.query,
        })
        return
      }
    }
    // slash menu が開いているときは矢印 / Enter / Tab / Esc を menu に奪う。
    if (slashQuery !== null && !e.nativeEvent.isComposing) {
      if (e.key === "Escape") {
        e.preventDefault()
        setSlashQuery(null)
        return
      }
      if (slashItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSlashActiveIndex((i) => (i + 1) % slashItems.length)
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setSlashActiveIndex((i) => (i - 1 + slashItems.length) % slashItems.length)
          return
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault()
          const target = slashItems[Math.min(slashActiveIndex, slashItems.length - 1)]
          if (target) insertSlashSkill(target)
          return
        }
      } else if (e.key === "Enter") {
        // 候補が無いときは Enter で送信させたいので menu を閉じてから既定処理へ。
        setSlashQuery(null)
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    setValue(next)
    const q = parseSlashPrefix(next)
    if (q !== null) {
      setSlashQuery(q)
      setSlashActiveIndex(0)
      // 開いた瞬間に最新の skill 一覧を取りに行く (3 秒 throttle)。
      void refetchSkillsIfStale()
    } else if (slashQuery !== null) {
      setSlashQuery(null)
    }
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    updateMentionTrigger(next, el.selectionStart ?? next.length)
  }

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    updateMentionTrigger(el.value, el.selectionStart ?? el.value.length)
  }

  const handleBlur = () => {
    // mousedown で確定するので blur では即閉じてよい
    if (mentionTrigger) closeMention()
  }

  // slash menu の候補。最大件数 (SLASH_MENU_MAX_ITEMS) を超える分は捨てる。
  // 子コンポーネント側の表示と必ず一致させる必要があるので、ここでだけ計算して渡す。
  const slashItems: SlashSkillItem[] = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.toLowerCase()
    const matches = (n: string) => (q.length === 0 ? true : n.toLowerCase().includes(q))
    const personalItems: SlashSkillItem[] = personalSkills
      .filter((p) => matches(p.name))
      .map((p) => ({ name: p.name, description: p.description, source: "personal" }))
    const commonItems: SlashSkillItem[] = commonSkills
      .filter((c) => matches(c.name))
      .map((c) => ({ name: c.name, description: c.description, source: "common" }))
    return [...personalItems, ...commonItems].slice(0, SLASH_MENU_MAX_ITEMS)
  }, [slashQuery, personalSkills, commonSkills])

  const insertSlashSkill = useCallback((item: SlashSkillItem) => {
    setValue(`/${item.name} `)
    setSlashQuery(null)
    setSlashActiveIndex(0)
    // textarea にフォーカスを戻し、末尾にカーソルを移動。
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const pos = el.value.length
      el.setSelectionRange(pos, pos)
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    })
  }, [])

  // Cmd+V / Ctrl+V でクリップボードの画像を添付。テキストはブラウザのデフォルトに任せる。
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled || isStreaming || isUploading) return
      const items = e.clipboardData?.items
      if (!items) return
      const pastedFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue
        const f = item.getAsFile()
        if (!f) continue
        if (!isImageFile(f)) continue
        pastedFiles.push(withGeneratedName(f, t("upload.pastedImage")))
      }
      if (pastedFiles.length > 0) {
        e.preventDefault()
        addFiles(pastedFiles)
      }
    },
    [addFiles, disabled, isStreaming, isUploading, t],
  )

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (disabled || isStreaming || isUploading) return
    if (e.dataTransfer.types.includes("Files")) {
      dragCounter.current += 1
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    if (disabled || isStreaming || isUploading) return
    const dropped = Array.from(e.dataTransfer.files ?? [])
    addFiles(dropped)
  }

  const toggleVoice = () => {
    if (isListening) stopVoice()
    else startVoice()
  }

  const attachDisabled = !!(disabled || isStreaming || isUploading)
  const sendDisabled = !value.trim() || !!disabled || !!isUploading

  const placeholder = isListening
    ? t("chat.voice.listening")
    : isDragging
      ? t("upload.dropHere")
      : disabled && disabledReason
        ? disabledReason
        : t("chat.promptPlaceholder")

  return (
    <div
      className="px-6 pb-6 pt-3"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto relative">
        {error && (
          <div className="mb-2 text-xs text-neutral-400 px-1" role="alert">
            {error}
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {files.map((f, i) => {
              const previewUrl = previewUrls.get(f)
              const isImage = isImageFile(f)
              return (
                <div
                  key={`${f.name}-${f.size}-${i}`}
                  className={clsx(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs",
                    theme === "light"
                      ? "bg-white border-app text-primary"
                      : "bg-white/[0.06] border-app text-primary",
                  )}
                >
                  {isImage && previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={f.name}
                      className="w-8 h-8 object-cover rounded shrink-0"
                    />
                  ) : isUploading ? (
                    <Loader2 size={12} className="animate-spin shrink-0 text-secondary" />
                  ) : (
                    <FileText size={12} className="shrink-0 text-secondary" />
                  )}
                  <span className="truncate max-w-[180px]" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-secondary shrink-0">{formatBytes(f.size)}</span>
                  {!isUploading && (
                    <button
                      type="button"
                      aria-label={t("upload.remove", { name: f.name })}
                      onClick={() => removeFile(i)}
                      className="text-secondary hover:text-primary"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {mentionTrigger && (
          <div className="absolute left-0 right-0 bottom-full mb-2 flex justify-start pl-4 pointer-events-auto">
            <MentionPopup
              items={filteredMentions}
              selectedIndex={mentionSelected}
              onSelect={insertMention}
              onHover={setMentionSelected}
              loading={mentionLoading}
            />
          </div>
        )}
        {slashQuery !== null && (
          <SlashCommandMenu
            items={slashItems}
            activeIndex={Math.min(slashActiveIndex, Math.max(0, slashItems.length - 1))}
            onChangeActiveIndex={setSlashActiveIndex}
            onSelect={insertSlashSkill}
            onClose={() => setSlashQuery(null)}
          />
        )}
        <div
          className={clsx(
            "flex items-center gap-2 bg-input rounded-xl border px-4 py-3 transition-colors",
            isDragging ? "border-ink ring-2 ring-ink/30" : "border-app",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_EXT}
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="relative shrink-0" ref={attachMenuRef}>
            <button
              type="button"
              aria-label={isAttachMenuOpen ? t("upload.menuClose") : t("upload.menuOpen")}
              aria-haspopup="menu"
              aria-expanded={isAttachMenuOpen}
              title={isDragging ? t("upload.dropHere") : t("upload.attachTitle")}
              onClick={toggleAttachMenu}
              disabled={attachDisabled}
              className={clsx(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                attachDisabled
                  ? "text-secondary/50 cursor-not-allowed"
                  : isAttachMenuOpen
                    ? "bg-white/[0.10] text-primary"
                    : "text-secondary hover:text-primary hover:bg-white/[0.06]",
              )}
            >
              <Plus size={18} />
            </button>
            {isAttachMenuOpen && (
              <div
                role="menu"
                aria-label={t("upload.menuOpen")}
                className={clsx(
                  "absolute bottom-full left-0 mb-2 min-w-[260px] py-1 rounded-xl border shadow-lg z-10",
                  theme === "light"
                    ? "bg-white border-app text-primary"
                    : "bg-[#1d1d1d] border-app text-primary",
                )}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSelectFileFromMenu}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2 text-sm text-left",
                    theme === "light" ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.06]",
                  )}
                >
                  <Paperclip size={16} className="shrink-0 text-secondary" />
                  <span>{t("upload.menuFileOrPhoto")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSelectSkillFromMenu}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2 text-sm text-left",
                    theme === "light" ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.06]",
                  )}
                >
                  <Sparkles size={16} className="shrink-0 text-secondary" />
                  <span>{t("upload.menuInsertSkill")}</span>
                </button>
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={handleSelect}
            onClick={handleSelect}
            onBlur={handleBlur}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent text-primary text-sm resize-none outline-none placeholder:text-secondary max-h-[200px]"
            disabled={disabled}
          />
          {voiceSupported && !isStreaming && (
            <Tooltip label={isListening ? t("chat.voice.stop") : t("chat.voice.start")}>
              <button
                type="button"
                onClick={toggleVoice}
                disabled={disabled}
                aria-pressed={isListening}
                aria-label={isListening ? t("chat.voice.stop") : t("chat.voice.start")}
                className={clsx(
                  "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  isListening
                    ? "bg-neutral-500/20 hover:bg-neutral-500/30 text-neutral-400 animate-pulse"
                    : "bg-white/5 hover:bg-white/10 text-secondary",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <Mic size={16} />
              </button>
            </Tooltip>
          )}
          {isStreaming ? (
            <Tooltip label={t("chat.stop")}>
              <button
                type="button"
                onClick={onStop}
                aria-label={t("chat.stop")}
                className="shrink-0 w-8 h-8 rounded-lg bg-neutral-500/20 hover:bg-neutral-500/30 flex items-center justify-center text-neutral-400 transition-colors"
              >
                <Square size={14} />
              </button>
            </Tooltip>
          ) : (
            <Tooltip label={t("chat.send")}>
              <button
                type="button"
                onClick={handleSend}
                disabled={sendDisabled}
                aria-label={t("chat.send")}
                className={clsx(
                  "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  !sendDisabled
                    ? theme === "light"
                      ? "bg-ink hover:bg-ink-soft text-white"
                      : "bg-clay hover:bg-clay-deep text-black"
                    : "bg-white/5 text-secondary cursor-not-allowed",
                )}
              >
                {isUploading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}
              </button>
            </Tooltip>
          )}
        </div>
        {isListening && interimTranscript && (
          // 未確定 (interim) テキストは確定済み (textarea 内の通常色) と区別するため、
          // 入力欄とは別の行に淡色＋イタリックで live プレビューする。
          <div className="mt-2 px-1 text-xs text-secondary italic" aria-live="polite">
            {interimTranscript}
          </div>
        )}
        <div className="text-center mt-2 text-xs text-secondary">
          {voiceError ? (
            <span className="text-neutral-400">{t(voiceErrorMessageKey(voiceError))}</span>
          ) : (
            t("chat.promptHint")
          )}
        </div>
      </div>
    </div>
  )
}
