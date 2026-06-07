import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { v4 as uuid } from "uuid"
import { useSSE } from "../../hooks/use-sse"
import { api } from "../../lib/api"
import { useMessageStore } from "../../store/message-store"
import { useSessionStore } from "../../store/session-store"
import { useUIStore } from "../../store/ui-store"
import type { HtmlBlock, Message, MessageAttachment, MessageContentPart } from "../../types/message"
import { ChatHeader } from "./ChatHeader"
import { MessageList } from "./MessageList"
import { PromptInput, type SendOutcome } from "./PromptInput"

const EMPTY_MESSAGES: never[] = []

/**
 * 履歴復元時にテキスト中の ```html ... ``` フェンスを html_block に分解する。
 * 開きフェンスは `\`\`\`html` (lowercase, no spaces)、閉じフェンスは `\n\`\`\`` で
 * server 側 HtmlFenceParser (claude-agent.ts) と同じ規約。
 * 永続化済み artifact の URL は transcript には残らないので未設定にし、
 * HtmlBlockRenderer は srcDoc 経路で inline html をそのまま描画する。
 */
function splitHtmlBlocks(content: string): {
  contentParts: MessageContentPart[]
  htmlBlocks: HtmlBlock[]
} {
  const contentParts: MessageContentPart[] = []
  const htmlBlocks: HtmlBlock[] = []
  let rest = content

  while (rest.length > 0) {
    const openIdx = rest.indexOf("```html")
    if (openIdx === -1) {
      if (rest) contentParts.push({ type: "text", text: rest })
      break
    }
    const before = rest.slice(0, openIdx)
    if (before) contentParts.push({ type: "text", text: before })

    let afterOpen = rest.slice(openIdx + 7)
    if (afterOpen.startsWith("\n")) afterOpen = afterOpen.slice(1)

    const closeIdx = afterOpen.indexOf("\n```")
    if (closeIdx === -1) {
      // 閉じフェンスが無いケース: 残り全体をテキスト扱いにフォールバック
      contentParts.push({ type: "text", text: rest.slice(openIdx) })
      break
    }
    const html = afterOpen.slice(0, closeIdx)
    const id = uuid()
    htmlBlocks.push({ id, html, status: "complete" })
    contentParts.push({ type: "html_block", htmlBlockId: id })

    rest = afterOpen.slice(closeIdx + 4)
    if (rest.startsWith("\n")) rest = rest.slice(1)
  }

  return { contentParts, htmlBlocks }
}

interface StoredAttachmentInfo {
  id: string
  name: string
  size: number
  mimeType: string
  isImage: boolean
}

interface StoredSkillReferenceInfo {
  id: string
  name: string
  source: "tool" | "slash" | "mcp" | "builtin"
}

/** サーバ返却の StoredMessage を SPA の Message 形に膨らませる。
 *  履歴復元時は tool_call / plan / subAgents は省略 (transcript からの再現は
 *  会話本文のみが目的)。assistant メッセージは ```html フェンスを html_block に分解する。
 *  user メッセージは server 側でプロンプトプレフィックスが除去され、attachments を
 *  含んだ形で渡ってくるので、それを MessageAttachment に詰め直す。
 *  skill 参照 (slash command / Skill tool use) は server で抽出済みで、
 *  ライブ送信時と同じ位置に chip として描画する。 */
function hydrateMessage(m: {
  id: string
  sessionId: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  attachments?: StoredAttachmentInfo[]
  skillReferences?: StoredSkillReferenceInfo[]
}): Message {
  const { contentParts, htmlBlocks } =
    m.role === "assistant"
      ? splitHtmlBlocks(m.content)
      : {
          contentParts: [{ type: "text", text: m.content }] as MessageContentPart[],
          htmlBlocks: [],
        }
  const attachments: MessageAttachment[] | undefined =
    m.role === "user" && m.attachments && m.attachments.length > 0
      ? m.attachments.map((a) => ({
          name: a.name,
          size: a.size,
          mimeType: a.mimeType,
          status: "uploaded" as const,
          fileId: a.id,
        }))
      : undefined

  // skill chip は contentParts に積まずに skillReferences 単独で持つ。
  // bubble の外側 (上部) で SkillReferenceChip を纏めて描画する。
  const skillReferences = m.skillReferences ?? []

  // assistant message は SDK transcript で tool_use ごとに別レコードを残すため、
  // content="" + skillReferences のみのケースが頻発する。空 text part を fallback で
  // 入れると空の chat bubble が並んで描画されるので、assistant の場合は空のまま許す。
  // user は必ず text を持つ前提 (slash command でも /foo の文字列が来る)。
  const finalParts: MessageContentPart[] =
    contentParts.length > 0
      ? contentParts
      : m.role === "user"
        ? [{ type: "text", text: m.content }]
        : []

  return {
    id: m.id,
    sessionId: m.sessionId,
    role: m.role,
    content: m.content,
    contentParts: finalParts,
    toolCalls: [],
    htmlBlocks,
    skillReferences,
    attachments,
    timestamp: m.timestamp,
    isStreaming: false,
  }
}

