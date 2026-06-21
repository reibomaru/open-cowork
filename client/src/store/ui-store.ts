import type { ModelId } from "@server/models"
import { create } from "zustand"

// 新規セッション作成時に既定モデルとして使う。null ならサーバ既定 (DEFAULT_MODEL_ID)。
// 既存セッションでモデルを切り替えたときも、次回新規作成時の既定にするためここを更新する。
const SELECTED_MODEL_KEY = "open-cowork:selectedModelId"

// ドラッグで調整したサイドパネル幅。localStorage 永続化して次回起動時に復元する。
const SIDEBAR_WIDTH_KEY = "open-cowork:sidebarWidth"
const RIGHT_PANEL_WIDTH_KEY = "open-cowork:rightPanelWidth"
const FILE_TREE_SKILLS_OPEN_KEY = "open-cowork:fileTree.skillsOpen"
const FILE_TREE_WORKSPACE_OPEN_KEY = "open-cowork:fileTree.workspaceOpen"
// 上下分割比 (skills セクションに割り当てる比率, 0..1)。両方展開時のみ有効。
const FILE_TREE_SPLIT_KEY = "open-cowork:fileTree.skillsSplit"
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 480
export const SIDEBAR_DEFAULT = 288 // Tailwind w-72
export const RIGHT_PANEL_MIN = 240
export const RIGHT_PANEL_MAX = 720
export const RIGHT_PANEL_DEFAULT = 320 // Tailwind w-80
// 境界線はヘッダ行 (~28px) のすぐ近くまで動かせるようにする。
// ピクセル指定ではなく比率指定なので、コンテナが極端に低い場合でも完全には潰れない。
export const FILE_TREE_SPLIT_MIN = 0.04
export const FILE_TREE_SPLIT_MAX = 0.96
export const FILE_TREE_SPLIT_DEFAULT = 0.4

function loadSelectedModelId(): ModelId | null {
  try {
    const v = localStorage.getItem(SELECTED_MODEL_KEY)
    return v ? (v as ModelId) : null
  } catch {
    return null
  }
}

function saveSelectedModelId(id: ModelId | null) {
  try {
    if (id) localStorage.setItem(SELECTED_MODEL_KEY, id)
    else localStorage.removeItem(SELECTED_MODEL_KEY)
  } catch {
    // localStorage 不可環境 (private mode 等) では永続化を諦める。
  }
}

function loadWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, Math.round(n)))
  } catch {
    return fallback
  }
}

function saveWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(width))
  } catch {
    // localStorage 不可環境では諦める
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return raw === "true"
  } catch {
    return fallback
  }
}

function saveBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "true" : "false")
  } catch {
    // localStorage 不可環境では諦める
  }
}

function loadSplit(): number {
  try {
    const raw = localStorage.getItem(FILE_TREE_SPLIT_KEY)
    if (!raw) return FILE_TREE_SPLIT_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return FILE_TREE_SPLIT_DEFAULT
    return Math.max(FILE_TREE_SPLIT_MIN, Math.min(FILE_TREE_SPLIT_MAX, n))
  } catch {
    return FILE_TREE_SPLIT_DEFAULT
  }
}

function saveSplit(ratio: number) {
  try {
    localStorage.setItem(FILE_TREE_SPLIT_KEY, String(ratio))
  } catch {
    // localStorage 不可環境では諦める
  }
}

export type RightPanelTab = "files" | "skills"

