import { useCallback, useEffect, useRef } from "react"

export function useAutoScroll(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 100
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    }

    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: caller controls scroll trigger via deps
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom()
    }
  }, deps)

  return { containerRef, scrollToBottom }
}
