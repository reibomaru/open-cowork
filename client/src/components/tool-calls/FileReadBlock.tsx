import { FileText } from "lucide-react"
import { useT } from "../../i18n"
import { formatDuration } from "../../lib/format"
import type { ToolCall } from "../../types/tool-call"
import { Collapsible } from "../ui/Collapsible"
import { Spinner } from "../ui/Spinner"

export function FileReadBlock({ toolCall }: { toolCall: ToolCall }) {
  const t = useT()
  const filePath = (toolCall.input.file_path as string) || t("tool.unknownFile")
  const fileName = filePath.split("/").pop()

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <FileText size={14} className="text-tool-read shrink-0" />
      <span className="text-primary font-medium">{t("tool.read")}</span>
      <span className="text-secondary font-mono truncate">{fileName}</span>
      {toolCall.status === "running" && <Spinner size={14} className="text-tool-read" />}
      {toolCall.duration != null && (
        <span className="text-xs text-secondary ml-auto shrink-0">
          {formatDuration(toolCall.duration)}
        </span>
      )}
    </div>
  )

  return (
    <div className="my-2">
      <Collapsible header={header} borderColor="var(--color-tool-read)">
        <div className="px-3 py-2">
          <div className="text-xs text-secondary mb-1 font-mono">{filePath}</div>
          {toolCall.output && (
            <pre className="text-xs font-mono bg-input rounded p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre text-primary">
              {toolCall.output}
            </pre>
          )}
        </div>
      </Collapsible>
    </div>
  )
}
