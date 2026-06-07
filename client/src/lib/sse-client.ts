import { fetchEventSource } from "@microsoft/fetch-event-source"
import { useAuthStore } from "../store/auth-store"

export type SSEEventType =
  | "text_delta"
  | "tool_call_start"
  | "tool_call_output"
  | "tool_call_end"
  | "diff"
  | "bash_output"
  | "html_block_start"
  | "html_block_delta"
  | "html_block_end"
  | "plan"
  | "plan_step_update"
  | "subagent_start"
  | "subagent_update"
  | "skill_invoked"
  | "usage"
  | "done"
  | "error"

const KNOWN_EVENT_TYPES = new Set<SSEEventType>([
  "text_delta",
  "tool_call_start",
  "tool_call_output",
  "tool_call_end",
  "diff",
  "bash_output",
  "html_block_start",
  "html_block_delta",
  "html_block_end",
  "plan",
  "plan_step_update",
  "subagent_start",
  "subagent_update",
  "skill_invoked",
  "usage",
  "done",
  "error",
])

export type SSEHandler = (eventType: SSEEventType, data: unknown) => void

export class SSEClient {
  private controller: AbortController | null = null
  private handler: SSEHandler
  private url: string

  constructor(url: string, handler: SSEHandler) {
    this.url = url
    this.handler = handler
  }

  connect() {
    this.disconnect()
    this.controller = new AbortController()
    void this.startStream(this.controller)
  }

  private async startStream(controller: AbortController) {
    const { userId } = useAuthStore.getState()
    const headers: Record<string, string> = {}
    // server 側の authMiddleware が X-User-Id を userId として採用する。
    if (userId) {
      headers["X-User-Id"] = userId
    }
    try {
      await fetchEventSource(this.url, {
        headers,
        signal: controller.signal,
        openWhenHidden: true,
        onmessage: (ev) => {
          if (!KNOWN_EVENT_TYPES.has(ev.event as SSEEventType)) return
          const eventType = ev.event as SSEEventType
          try {
            const data = JSON.parse(ev.data)
            this.handler(eventType, data)
          } catch {
            this.handler(eventType, ev.data)
          }
        },
        onerror: (err) => {
          throw err
        },
      })
    } catch {
      // 切断 or エラー時は何もしない（呼び出し側が disconnect 済み）
    } finally {
      if (this.controller === controller) {
        this.controller = null
      }
    }
  }

  disconnect() {
    this.controller?.abort()
    this.controller = null
  }

  get isConnected() {
    return this.controller !== null && !this.controller.signal.aborted
  }
}
