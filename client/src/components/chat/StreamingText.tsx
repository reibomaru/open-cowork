import clsx from "clsx"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useT } from "../../i18n"

interface StreamingTextProps {
  content: string
  isStreaming: boolean
}

export function StreamingText({ content, isStreaming }: StreamingTextProps) {
  const t = useT()
  if (!content) {
    return isStreaming ? (
      <span className="streaming-cursor text-secondary">{t("chat.thinking")}</span>
    ) : null
  }

  return (
    <div className={clsx("markdown-content", isStreaming && "streaming-cursor")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
