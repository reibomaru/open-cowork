import clsx from "clsx"
import { useCallback, useEffect, useRef, useState } from "react"

interface ResizeHandleProps {
  /**
   * "left" = ハンドルが対象パネルの左側 (= Right panel をドラッグするとき)
   * "right" = ハンドルが対象パネルの右側 (= Sidebar をドラッグするとき)
   */
  side: "left" | "right"
  /** リサイズ確定時の幅 (px)。clamp は呼び出し側 store の責任。 */
  onChange: (width: number) => void
  /** 現在の幅。マウス押下時の基準として読む。 */
  currentWidth: number
  /** 上下方向は親要素の高さを埋める */
  ariaLabel?: string
}

/**
 * 4px 幅の縦線。ホバーで色が付いてドラッグできることを示す。
 * カラム間に置いて使う想定。
 */
export function ResizeHandle({ side, onChange, currentWidth, ariaLabel }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      startWidthRef.current = currentWidth
      setIsDragging(true)
    },
    [currentWidth],
  )

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      // 右ハンドル (Sidebar 右辺) は右にドラッグ = 幅増やす
      // 左ハンドル (RightPanel 左辺) は左にドラッグ = 幅増やす
      const signed = side === "right" ? delta : -delta
      onChangeRef.current(startWidthRef.current + signed)
    }
    const handleUp = () => setIsDragging(false)
    document.addEventListener("mousemove", handleMove)
    document.addEventListener("mouseup", handleUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseup", handleUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isDragging, side])

  // separator は keyboard でも調整できるよう left/right で 16px 単位の幅変更を許す
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 64 : 16
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        onChangeRef.current(currentWidth + (side === "right" ? -step : step))
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        onChangeRef.current(currentWidth + (side === "right" ? step : -step))
      }
    },
    [currentWidth, side],
  )

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={currentWidth}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      className={clsx(
        "shrink-0 w-1 cursor-col-resize select-none group relative outline-none",
        "hover:bg-ink/40 active:bg-ink/60 focus-visible:bg-ink/60",
        isDragging && "bg-ink/60",
      )}
    >
      {/* クリック判定を広げる透明な拡張 (上に乗せると 1px 線でも掴みやすい) */}
      <div className="absolute inset-y-0 -inset-x-1" />
    </div>
  )
}
