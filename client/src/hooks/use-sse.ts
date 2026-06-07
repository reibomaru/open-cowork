import { useCallback, useEffect, useRef } from "react"
import { api } from "../lib/api"
import { SSEClient, type SSEEventType } from "../lib/sse-client"
import { useMessageStore } from "../store/message-store"
import { useSessionStore } from "../store/session-store"
import { useUIStore } from "../store/ui-store"

export function useSSE(sessionId: string | null) {
  const clientRef = useRef<SSEClient | null>(null)
  const messageIdRef = useRef<string | null>(null)
  const store = useMessageStore

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect()
    clientRef.current = null
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: store is a stable module-level ref
  const connect = useCallback(
    (assistantMessageId: string) => {
      if (!sessionId) return
      disconnect()
      messageIdRef.current = assistantMessageId

      // biome-ignore lint/suspicious/noExplicitAny: SSE data shape varies by event type
      const handler = (eventType: SSEEventType, data: any) => {
        const sid = sessionId
        // biome-ignore lint/style/noNonNullAssertion: messageIdRef is set before connect
        const mid = messageIdRef.current!

        switch (eventType) {
          case "text_delta":
            store.getState().appendTextChunk(sid, mid, data.chunk)
            break

          case "tool_call_start":
            store.getState().addToolCall(sid, mid, {
              id: data.id,
              type: data.type,
              status: "running",
              input: data.input || {},
            })
            break

          case "tool_call_output":
            store.getState().updateToolCallOutput(sid, mid, data.id, data.output)
            break

          case "bash_output":
            store.getState().updateToolCallOutput(sid, mid, data.id, data.chunk)
            break

          case "diff":
            store.getState().updateToolCallDiff(sid, mid, data.id, {
              filePath: data.filePath,
              hunks: data.hunks,
            })
            break

          case "tool_call_end":
            store.getState().completeToolCall(sid, mid, data.id, data.duration)
            break

          case "plan":
            store.getState().setPlan(sid, mid, {
              id: data.id,
              title: data.title,
              steps: data.steps,
              status: data.status,
            })
            break

          case "plan_step_update":
            // Update individual plan step
            break

          case "skill_invoked":
            // chip はすべて assistant message の前に表示する。slash / tool / mcp
            // どの source も `mid` (現在 streaming 中の assistant message id) に attach。
            // detail は Read なら file_path、Bash なら command などの 1 行説明。
            store.getState().addSkillReference(sid, mid, {
              id: data.id,
              name: data.name,
              source: data.source,
              ...(typeof data.detail === "string" ? { detail: data.detail } : {}),
            })
            break

          case "subagent_start":
            store.getState().addSubAgent(sid, mid, {
              id: data.id,
              name: data.name,
              type: data.type || "general-purpose",
              prompt: data.prompt,
              status: "running",
              startedAt: Date.now(),
            })
            break

          case "html_block_start":
            store.getState().addHtmlBlock(sid, mid, {
              id: data.id,
              html: "",
              title: data.title,
              status: "streaming",
            })
            break

          case "html_block_delta":
            store.getState().appendHtmlBlockChunk(sid, mid, data.id, data.chunk)
            break

          case "html_block_end":
            store.getState().completeHtmlBlock(sid, mid, data.id, data.url)
            break

          case "subagent_update":
            store.getState().updateSubAgent(sid, mid, data.id, {
              status: data.status,
              output: data.output,
              completedAt: data.status !== "running" ? Date.now() : undefined,
            })
            break

          case "usage":
            // 1 ターン分のトークン/コストのデルタ。done より前に届くので即座に累計へ加算する。
            useSessionStore.getState().addUsage(sid, {
              inputTokens: data.inputTokens ?? 0,
              outputTokens: data.outputTokens ?? 0,
              cacheReadInputTokens: data.cacheReadInputTokens ?? 0,
              cacheCreationInputTokens: data.cacheCreationInputTokens ?? 0,
              costUSD: data.costUSD ?? 0,
            })
            break

          case "done":
            store.getState().completeStreaming(sid, mid)
            useUIStore.getState().requestFilesRefresh()
            useUIStore.getState().requestSkillsRefresh()
            // サーバが Haiku 要約を走らせた（= サイドバーのタイトルが更新されている可能性がある）
            // ターンに限ってセッション一覧を refetch する。毎ターン refetch すると長い会話で
            // getSessions の Query が無駄に走り続けるため、`titleUpdated` フラグで明示的にガードする。
            if (data?.titleUpdated === true) {
              // fetchSessions は LSI 経由で usage を含まないため、直前に addUsage で
              // 反映したライブ累計が上書きで消える。単体取得で usage を復元する。
              // 順序が重要: fetchSessions の上書きが先、refreshSessionUsage の復元が後。
              void useSessionStore
                .getState()
                .fetchSessions()
                .then(() => useSessionStore.getState().refreshSessionUsage(sid))
            }
            disconnect()
            break

          case "error":
            store.getState().completeStreaming(sid, mid)
            useUIStore.getState().requestFilesRefresh()
            useUIStore.getState().requestSkillsRefresh()
            disconnect()
            break
        }
      }

      const client = new SSEClient(api.getStreamUrl(sessionId), handler)
      client.connect()
      clientRef.current = client
    },
    [sessionId, disconnect],
  )

  useEffect(() => {
    return () => disconnect()
  }, [disconnect])

  return { connect, disconnect }
}