/**
 * ファイル群を順次アップロードして fileId 配列と失敗ファイルを返す。
 * 失敗した File 参照はそのまま呼び出し側に返してリトライ動線に使えるようにする。
 */
async function uploadAttachments(
  sessionId: string,
  files: File[],
  onProgress?: (file: File, result: "uploaded" | "failed") => void,
): Promise<{ ids: string[]; failedFiles: File[] }> {
  const ids: string[] = []
  const failedFiles: File[] = []
  for (const f of files) {
    try {
      const info = await api.uploadFile(sessionId, f)
      ids.push(info.id)
      onProgress?.(f, "uploaded")
    } catch (err) {
      console.error("file upload failed", { name: f.name, err })
      failedFiles.push(f)
      onProgress?.(f, "failed")
    }
  }
  return { ids, failedFiles }
}

/**
 * 送信した File から Message に載せる attachment 表示用データを作る。
 * 画像は Object URL を発行してサムネイル表示する (メッセージ生存期間中 leak。
 * SPA 寿命と一致するので revoke しないほうが履歴遷移時に再生成する手間が無い)。
 */
function buildPendingAttachments(files: File[]): MessageAttachment[] {
  return files.map((f) => ({
    name: f.name,
    size: f.size,
    mimeType: f.type,
    previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    status: "uploading" as const,
  }))
}

