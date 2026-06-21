import { Minus, Plus, RotateCcw, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useT } from "../../i18n"
import { useUIStore } from "../../store/ui-store"
import { Tooltip } from "../ui/Tooltip"

const SCALE_MIN = 0.25
const SCALE_MAX = 8
const SCALE_STEP = 0.2

const clampScale = (s: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s))

interface MermaidZoomModalProps {
  /** 描画済み Mermaid の SVG 文字列 */
  svg: string
  onClose: () => void
}

/**
 * Mermaid 図をフルスクリーンで表示し、ホイール/ボタンでズーム、
 * ドラッグでパンできるモーダル。k1LoW/mo のズーム挙動に合わせる。
 */
export function MermaidZoomModal({ svg, onClose }: MermaidZoomModalProps) {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const zoomBy = useCallback((delta: number) => {
    setScale((prev) => clampScale(prev + delta))
  }, [])

  const reset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        zoomBy(SCALE_STEP)
      } else if (e.key === "-") {
        e.preventDefault()
        zoomBy(-SCALE_STEP)
      } else if (e.key === "0") {
        e.preventDefault()
        reset()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose, zoomBy, reset])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP
    setScale((prev) => clampScale(prev + delta))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    stageRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    stageRef.current?.releasePointerCapture(e.pointerId)
  }

  const isDark = theme === "dark"

  return createPortal(
    <div
      className={`fixed inset-0 z-[210] flex flex-col ${theme}`}
      style={{ backgroundColor: isDark ? "rgba(5,10,25,0.94)" : "rgba(240,243,248,0.96)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Mermaid"
    >
      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-app bg-sidebar/90 px-2 py-1 shadow-lg backdrop-blur">
        <Tooltip label={t("markdownView.zoomOut")}>
          <button
            type="button"
            onClick={() => zoomBy(-SCALE_STEP)}
            disabled={scale <= SCALE_MIN}
            className="p-1.5 rounded-full hover:bg-white/10 text-secondary disabled:opacity-40"
            aria-label={t("markdownView.zoomOut")}
          >
            <Minus size={14} />
          </button>
        </Tooltip>
        <Tooltip label={t("markdownView.resetZoom")}>
          <button
            type="button"
            onClick={reset}
            className="min-w-[52px] px-2 text-xs font-semibold tabular-nums text-primary"
            aria-label={t("markdownView.resetZoom")}
          >
            {Math.round(scale * 100)}%
          </button>
        </Tooltip>
        <Tooltip label={t("markdownView.zoomIn")}>
          <button
            type="button"
            onClick={() => zoomBy(SCALE_STEP)}
            disabled={scale >= SCALE_MAX}
            className="p-1.5 rounded-full hover:bg-white/10 text-secondary disabled:opacity-40"
            aria-label={t("markdownView.zoomIn")}
          >
            <Plus size={14} />
          </button>
        </Tooltip>
        <Tooltip label={t("markdownView.resetZoom")}>
          <button
            type="button"
            onClick={reset}
            className="p-1.5 rounded-full hover:bg-white/10 text-secondary"
            aria-label={t("markdownView.resetZoom")}
          >
            <RotateCcw size={14} />
          </button>
        </Tooltip>
        <Tooltip label={t("markdownView.close")}>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-secondary"
            aria-label={t("markdownView.close")}
          >
            <X size={16} />
          </button>
        </Tooltip>
      </div>

      {/* Stage: ドラッグでパン、ホイールでズーム */}
      <div
        ref={stageRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // 背景クリック（ドラッグでない）で閉じる
        onClick={(e) => {
          if (e.target === stageRef.current) onClose()
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragRef.current ? "none" : "transform 120ms ease",
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG は mermaid.render が生成した信頼済み出力
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body,
  )
}
