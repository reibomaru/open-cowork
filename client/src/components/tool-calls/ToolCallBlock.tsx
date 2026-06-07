import type { ToolCall } from "../../types/tool-call"
import { AgentBlock } from "./AgentBlock"
import { BashBlock } from "./BashBlock"
import { FileEditBlock } from "./FileEditBlock"
import { FileReadBlock } from "./FileReadBlock"
import { SearchBlock } from "./SearchBlock"

interface ToolCallBlockProps {
  toolCall: ToolCall
}

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  switch (toolCall.type) {
    case "Read":
      return <FileReadBlock toolCall={toolCall} />
    case "Edit":
    case "Write":
      return <FileEditBlock toolCall={toolCall} />
    case "Bash":
      return <BashBlock toolCall={toolCall} />
    case "Glob":
    case "Grep":
      return <SearchBlock toolCall={toolCall} />
    case "Agent":
      return <AgentBlock toolCall={toolCall} />
    default:
      return <GenericToolBlock toolCall={toolCall} />
  }
}

function GenericToolBlock({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="my-2 text-xs text-secondary bg-white/5 rounded px-3 py-2">
      <span className="font-mono">{toolCall.type}</span>
      {toolCall.status === "running" && <span className="ml-2 animate-pulse">...</span>}
      {toolCall.duration != null && <span className="ml-2">{toolCall.duration}ms</span>}
    </div>
  )
}
