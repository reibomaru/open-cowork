import { BrowserRouter } from "react-router-dom"
import { AppShell } from "./components/layout/AppShell"
import { useT } from "./i18n"
import { useAuthStore } from "./store/auth-store"

function GatedShell() {
  const ready = useAuthStore((s) => s.ready)
  const error = useAuthStore((s) => s.error)
  const t = useT()

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-600">
        {t("app.authError")}: {error}
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        {t("app.loading")}
      </div>
    )
  }
  return <AppShell />
}

export default function App() {
  return (
    <BrowserRouter>
      <GatedShell />
    </BrowserRouter>
  )
}
