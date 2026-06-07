import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { useAuthStore } from "./store/auth-store"
import "./index.css"

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed in index.html
const container = document.getElementById("root")!
const root = createRoot(container)

// dev フォールバック userId。本リポジトリは OIDC を持たないため、Vite 環境変数
// (VITE_DEV_USER_ID) で固定 userId を渡すか、サーバの DEV_USER_ID と合わせる。
const DEV_USER_ID = (import.meta.env.VITE_DEV_USER_ID as string | undefined) ?? "dev-user-1"
useAuthStore.getState().setUserId(DEV_USER_ID)
useAuthStore.getState().setReady(true)

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
