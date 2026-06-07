import { Pencil } from "lucide-react"
import { useT } from "../../i18n"
import { formatDuration } from "../../lib/format"
import type { ToolCall } from "../../types/tool-call"
import { DiffViewer } from "../diff/DiffViewer"
import { Badge } from "../ui/Badge"
import { Collapsible } from "../ui/Collapsible"
import { Spinner } from "../ui/Spinner"

export function FileEditBlock({ toolCall }: { toolCall: ToolCall }) {
  const t = useT()
  const filePath = (toolCall.input.file_path as string) || t("tool.unknownFile")
  const fileName = filePath.split("/").pop()

  const addCount =
    toolCall.diff?.hunks.reduce(
      (sum, h) => sum + h.lines.filter((l) => l.type === "add").length,
      0,
    ) || 0
  const removeCount =
    toolCall.diff?.hunks.reduce(
      (sum, h) => sum + h.lines.filter((l) => l.type === "remove").length,
      0,
    ) || 0

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <Pencil size={14} className="text-tool-edit shrink-0" />
      <span className="text-primary font-medium">{toolCall.type}</span>
      <span className="text-secondary font-mono truncate">{fileName}</span>
      {addCount > 0 && <Badge variant="success">+{addCount}</Badge>}
      {removeCount > 0 && <Badge variant="error">-{removeCount}</Badge>}
      {toolCall.status === "running" && <Spinner size={14} className="text-tool-edit" />}
      {toolCall.duration != null && (
        <span className="text-xs text-secondary ml-auto shrink-0">
          {formatDuration(toolCall.duration)}
        </span>
      )}
    </div>
  )

  return (
    <div className="my-2">
      <Collapsible header={header} borderColor="var(--color-tool-edit)">
        <div className="px-3 py-2">
          <div className="text-xs text-secondary mb-2 font-mono">{filePath}</div>
          {toolCall.diff ? (
            <DiffViewer diff={toolCall.diff} />
          ) : (
            <div className="text-xs text-secondary">{t("tool.noDiff")}</div>
          )}
        </div>
      </Collapsible>
    </div>
  )
}
