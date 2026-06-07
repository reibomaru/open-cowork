import clsx from "clsx"
import { Loader2 } from "lucide-react"

export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return <Loader2 className={clsx("animate-spin", className)} size={size} />
}
