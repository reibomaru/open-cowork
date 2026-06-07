import { type ReactNode, useRef, useState } from "react"
import { createPortal } from "react-dom"

type Direction = "above" | "below" | "left" | "right"

interface TooltipPos {
  x: number
  y: number
  direction: Direction
}

const EDGE_H = 100 // px — この距離より右/左端に近ければ横向きに表示

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [pos, setPos] = useState<TooltipPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth

    let direction: Direction
    let x: number
    let y: number

    if (rect.right > vw - EDGE_H) {
      direction = "left"
      x = rect.left - 4
      y = rect.top + rect.height / 2
    } else if (rect.left < EDGE_H) {
      direction = "right"
      x = rect.right + 4
      y = rect.top + rect.height / 2
    } else {
      direction = rect.top > 48 ? "above" : "below"
      x = rect.left + rect.width / 2
      y = direction === "above" ? rect.top : rect.bottom
    }

    setPos({ x, y, direction })
  }

  const tooltipStyle = (): React.CSSProperties => {
    if (!pos) return {}
    const { x, y, direction } = pos
    const base: React.CSSProperties = { position: "fixed", pointerEvents: "none" }
    switch (direction) {
      case "above":
        return {
          ...base,
          left: x,
          bottom: window.innerHeight - y + 4,
          transform: "translateX(-50%)",
        }
      case "below":
        return { ...base, left: x, top: y + 4, transform: "translateX(-50%)" }
      case "left":
        return { ...base, right: window.innerWidth - x, top: y, transform: "translateY(-50%)" }
      case "right":
        return { ...base, left: x, top: y, transform: "translateY(-50%)" }
    }
  }

  return (
    <div
      ref={ref}
      className="inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
      onMouseDown={() => setPos(null)}
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={tooltipStyle()}
            className="px-2 py-1 rounded text-xs text-white bg-neutral-800 border border-white/10 shadow whitespace-nowrap z-[9999]"
          >
            {label}
          </span>,
          document.body,
        )}
    </div>
  )
}
