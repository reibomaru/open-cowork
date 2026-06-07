import clsx from "clsx"
import type { ReactNode } from "react"

interface BadgeProps {
  children: ReactNode
  variant?: "default" | "success" | "warning" | "error"
  className?: string
}

const variants = {
  default: "bg-white/10 text-text-secondary",
  success: "bg-green-500/15 text-green-400",
  warning: "bg-yellow-500/15 text-yellow-400",
  error: "bg-neutral-500/15 text-neutral-400",
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
