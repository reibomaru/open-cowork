export type ToolType = "Read" | "Edit" | "Write" | "Bash" | "Glob" | "Grep" | "Agent" | "WebFetch"

export type ToolCallStatus = "running" | "completed" | "failed"

export interface ToolCall {
  id: string
  type: ToolType
  status: ToolCallStatus
  input: Record<string, unknown>
  output?: string
  diff?: DiffData
  duration?: number
}

export interface DiffData {
  filePath: string
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export interface DiffLine {
  type: "add" | "remove" | "context"
  content: string
}
