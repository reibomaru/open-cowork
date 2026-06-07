import { Bot } from "lucide-react"
import { useT } from "../../i18n"
import { formatDuration } from "../../lib/format"
import type { ToolCall } from "../../types/tool-call"
import { Collapsible } from "../ui/Collapsible"
import { Spinner } from "../ui/Spinner"

export function AgentBlock({ toolCall }: { toolCall: ToolCall }) {
  const t = useT()
  const description = (toolCall.input.description as string) || t("tool.agentTask")

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <Bot size={14} className="text-tool-agent shrink-0" />
      <span className="text-primary font-medium">{t("tool.agent")}</span>
      <span className="text-secondary truncate">{description}</span>
      {toolCall.status === "running" && <Spinner size={14} className="text-tool-agent" />}
      {toolCall.duration != null && (
        <span className="text-xs text-secondary ml-auto shrink-0">
          {formatDuration(toolCall.duration)}
        </span>
      )}
    </div>
  )

  return (
    <div className="my-2">
      <Collapsible header={header} borderColor="var(--color-tool-agent)">
        {toolCall.output && <div className="px-3 py-2 text-xs text-primary">{toolCall.output}</div>}
      </Collapsible>
    </div>
  )
}
