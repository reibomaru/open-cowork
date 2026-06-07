import type { ModelId } from "@server/models"
import { create } from "zustand"
import { api } from "../lib/api"
import type { Session, SessionUsage } from "../types/session"

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  pendingMessage: string | null
  /** WelcomeScreen で添付されたまま新規セッションへ持ち越されるファイル */
  pendingAttachedFiles: File[]
  fetchSessions: () => Promise<void>
  addSession: (session: Session) => void
  setActiveSession: (id: string | null) => void
  setPendingMessage: (message: string | null) => void
  setPendingAttachedFiles: (files: File[]) => void
  archiveSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  updateSessionModel: (id: string, model: ModelId) => Promise<void>
  /** ライブ SSE の usage デルタ (1 ターン分) を該当セッションの累計へ加算する。 */
  addUsage: (sessionId: string, delta: SessionUsage) => void
  /** GET /api/sessions/:id の権威ある累計でセッションの usage を置換する。 */
  refreshSessionUsage: (sessionId: string) => Promise<void>
}

function addUsageValues(prev: SessionUsage | undefined, delta: SessionUsage): SessionUsage {
  return {
    inputTokens: (prev?.inputTokens ?? 0) + delta.inputTokens,
    outputTokens: (prev?.outputTokens ?? 0) + delta.outputTokens,
    cacheReadInputTokens: (prev?.cacheReadInputTokens ?? 0) + delta.cacheReadInputTokens,
    cacheCreationInputTokens:
      (prev?.cacheCreationInputTokens ?? 0) + delta.cacheCreationInputTokens,
    costUSD: (prev?.costUSD ?? 0) + delta.costUSD,
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  pendingMessage: null,
  pendingAttachedFiles: [],

  fetchSessions: async () => {
    // 起動直後はサーバ側準備不足で 502/503 が一瞬返ることがある。
    // 指数バックオフでリトライ (最大 ~10 秒)。
    const delays = [0, 500, 1000, 2000, 3000, 4000]
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]))
      try {
        const sessions = await api.getSessions()
        set({ sessions })
        return
      } catch (err) {
        if (i === delays.length - 1) throw err
      }
    }
  },

  addSession: (session) =>
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  setPendingMessage: (message) => set({ pendingMessage: message }),

  setPendingAttachedFiles: (files) => set({ pendingAttachedFiles: files }),

  archiveSession: (id) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, status: "archived" as const } : sess,
      ),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),

  deleteSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),

  renameSession: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title, updatedAt: Date.now() } : sess,
      ),
    })),

  // 楽観更新→失敗時は前の値に戻す。送信中のメッセージは次の query から新モデルで動く
  // (resume 時も SDK options に model が渡るため反映される)。
  updateSessionModel: async (id, model) => {
    const previous = (() => {
      let prev: string | undefined
      set((s) => {
        prev = s.sessions.find((sess) => sess.id === id)?.model
        return {
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, model, updatedAt: Date.now() } : sess,
          ),
        }
      })
      return prev
    })()
    try {
      await api.updateSession(id, { model })
    } catch (e) {
      if (previous !== undefined) {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, model: previous as string } : sess,
          ),
        }))
      }
      throw e
    }
  },

  addUsage: (sessionId, delta) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, usage: addUsageValues(sess.usage, delta) } : sess,
      ),
    })),

  refreshSessionUsage: async (sessionId) => {
    // セッション一覧は LSI 経由で usage を含まないため、権威ある累計を単体取得で補完する。
    // 失敗してもライブ SSE 由来の表示は残るので握りつぶす。
    try {
      const session = await api.getSession(sessionId)
      const usage = session.usage
      // 一覧に存在しないセッション (古い activeSessionId 等) は無視する。
      if (!get().sessions.some((sess) => sess.id === sessionId)) return
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, usage } : sess)),
      }))
    } catch {
      // no-op
    }
  },
}))
