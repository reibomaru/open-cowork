import { Search } from "lucide-react"
import { formatDuration } from "../../lib/format"
import type { ToolCall } from "../../types/tool-call"
import { Collapsible } from "../ui/Collapsible"
import { Spinner } from "../ui/Spinner"

export function SearchBlock({ toolCall }: { toolCall: ToolCall }) {
  const pattern = (toolCall.input.pattern as string) || ""

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <Search size={14} className="text-tool-search shrink-0" />
      <span className="text-primary font-medium">{toolCall.type}</span>
      <code className="text-secondary text-xs font-mono truncate">{pattern}</code>
      {toolCall.status === "running" && <Spinner size={14} className="text-tool-search" />}
      {toolCall.duration != null && (
        <span className="text-xs text-secondary ml-auto shrink-0">
          {formatDuration(toolCall.duration)}
        </span>
      )}
    </div>
  )

  return (
    <div className="my-2">
      <Collapsible header={header} borderColor="var(--color-tool-search)">
        {toolCall.output && (
          <pre className="px-3 py-2 text-xs font-mono text-primary whitespace-pre-wrap max-h-48 overflow-y-auto">
            {toolCall.output}
          </pre>
        )}
      </Collapsible>
    </div>
  )
}
