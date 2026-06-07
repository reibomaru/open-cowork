import { Maximize2, Minimize2, Minus, Plus, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"
import { MarkdownView } from "./MarkdownView"

const SCALE_MIN = 50
const SCALE_MAX = 200
const SCALE_STEP = 10

interface PresenterModeProps {
  content: string
  title: string
  onClose: () => void
}

export function PresenterMode({ content, title, onClose }: PresenterModeProps) {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const docRef = useRef<HTMLDivElement | null>(null)

  const [scale, setScale] = useState(100)
  const [scaleBeforeFullscreen, setScaleBeforeFullscreen] = useState(100)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const changeScale = useCallback((delta: number) => {
    setScale((prev) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, prev + delta)))
  }, [])

  const resetScale = useCallback(() => setScale(100), [])

  const toggleFullscreen = useCallback(async () => {
    const overlay = overlayRef.current
    if (!overlay) return

    if (!isFullscreen) {
      setScaleBeforeFullscreen(scale)
      setScale(100)
      if (overlay.requestFullscreen) {
        try {
          await overlay.requestFullscreen()
          return
        } catch {
          // Fullscreen API unavailable — fall back to CSS-only fullscreen
        }
      }
      setIsFullscreen(true)
    } else {
      if (document.fullscreenElement === overlay && document.exitFullscreen) {
        try {
          await document.exitFullscreen()
          return
        } catch {
          // ignore
        }
      }
      setScale(scaleBeforeFullscreen)
      setIsFullscreen(false)
    }
  }, [isFullscreen, scale, scaleBeforeFullscreen])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const overlay = overlayRef.current
      const nowFullscreen = document.fullscreenElement === overlay
      if (!nowFullscreen && isFullscreen) {
        setScale((s) => s) // keep current; real restore happens in exit branch
        setScale(scaleBeforeFullscreen)
      }
      setIsFullscreen(nowFullscreen)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [isFullscreen, scaleBeforeFullscreen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen && document.fullscreenElement) return
        if (isFullscreen) {
          toggleFullscreen()
          return
        }
        onClose()
        return
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        changeScale(SCALE_STEP)
        return
      }
      if (e.key === "-") {
        e.preventDefault()
        changeScale(-SCALE_STEP)
        return
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault()
        toggleFullscreen()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, changeScale, isFullscreen, toggleFullscreen])

  // Apply zoom to the document element
  useEffect(() => {
    const el = docRef.current
    if (!el) return
    el.style.transform = `scale(${scale / 100})`
    el.style.transformOrigin = "top center"
  }, [scale])

  const fullscreenLabel = isFullscreen ? t("presenter.exitFullscreen") : t("presenter.fullscreen")

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-[200] flex flex-col ${theme}`}
      style={{ backgroundColor: theme === "dark" ? "#0a1430" : "#f0f3f8" }}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      {/* Toolbar — hidden when fullscreen */}
      {!isFullscreen && (
        <div
          className="flex items-center justify-between gap-4 mx-4 mt-4 mb-0 px-4 py-2.5 rounded-xl border border-app shrink-0"
          style={{
            backdropFilter: "blur(18px)",
            backgroundColor: theme === "dark" ? "rgba(14,27,61,0.92)" : "rgba(255,255,255,0.92)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          }}
        >
          {/* Left */}
          <span className="text-sm font-semibold text-primary truncate min-w-0">{title}</span>

          {/* Right */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <Tooltip label={t("presenter.zoomOut")}>
                <button
                  type="button"
                  onClick={() => changeScale(-SCALE_STEP)}
                  disabled={scale <= SCALE_MIN}
                  className="p-1.5 rounded-full border border-app hover:bg-white/10 text-secondary disabled:opacity-40 transition-colors"
                  aria-label={t("presenter.zoomOut")}
                >
                  <Minus size={12} />
                </button>
              </Tooltip>
              <Tooltip label={t("presenter.resetZoom")}>
                <button
                  type="button"
                  onClick={resetScale}
                  className="min-w-[56px] h-7 px-2 text-xs font-semibold tabular-nums text-primary rounded-full border border-app hover:bg-white/10 transition-colors"
                  aria-label={t("presenter.resetZoom")}
                >
                  {scale}%
                </button>
              </Tooltip>
              <Tooltip label={t("presenter.zoomIn")}>
                <button
                  type="button"
                  onClick={() => changeScale(SCALE_STEP)}
                  disabled={scale >= SCALE_MAX}
                  className="p-1.5 rounded-full border border-app hover:bg-white/10 text-secondary disabled:opacity-40 transition-colors"
                  aria-label={t("presenter.zoomIn")}
                >
                  <Plus size={12} />
                </button>
              </Tooltip>
            </div>

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 h-7 px-3 text-xs font-semibold text-primary rounded-full border border-app hover:bg-white/10 transition-colors"
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
            >
              <Maximize2 size={12} />
              <span>{t("presenter.fullscreen")}</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 h-7 px-3 text-xs font-semibold text-primary rounded-full border border-app hover:bg-white/10 transition-colors"
              aria-label={t("presenter.close")}
              title={t("presenter.close")}
            >
              <X size={12} />
              <span>{t("presenter.close")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen exit button (floating, bottom-right) */}
      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="fixed bottom-5 right-5 z-10 flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-full border border-app hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
          style={{
            color: theme === "dark" ? "#e8ecf4" : "#1a1a2e",
            backgroundColor: theme === "dark" ? "rgba(14,27,61,0.85)" : "rgba(255,255,255,0.85)",
            backdropFilter: "blur(8px)",
          }}
          aria-label={t("presenter.exitFullscreen")}
          title={t("presenter.exitFullscreen")}
        >
          <Minimize2 size={12} />
          <span>{t("presenter.exitFullscreen")}</span>
        </button>
      )}

      {/* Content */}
      <div
        className="flex-1 overflow-auto flex justify-center"
        style={{ padding: isFullscreen ? "48px clamp(24px, 5vw, 72px) 96px" : "16px 16px 32px" }}
      >
        <div
          ref={docRef}
          style={{
            width: "min(100%, 920px)",
            transformOrigin: "top center",
            transition: "transform 180ms ease",
          }}
        >
          <MarkdownView content={content} />
        </div>
      </div>
    </div>
  )
}
