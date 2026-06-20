import { v4 as uuid } from "uuid"
import { create } from "zustand"
import type {
  HtmlBlock,
  Message,
  MessageAttachment,
  MessageContentPart,
  SkillReference,
} from "../types/message"
import type { Plan } from "../types/plan"
import type { SubAgent } from "../types/task"
import type { DiffData, ToolCall } from "../types/tool-call"

interface MessageStore {
  messagesBySession: Record<string, Message[]>
  streamingMessageId: string | null

  getMessages: (sessionId: string) => Message[]
  /**
   * サーバから fetch した履歴で 1 セッション分を上書きする。
   * 既にストリーミング中などで store 側に新しい結果がある場合は呼ばないこと。
   */
  setMessages: (sessionId: string, messages: Message[]) => void
  addUserMessage: (sessionId: string, content: string, attachments?: MessageAttachment[]) => Message
  updateMessageAttachments: (
    sessionId: string,
    messageId: string,
    updater: (current: MessageAttachment[]) => MessageAttachment[],
  ) => void
  /** メッセージを取り消す (アップロード失敗時のロールバック等で使用)。 */
  removeMessage: (sessionId: string, messageId: string) => void
  startAssistantMessage: (sessionId: string, model?: Message["model"]) => Message
  appendTextChunk: (sessionId: string, messageId: string, chunk: string) => void
  addToolCall: (sessionId: string, messageId: string, toolCall: ToolCall) => void
  updateToolCallOutput: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    output: string,
  ) => void
  updateToolCallDiff: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    diff: DiffData,
  ) => void
  completeToolCall: (
    sessionId: string,
    messageId: string,
    toolCallId: string,
    duration: number,
  ) => void
  failToolCall: (sessionId: string, messageId: string, toolCallId: string) => void
  setPlan: (sessionId: string, messageId: string, plan: Plan) => void
  updatePlanStatus: (
    sessionId: string,
    messageId: string,
    planId: string,
    status: Plan["status"],
  ) => void
  addHtmlBlock: (sessionId: string, messageId: string, htmlBlock: HtmlBlock) => void
  appendHtmlBlockChunk: (
    sessionId: string,
    messageId: string,
    htmlBlockId: string,
    chunk: string,
  ) => void
  completeHtmlBlock: (
    sessionId: string,
    messageId: string,
    htmlBlockId: string,
    url?: string,
  ) => void
  addSubAgent: (sessionId: string, messageId: string, agent: SubAgent) => void
  updateSubAgent: (
    sessionId: string,
    messageId: string,
    agentId: string,
    update: Partial<SubAgent>,
  ) => void
  addSkillReference: (sessionId: string, messageId: string, ref: SkillReference) => void
  completeStreaming: (sessionId: string, messageId: string) => void
}

