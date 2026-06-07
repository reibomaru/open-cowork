import clsx from "clsx"
import { ChevronRight } from "lucide-react"
import { type ReactNode, useState } from "react"

interface CollapsibleProps {
  header: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  borderColor?: string
}

export function Collapsible({
  header,
  children,
  defaultOpen = false,
  borderColor,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={clsx(
        "rounded-lg border border-border-default overflow-hidden",
        borderColor && "border-l-2",
      )}
      style={borderColor ? { borderLeftColor: borderColor } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors"
      >
        <ChevronRight
          size={14}
          className={clsx("text-subtle transition-transform shrink-0", open && "rotate-90")}
        />
        <div className="flex-1 min-w-0">{header}</div>
      </button>
      {open && <div className="border-t border-border-subtle">{children}</div>}
    </div>
  )
}