export function ChatArea() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const addSession = useSessionStore((s) => s.addSession)
  const pendingMessage = useSessionStore((s) => s.pendingMessage)
  const setPendingMessage = useSessionStore((s) => s.setPendingMessage)
  const pendingAttachedFiles = useSessionStore((s) => s.pendingAttachedFiles)
  const setPendingAttachedFiles = useSessionStore((s) => s.setPendingAttachedFiles)
  const messagesMap = useMessageStore((s) => s.messagesBySession)
  const selectedModelId = useUIStore((s) => s.selectedModelId)
  const [isUploading, setIsUploading] = useState(false)

  // URL のセッションIDと store を同期
  useEffect(() => {
    if (sessionId && sessionId !== activeSessionId) {
      setActiveSession(sessionId)
    }
  }, [sessionId, activeSessionId, setActiveSession])

  const currentSessionId = sessionId || null
  const messages = useMemo(
    () => (currentSessionId ? messagesMap[currentSessionId] || EMPTY_MESSAGES : EMPTY_MESSAGES),
    [currentSessionId, messagesMap],
  )
  const streamingMessageId = useMessageStore((s) => s.streamingMessageId)
  const {
    addUserMessage,
    startAssistantMessage,
    setMessages,
    updateMessageAttachments,
    removeMessage,
  } = useMessageStore()
  const { connect, disconnect } = useSSE(currentSessionId)

  // セッション切替時にサーバ transcript から履歴を復元する。
  // ストリーミング中・既に store にメッセージがある場合は上書きしない
  // (進行中の SSE が消えるのを避けるため)。messagesMap / streamingMessageId を
  // 購読すると依存に入って再 fetch が暴発するので getState() で読む。
  useEffect(() => {
    if (!currentSessionId) return
    const state = useMessageStore.getState()
    if (state.streamingMessageId) return
    const existing = state.messagesBySession[currentSessionId]
    if (existing && existing.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const stored = await api.getMessages(currentSessionId)
        if (cancelled) return
        // fetch 中に pendingMessage 処理 (addUserMessage) や SSE が走って
        // store にメッセージが入っている可能性がある。空配列で上書きすると
        // 送信直後の最初のユーザーメッセージが消えるので再チェックする。
        const latest = useMessageStore.getState()
        if (latest.streamingMessageId) return
        const current = latest.messagesBySession[currentSessionId]
        if (current && current.length > 0) return
        setMessages(currentSessionId, stored.map(hydrateMessage))
      } catch {
        // 取得失敗時は store を空のまま放置 (welcome screen が出る)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentSessionId, setMessages])

  // セッションを開いたら永続化された累計使用量を補完する。セッション一覧は LSI 経由で
  // usage を含まないため、リロード後に累計バッジを正しく出すには単体取得が要る。
  // ライブ SSE (addUsage) とは独立。失敗は store 側で握りつぶす。
  //
  // `sessions` への subscribe が必須: refreshSessionUsage は対象セッションが store に
  // 居ない場合は更新を捨てる仕様。リロード直後は ChatArea が AppShell の fetchSessions
  // より先にマウントされて sessions=[] のまま発火 → 結果が破棄されてバッジが空のまま
  // になる。fetchSessions 完了で sessionInStore が false→true に切り替わったタイミングで
  // 再発火させて確実に取り直す。
  const sessionInStore = useSessionStore((s) =>
    currentSessionId ? s.sessions.some((sess) => sess.id === currentSessionId) : false,
  )
  useEffect(() => {
    if (!currentSessionId || !sessionInStore) return
    void useSessionStore.getState().refreshSessionUsage(currentSessionId)
  }, [currentSessionId, sessionInStore])

  // navigate 後の新しい ChatArea で pending message を処理。失敗ファイルは
  // この経路ではユーザに戻せないので落とす (PromptInput に戻る前にここで握る)。
  useEffect(() => {
    if (!currentSessionId || !pendingMessage) return
    const content = pendingMessage
    const files = pendingAttachedFiles
    setPendingMessage(null)
    setPendingAttachedFiles([])
    ;(async () => {
      const pendingAttachments = files.length > 0 ? buildPendingAttachments(files) : undefined
      const userMsg = addUserMessage(currentSessionId, content, pendingAttachments)
      let attachedFileIds: string[] = []
      let failedFiles: File[] = []
      if (files.length > 0) {
        setIsUploading(true)
        try {
          const result = await uploadAttachments(currentSessionId, files, (f, status) => {
            updateMessageAttachments(currentSessionId, userMsg.id, (current) =>
              current.map((a) =>
                a.name === f.name && a.size === f.size && a.status === "uploading"
                  ? { ...a, status }
                  : a,
              ),
            )
          })
          attachedFileIds = result.ids
          failedFiles = result.failedFiles
        } finally {
          setIsUploading(false)
        }
      }
      // 新規セッション作成からそのまま送信した経路は、ナビゲート後で PromptInput に
      // 戻せないため、失敗時はメッセージを取り消すだけで止める (ファイル・本文は失われる)。
      if (failedFiles.length > 0) {
        removeMessage(currentSessionId, userMsg.id)
        return
      }
      try {
        await api.sendMessage(currentSessionId, content, attachedFileIds)
      } catch {
        // continue with SSE even if REST fails
      }
      const assistantMsg = startAssistantMessage(currentSessionId)
      connect(assistantMsg.id)
    })()
  }, [
    currentSessionId,
    pendingMessage,
    pendingAttachedFiles,
    setPendingMessage,
    setPendingAttachedFiles,
    addUserMessage,
    updateMessageAttachments,
    removeMessage,
    startAssistantMessage,
    connect,
  ])

  const handleSend = useCallback(
    async (content: string, files: File[]): Promise<SendOutcome> => {
      // ルートページの場合: サーバーでセッションを作成して遷移。
      // 失敗ハンドリングは新ページの useEffect 側 (現状失敗は黙って捨てる)。
      if (!currentSessionId) {
        // ユーザーが ChatHeader で選んだモデルを引き継ぐ。未選択ならサーバ既定。
        const session = await api.createSession(selectedModelId ?? undefined)
        addSession(session)
        setPendingMessage(content)
        setPendingAttachedFiles(files)
        navigate(`/chat/${session.id}`)
        return { ok: true }
      }

      const pendingAttachments = files.length > 0 ? buildPendingAttachments(files) : undefined
      const userMsg = addUserMessage(currentSessionId, content, pendingAttachments)

      let attachedFileIds: string[] = []
      let failedFiles: File[] = []
      if (files.length > 0) {
        setIsUploading(true)
        try {
          const result = await uploadAttachments(currentSessionId, files, (f, status) => {
            updateMessageAttachments(currentSessionId, userMsg.id, (current) =>
              current.map((a) =>
                a.name === f.name && a.size === f.size && a.status === "uploading"
                  ? { ...a, status }
                  : a,
              ),
            )
          })
          attachedFileIds = result.ids
          failedFiles = result.failedFiles
        } finally {
          setIsUploading(false)
        }
      }

      // アップロードに 1 つでも失敗があれば、agent へ送らずに会話を中断する。
      // 投入済みの user message も取り消し、本文・ファイルを PromptInput に戻して
      // ユーザがリトライできるようにする。
      if (failedFiles.length > 0) {
        removeMessage(currentSessionId, userMsg.id)
        return { ok: false, failedFiles, restoreContent: content }
      }

      try {
        await api.sendMessage(currentSessionId, content, attachedFileIds)
      } catch {
        // continue with SSE even if REST fails
      }

      const assistantMsg = startAssistantMessage(currentSessionId)
      connect(assistantMsg.id)
      return { ok: true }
    },
    [
      currentSessionId,
      addUserMessage,
      updateMessageAttachments,
      removeMessage,
      startAssistantMessage,
      connect,
      addSession,
      setPendingMessage,
      setPendingAttachedFiles,
      navigate,
      selectedModelId,
    ],
  )

  const handleStop = useCallback(() => {
    if (currentSessionId && streamingMessageId) {
      useMessageStore.getState().completeStreaming(currentSessionId, streamingMessageId)
    }
    disconnect()
  }, [currentSessionId, streamingMessageId, disconnect])

  return (
    <>
      <ChatHeader />

      {!currentSessionId || messages.length === 0 ? (
        <div className="flex-1" />
      ) : (
        <MessageList messages={messages} />
      )}

      <PromptInput
        onSend={handleSend}
        disabled={!!streamingMessageId}
        isStreaming={!!streamingMessageId}
        onStop={handleStop}
        isUploading={isUploading}
      />
    </>
  )
}
