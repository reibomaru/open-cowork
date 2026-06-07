import { create } from "zustand"

// dev フォールバック前提の最小ストア。OIDC/JWT 連携は本リポジトリでは扱わない。
// userId はビルド時 (VITE_DEV_USER_ID) または開発フォールバックで決まる。
interface AuthStore {
  userId: string | null
  ready: boolean
  error: string | null
  setUserId: (userId: string) => void
  setReady: (ready: boolean) => void
  setError: (error: string | null) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  userId: null,
  ready: false,
  error: null,
  setUserId: (userId) => set({ userId }),
  setReady: (ready) => set({ ready }),
  setError: (error) => set({ error }),
}))
