import { create } from "zustand"
import {
  type CommonSkillSummary,
  type PersonalSkillDetail,
  type PersonalSkillSummary,
  SkillApiError,
  api,
} from "../lib/api"

// 編集モーダルの 3 状態 + 閉じている状態 (null)。
//   - "view": 共通スキルの読み取り専用表示
//   - "edit": 個人用スキルの編集
//   - "new":  新規作成
export type SkillEditorMode = "view" | "edit" | "new" | null

interface SkillStoreState {
  personal: PersonalSkillSummary[]
  common: CommonSkillSummary[]
  loading: boolean
  /** 直近のリスト fetch 時刻 (ms)。throttle 用。 */
  lastFetchedAt: number
  error: string | null

  // モーダル状態
  editorMode: SkillEditorMode
  /** 編集 / 表示中の skill name (new 時は null) */
  editorTargetName: string | null
  /** モーダル内に展開した skill 詳細 (body 含む) */
  editorDetail: PersonalSkillDetail | null
  /** 共通 skill 表示時のための description (本文は持たない) */
  editorCommonDescription: string | null
  /** モーダル詳細の読み込み中 */
  editorLoading: boolean

  fetchAll: () => Promise<void>
  refetchIfStale: (maxAgeMs?: number) => Promise<void>
  openNew: () => void
  openEdit: (name: string) => Promise<void>
  openView: (skill: CommonSkillSummary) => void
  closeEditor: () => void
  create: (input: { name: string; description: string; body: string }) => Promise<void>
  update: (name: string, input: { description: string; body: string }) => Promise<void>
  remove: (name: string) => Promise<void>
}

export const useSkillStore = create<SkillStoreState>((set, get) => ({
  personal: [],
  common: [],
  loading: false,
  lastFetchedAt: 0,
  error: null,
  editorMode: null,
  editorTargetName: null,
  editorDetail: null,
  editorCommonDescription: null,
  editorLoading: false,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const [{ skills: personal }, { skills: common }] = await Promise.all([
        api.listSkills(),
        api.listCommonSkills(),
      ])
      set({
        personal,
        common,
        loading: false,
        lastFetchedAt: Date.now(),
      })
    } catch (err) {
      set({ loading: false, error: errorToMessage(err) })
    }
  },

  refetchIfStale: async (maxAgeMs = 3000) => {
    const { lastFetchedAt, loading } = get()
    if (loading) return
    if (Date.now() - lastFetchedAt < maxAgeMs) return
    await get().fetchAll()
  },

  openNew: () => {
    set({
      editorMode: "new",
      editorTargetName: null,
      editorDetail: null,
      editorCommonDescription: null,
      editorLoading: false,
    })
  },

  openEdit: async (name: string) => {
    set({
      editorMode: "edit",
      editorTargetName: name,
      editorDetail: null,
      editorCommonDescription: null,
      editorLoading: true,
    })
    try {
      const detail = await api.getSkill(name)
      set({ editorDetail: detail, editorLoading: false })
    } catch (err) {
      set({
        editorLoading: false,
        error: errorToMessage(err),
      })
    }
  },

  openView: (skill: CommonSkillSummary) => {
    set({
      editorMode: "view",
      editorTargetName: skill.name,
      editorDetail: null,
      editorCommonDescription: skill.description,
      editorLoading: false,
    })
  },

  closeEditor: () => {
    set({
      editorMode: null,
      editorTargetName: null,
      editorDetail: null,
      editorCommonDescription: null,
      editorLoading: false,
    })
  },

  create: async (input) => {
    const created = await api.createSkill(input)
    set((s) => ({
      personal: [created, ...s.personal.filter((p) => p.name !== created.name)],
      editorMode: null,
      editorTargetName: null,
      editorDetail: null,
    }))
  },

  update: async (name, input) => {
    const updated = await api.updateSkill(name, input)
    set((s) => ({
      personal: s.personal.map((p) => (p.name === name ? updated : p)),
      editorDetail: updated,
    }))
  },

  remove: async (name) => {
    await api.deleteSkill(name)
    set((s) => ({
      personal: s.personal.filter((p) => p.name !== name),
      editorMode: s.editorTargetName === name ? null : s.editorMode,
      editorTargetName: s.editorTargetName === name ? null : s.editorTargetName,
      editorDetail: s.editorTargetName === name ? null : s.editorDetail,
    }))
  },
}))

function errorToMessage(err: unknown): string {
  if (err instanceof SkillApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
