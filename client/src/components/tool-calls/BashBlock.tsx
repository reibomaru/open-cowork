import { Terminal } from "lucide-react"
import { useT } from "../../i18n"
import { formatDuration } from "../../lib/format"
import type { ToolCall } from "../../types/tool-call"
import { Collapsible } from "../ui/Collapsible"
import { Spinner } from "../ui/Spinner"

export function BashBlock({ toolCall }: { toolCall: ToolCall }) {
  const command = (toolCall.input.command as string) || ""
  const t = useT()

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <Terminal size={14} className="text-tool-bash shrink-0" />
      <span className="text-primary font-medium">Bash</span>
      <code className="text-secondary text-xs font-mono truncate">{command}</code>
      {toolCall.status === "running" && <Spinner size={14} className="text-tool-bash" />}
      {toolCall.duration != null && (
        <span className="text-xs text-secondary ml-auto shrink-0">
          {formatDuration(toolCall.duration)}
        </span>
      )}
    </div>
  )

  return (
    <div className="my-2">
      <Collapsible header={header} defaultOpen={true} borderColor="var(--color-tool-bash)">
        <div className="bg-[#141413] rounded-b-lg p-3 max-h-64 overflow-y-auto">
          <div className="text-xs text-gray-400 mb-1 font-mono">$ {command}</div>
          {toolCall.output && (
            <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap">
              {toolCall.output}
            </pre>
          )}
          {toolCall.status === "running" && !toolCall.output && (
            <div className="text-xs text-gray-500 animate-pulse">{t("tool.running")}</div>
          )}
        </div>
      </Collapsible>
    </div>
  )
}
