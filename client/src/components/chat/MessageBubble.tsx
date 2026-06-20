import clsx from "clsx"
import { AlertCircle, FileText, Loader2, Sparkles } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useT } from "../../i18n"
import { api } from "../../lib/api"
import { useMessageStore } from "../../store/message-store"
import { useUIStore } from "../../store/ui-store"
import type { Message, MessageAttachment, MessageContentPart } from "../../types/message"
import type { Plan } from "../../types/plan"
import { PlanDisplay } from "../plan/PlanDisplay"
import { SubAgentPanel } from "../subagent/SubAgentPanel"
import { ToolCallBlock } from "../tool-calls/ToolCallBlock"
import { Tooltip } from "../ui/Tooltip"
import { HtmlBlockRenderer } from "./HtmlBlockRenderer"
import { SkillReferenceChip } from "./SkillReferenceChip"
import { StreamingText } from "./StreamingText"

interface MessageBubbleProps {
  message: Message
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function UserAttachment({
  sessionId,
  attachment,
  isLight,
}: {
  sessionId: string
  attachment: MessageAttachment
  isLight: boolean
}) {
  const isImage = attachment.mimeType.startsWith("image/")
  const failed = attachment.status === "failed"
  const uploading = attachment.status === "uploading"

  // 画像で previewUrl 未設定 (= rehydrate 経路) のときは fileId で取得して blob URL を作る。
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(attachment.previewUrl)
  useEffect(() => {
    if (!isImage) return
    // 既に URL があれば何もしない (ライブ送信時は Object URL が初期から入っている)
    if (resolvedUrl) return
    if (!attachment.fileId) return
    let cancelled = false
    let createdUrl: string | null = null
    api
      .fetchFileBlobUrl(sessionId, attachment.fileId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        createdUrl = url
        setResolvedUrl(url)
      })
      .catch((err) => {
        console.error("attachment fetch failed", { fileId: attachment.fileId, err })
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [isImage, resolvedUrl, attachment.fileId, sessionId])

  if (isImage && resolvedUrl) {
    return (
      <div
        className={clsx(
          "relative rounded-lg overflow-hidden border",
          isLight ? "border-app bg-white" : "border-app bg-white/[0.04]",
          failed && "opacity-60",
        )}
      >
        <img
          src={resolvedUrl}
          alt={attachment.name}
          className="block max-w-[240px] max-h-[180px] object-cover"
        />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <AlertCircle size={20} className="text-neutral-400" />
          </div>
        )}
      </div>
    )
  }

  // 画像なのにまだ blob 取得中 → loading プレースホルダ
  if (isImage && attachment.fileId && !resolvedUrl && !failed) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center rounded-lg border w-[160px] h-[120px]",
          isLight ? "border-app bg-white/40" : "border-app bg-white/[0.04]",
        )}
      >
        <Loader2 size={20} className="animate-spin text-secondary" />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
        isLight ? "bg-white border-app text-primary" : "bg-white/[0.06] border-app text-primary",
        failed && "opacity-60",
      )}
    >
      {uploading ? (
        <Loader2 size={14} className="animate-spin shrink-0 text-secondary" />
      ) : failed ? (
        <AlertCircle size={14} className="shrink-0 text-neutral-400" />
      ) : (
        <FileText size={14} className="shrink-0 text-secondary" />
      )}
      <span className="truncate max-w-[200px]" title={attachment.name}>
        {attachment.name}
      </span>
      <span className="text-secondary shrink-0">{formatBytes(attachment.size)}</span>
    </div>
  )
}

// Bubble に収めるパーツ群と、フル幅で外出しする html_block を分けるためのグルーピング
type BubbleGroup = { kind: "bubble"; parts: MessageContentPart[] }
type HtmlGroup = { kind: "html"; htmlBlockId: string }
type RenderGroup = BubbleGroup | HtmlGroup