function updateMessage(
  state: MessageStore,
  sessionId: string,
  messageId: string,
  updater: (msg: Message) => Message,
): Partial<MessageStore> {
  const msgs = state.messagesBySession[sessionId] || []
  return {
    messagesBySession: {
      ...state.messagesBySession,
      [sessionId]: msgs.map((m) => (m.id === messageId ? updater(m) : m)),
    },
  }
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messagesBySession: {},
  streamingMessageId: null,

  getMessages: (sessionId) => get().messagesBySession[sessionId] || [],

  setMessages: (sessionId, messages) =>
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: messages },
    })),

  addUserMessage: (sessionId, content, attachments) => {
    const msg: Message = {
      id: uuid(),
      sessionId,
      role: "user",
      content,
      contentParts: [{ type: "text", text: content }],
      toolCalls: [],
      htmlBlocks: [],
      skillReferences: [],
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
      isStreaming: false,
    }
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] || []), msg],
      },
    }))
    return msg
  },

  updateMessageAttachments: (sessionId, messageId, updater) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        attachments: updater(m.attachments ?? []),
      })),
    ),

  removeMessage: (sessionId, messageId) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] || []
      return {
        messagesBySession: {
          ...s.messagesBySession,
          [sessionId]: msgs.filter((m) => m.id !== messageId),
        },
        // ストリーミング中のメッセージを取り消した場合は streamingMessageId もクリア
        streamingMessageId: s.streamingMessageId === messageId ? null : s.streamingMessageId,
      }
    }),

  startAssistantMessage: (sessionId, model) => {
    const msg: Message = {
      id: uuid(),
      sessionId,
      role: "assistant",
      content: "",
      contentParts: [],
      toolCalls: [],
      htmlBlocks: [],
      skillReferences: [],
      ...(model ? { model } : {}),
      timestamp: Date.now(),
      isStreaming: true,
    }
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] || []), msg],
      },
      streamingMessageId: msg.id,
    }))
    return msg
  },

  appendTextChunk: (sessionId, messageId, chunk) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] || []
      return {
        messagesBySession: {
          ...s.messagesBySession,
          [sessionId]: msgs.map((m) => {
            if (m.id !== messageId) return m
            const lastPart = m.contentParts[m.contentParts.length - 1]
            let newParts: MessageContentPart[]
            if (lastPart && lastPart.type === "text") {
              newParts = [
                ...m.contentParts.slice(0, -1),
                { type: "text", text: lastPart.text + chunk },
              ]
            } else {
              newParts = [...m.contentParts, { type: "text", text: chunk }]
            }
            return { ...m, content: m.content + chunk, contentParts: newParts }
          }),
        },
      }
    }),

  addHtmlBlock: (sessionId, messageId, htmlBlock) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        htmlBlocks: [...m.htmlBlocks, htmlBlock],
        contentParts: [...m.contentParts, { type: "html_block", htmlBlockId: htmlBlock.id }],
      })),
    ),

  appendHtmlBlockChunk: (sessionId, messageId, htmlBlockId, chunk) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        htmlBlocks: m.htmlBlocks.map((b) =>
          b.id === htmlBlockId ? { ...b, html: b.html + chunk } : b,
        ),
      })),
    ),

  completeHtmlBlock: (sessionId, messageId, htmlBlockId, url) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        htmlBlocks: m.htmlBlocks.map((b) =>
          b.id === htmlBlockId ? { ...b, status: "complete" as const, url } : b,
        ),
      })),
    ),

  addToolCall: (sessionId, messageId, toolCall) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        toolCalls: [...m.toolCalls, toolCall],
        contentParts: [...m.contentParts, { type: "tool_call", toolCallId: toolCall.id }],
      })),
    ),

  updateToolCallOutput: (sessionId, messageId, toolCallId, output) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.id === toolCallId ? { ...tc, output: (tc.output || "") + output } : tc,
        ),
      })),
    ),

  updateToolCallDiff: (sessionId, messageId, toolCallId, diff) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) => (tc.id === toolCallId ? { ...tc, diff } : tc)),
      })),
    ),

  completeToolCall: (sessionId, messageId, toolCallId, duration) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.id === toolCallId ? { ...tc, status: "completed", duration } : tc,
        ),
      })),
    ),

  failToolCall: (sessionId, messageId, toolCallId) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) =>
          tc.id === toolCallId ? { ...tc, status: "failed" } : tc,
        ),
      })),
    ),

  setPlan: (sessionId, messageId, plan) =>
    set((s) => updateMessage(s, sessionId, messageId, (m) => ({ ...m, plan }))),

  updatePlanStatus: (sessionId, messageId, planId, status) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        plan: m.plan && m.plan.id === planId ? { ...m.plan, status } : m.plan,
      })),
    ),

  addSubAgent: (sessionId, messageId, agent) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        subAgents: [...(m.subAgents || []), agent],
      })),
    ),

  updateSubAgent: (sessionId, messageId, agentId, update) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => ({
        ...m,
        subAgents: (m.subAgents || []).map((a) => (a.id === agentId ? { ...a, ...update } : a)),
      })),
    ),

  addSkillReference: (sessionId, messageId, ref) =>
    set((s) =>
      updateMessage(s, sessionId, messageId, (m) => {
        // tool_use id ベースで重複排除する。同じ id が複数経路 (stream_event /
        // assistant message) から来た場合は 1 chip に集約する。
        //   - 先行発火 (stream_event) では detail がまだ無いことが多い
        //   - 後発 (assistant message) で detail 付きが届いたら upgrade する
        if (ref.id) {
          const existing = m.skillReferences.find((r) => r.id === ref.id)
          if (existing) {
            if (!existing.detail && ref.detail) {
              return {
                ...m,
                skillReferences: m.skillReferences.map((r) =>
                  r.id === ref.id ? { ...r, detail: ref.detail } : r,
                ),
              }
            }
            return m
          }
        }
        // skill chip は bubble の外側で纏めて描画するので contentParts には積まない。
        return {
          ...m,
          skillReferences: [...m.skillReferences, ref],
        }
      }),
    ),

  completeStreaming: (sessionId, messageId) =>
    set((s) => ({
      ...updateMessage(s, sessionId, messageId, (m) => ({ ...m, isStreaming: false })),
      streamingMessageId: null,
    })),
}))