interface UIStore {
  sidebarOpen: boolean
  rightPanelOpen: boolean
  /** ドラッグで調整できるサイドパネル幅 (px)。閉じているときは AppShell 側で 0 に上書き表示。 */
  sidebarWidth: number
  rightPanelWidth: number
  /** 右パネルで現在開いているタブ。 */
  rightPanelTab: RightPanelTab
  theme: "dark" | "light"
  /** インクリメント式の refresh シグナル。FileTree がこの値の変化を購読して再 fetch する。 */
  filesRefreshTick: number
  /** インクリメント式の refresh シグナル。SkillsPanel がこの値の変化を購読して再 fetch する。 */
  skillsRefreshTick: number
  /** 新規セッション作成時の既定モデル。ChatHeader のセレクタとも双方向に同期する。 */
  selectedModelId: ModelId | null
  /**
   * 新規セッション作成時に選択中の作業ディレクトリ (workdir root からの相対パス)。
   * null なら workdir 全体 (従来挙動)。セッション作成後にクリアする。永続化はしない。
   */
  selectedWorkingDir: string | null
  /** 右パネルファイルツリーの skills セクション展開状態。 */
  fileTreeSkillsOpen: boolean
  /** 右パネルファイルツリーの workspace セクション展開状態。 */
  fileTreeWorkspaceOpen: boolean
  /** 両方展開時の skills セクション縦比率 (0..1)。 */
  fileTreeSplit: number
  /**
   * 外部から PromptInput に流し込みたいテキスト。`null` ならノーオペ。
   * WelcomeScreen のスキル一覧などからクリックで `/skill-name ` を埋め込む経路で使う。
   * PromptInput が拾ったら即 `null` に戻すので、ストアには長期間滞留しない。
   */
  pendingInputText: string | null
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setSidebarWidth: (width: number) => void
  setRightPanelWidth: (width: number) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  requestFilesRefresh: () => void
  requestSkillsRefresh: () => void
  setTheme: (theme: "dark" | "light") => void
  toggleTheme: () => void
  setSelectedModelId: (id: ModelId) => void
  setSelectedWorkingDir: (dir: string | null) => void
  setPendingInputText: (text: string | null) => void
  toggleFileTreeSkills: () => void
  toggleFileTreeWorkspace: () => void
  setFileTreeSplit: (ratio: number) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  rightPanelOpen: false,
  sidebarWidth: loadWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  rightPanelWidth: loadWidth(
    RIGHT_PANEL_WIDTH_KEY,
    RIGHT_PANEL_DEFAULT,
    RIGHT_PANEL_MIN,
    RIGHT_PANEL_MAX,
  ),
  rightPanelTab: "files",
  theme: "light",
  filesRefreshTick: 0,
  skillsRefreshTick: 0,
  selectedModelId: loadSelectedModelId(),
  selectedWorkingDir: null,
  fileTreeSkillsOpen: loadBool(FILE_TREE_SKILLS_OPEN_KEY, false),
  fileTreeWorkspaceOpen: loadBool(FILE_TREE_WORKSPACE_OPEN_KEY, true),
  fileTreeSplit: loadSplit(),
  pendingInputText: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSidebarWidth: (width) => {
    const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(width)))
    saveWidth(SIDEBAR_WIDTH_KEY, clamped)
    set({ sidebarWidth: clamped })
  },
  setRightPanelWidth: (width) => {
    const clamped = Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, Math.round(width)))
    saveWidth(RIGHT_PANEL_WIDTH_KEY, clamped)
    set({ rightPanelWidth: clamped })
  },
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  requestFilesRefresh: () => set((s) => ({ filesRefreshTick: s.filesRefreshTick + 1 })),
  requestSkillsRefresh: () => set((s) => ({ skillsRefreshTick: s.skillsRefreshTick + 1 })),
  setTheme: (theme) => {
    document.documentElement.classList.remove("dark", "light")
    document.documentElement.classList.add(theme)
    set({ theme })
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "dark" ? "light" : "dark"
      document.documentElement.classList.remove("dark", "light")
      document.documentElement.classList.add(next)
      return { theme: next }
    }),
  setSelectedModelId: (id) => {
    saveSelectedModelId(id)
    set({ selectedModelId: id })
  },
  setSelectedWorkingDir: (dir) => set({ selectedWorkingDir: dir }),
  setPendingInputText: (text) => set({ pendingInputText: text }),
  toggleFileTreeSkills: () =>
    set((s) => {
      const next = !s.fileTreeSkillsOpen
      saveBool(FILE_TREE_SKILLS_OPEN_KEY, next)
      return { fileTreeSkillsOpen: next }
    }),
  toggleFileTreeWorkspace: () =>
    set((s) => {
      const next = !s.fileTreeWorkspaceOpen
      saveBool(FILE_TREE_WORKSPACE_OPEN_KEY, next)
      return { fileTreeWorkspaceOpen: next }
    }),
  setFileTreeSplit: (ratio) => {
    const clamped = Math.max(FILE_TREE_SPLIT_MIN, Math.min(FILE_TREE_SPLIT_MAX, ratio))
    saveSplit(clamped)
    set({ fileTreeSplit: clamped })
  },
}))