function groupContentParts(parts: MessageContentPart[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  let buf: MessageContentPart[] = []
  for (const part of parts) {
    if (part.type === "html_block") {
      if (buf.length > 0) {
        groups.push({ kind: "bubble", parts: buf })
        buf = []
      }
      groups.push({ kind: "html", htmlBlockId: part.htmlBlockId })
    } else {
      buf.push(part)
    }
  }
  if (buf.length > 0) groups.push({ kind: "bubble", parts: buf })
  return groups
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const t = useT()
  const isUser = message.role === "user"
  const theme = useUIStore((s) => s.theme)
  const isLight = theme === "light"
  const updatePlanStatus = useMessageStore((s) => s.updatePlanStatus)

  const handlePlanStatusChange = useCallback(
    (status: Plan["status"]) => {
      if (message.plan) {
        updatePlanStatus(message.sessionId, message.id, message.plan.id, status)
      }
    },
    [message.sessionId, message.id, message.plan, updatePlanStatus],
  )

  if (isUser) {
    const attachments = message.attachments ?? []
    return (
      <div className="w-full px-4">
        {attachments.length > 0 && (
          <div className="flex py-2 justify-end">
            <div className="max-w-[80%] flex flex-wrap gap-2 justify-end">
              {attachments.map((a, i) => (
                <UserAttachment
                  key={`${a.fileId ?? a.name}-${a.size}-${i}`}
                  sessionId={message.sessionId}
                  attachment={a}
                  isLight={isLight}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex py-2 justify-end">
          <div
            className={clsx(
              "max-w-[80%] rounded-2xl px-4 py-3",
              isLight ? "bg-ink text-white" : "bg-clay text-black",
            )}
          >
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
          </div>
        </div>
      </div>
    )
  }

  const groups = groupContentParts(message.contentParts)

  const hasTrailingExtras =
    (message.isStreaming && message.contentParts.length === 0) ||
    !!message.plan ||
    (message.subAgents?.length ?? 0) > 0

  // plan / subagents / 空ストリーミング時のカーソルは最後の bubble に寄せたい。
  // 最後が html もしくは groups が空なら、末尾に空の bubble を追加してそこに付ける。
  let trailingBubbleIndex: number | null = null
  if (hasTrailingExtras) {
    const last = groups[groups.length - 1]
    if (last && last.kind === "bubble") {
      trailingBubbleIndex = groups.length - 1
    } else {
      groups.push({ kind: "bubble", parts: [] })
      trailingBubbleIndex = groups.length - 1
    }
  }

  const bubbleClasses = clsx(
    "max-w-[80%] rounded-2xl px-4 py-3",
    isLight ? "bg-black/[0.05] text-primary" : "bg-white/[0.08] text-primary",
  )

  // カーソルは contentParts の最末尾がテキストパートのときだけ出す。
  // text → html_block → ... のように後ろに別パートが続く場合、
  // 直前の text にカーソルを残すとそっちが書き換わっているように誤認させるため抑止する。
  const lastPart = message.contentParts[message.contentParts.length - 1]
  const trailingTextPart = lastPart?.type === "text" ? lastPart : null

  // モデルバッジは実際の返答テキストを持つメッセージにのみ出す。tool 実行だけの
  // (skillReferences / tool_call のみで text を持たない) メッセージには付けない。
  const hasTextReply = message.contentParts.some(
    (p) => p.type === "text" && p.text.trim().length > 0,
  )

  return (
    <>
      {message.skillReferences.length > 0 && (
        <div className="w-full px-4 pt-2">
          <div className="flex flex-col items-start gap-1">
            {message.skillReferences.map((ref) => (
              <SkillReferenceChip key={ref.id} reference={ref} />
            ))}
          </div>
        </div>
      )}
      {groups.map((group, gi) => {
        const key = `${message.id}-g${gi}`
        if (group.kind === "html") {
          const block = message.htmlBlocks.find((b) => b.id === group.htmlBlockId)
          if (!block) return null
          // html_block は max-w 制約を外して画面いっぱいまで広げる
          return (
            <div key={key} className="w-full px-4 py-2">
              <HtmlBlockRenderer block={block} />
            </div>
          )
        }
        const isTrailing = trailingBubbleIndex === gi
        return (
          <div key={key} className="w-full px-4">
            <div className="flex py-2 justify-start">
              <div className={bubbleClasses}>
                <div className="text-sm space-y-3">
                  {group.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <StreamingText
                          // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no unique id
                          key={i}
                          content={part.text}
                          isStreaming={message.isStreaming && part === trailingTextPart}
                        />
                      )
                    }
                    if (part.type === "tool_call") {
                      const tc = message.toolCalls.find((t) => t.id === part.toolCallId)
                      return tc ? <ToolCallBlock key={part.toolCallId} toolCall={tc} /> : null
                    }
                    // skill_reference は bubble の外側 (上部) で纏めて描画するため
                    // ここでは描画しない。message.skillReferences を直接読む。
                    return null
                  })}

                  {isTrailing && message.isStreaming && message.contentParts.length === 0 && (
                    <StreamingText content="" isStreaming={true} />
                  )}
                  {isTrailing && message.plan && (
                    <PlanDisplay plan={message.plan} onStatusChange={handlePlanStatusChange} />
                  )}
                  {isTrailing && message.subAgents && message.subAgents.length > 0 && (
                    <SubAgentPanel agents={message.subAgents} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {message.model && !message.isStreaming && hasTextReply && (
        <div className="w-full px-4 pb-2">
          <Tooltip label={t("chat.modelBadge.tooltip")}>
            <span className="inline-flex items-center gap-1 text-xs text-secondary whitespace-nowrap">
              <Sparkles size={12} />
              <span>{message.model.label}</span>
            </span>
          </Tooltip>
        </div>
      )}
    </>
  )
}
