import type { Plan } from "./plan"
import type { SubAgent } from "./task"
import type { ToolCall } from "./tool-call"

export type MessageRole = "user" | "assistant"

export interface HtmlBlock {
  id: string
  html: string
  title?: string
  status: "streaming" | "complete"
  // サーバが <cwd>/<id>.html として保存した永続版の URL。html_block_end で受け取る。
  // complete 後はこれを iframe src に使えばリロード後も同じ artifact を再表示できる。
  url?: string
}

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCallId: string }
  | { type: "html_block"; htmlBlockId: string }
  | { type: "skill_reference"; skillRefId: string }

/** Claude が skill / slash command / MCP tool / 標準ツールを参照したことを示すマーカー。 */
export interface SkillReference {
  /** UI key 用。SSE event の id をそのまま使う。 */
  id: string
  /**
   * 表示用の名前。
   *   - source="tool" / "slash": skill 名 (例: "morning-standup")
   *   - source="mcp": 整形済み MCP tool 名 (例: "wiz-skills / create_skill")
   *   - source="builtin": 標準ツール名 (例: "Read", "Edit", "Bash")
   */
  name: string
  /**
   * "tool" = Claude が auto-trigger で Skill tool を使った
   * "slash" = ユーザが /<name> を入力した
   * "mcp" = Claude が MCP tool (`mcp__<server>__<tool>`) を呼んだ
   * "builtin" = Claude が標準ツール (Read/Edit/Write/Bash/Glob/Grep/Task etc.) を呼んだ
   */
  source: "tool" | "slash" | "mcp" | "builtin"
  /**
   * chip に併記する 1 行説明 (例: Read なら "src/foo.ts"、Bash なら "pnpm test")。
   * 抽出できない tool では undefined。
   */
  detail?: string
}

export interface MessageAttachment {
  name: string
  size: number
  mimeType: string
  /**
   * 画像のときに発行する Object URL。
   * - 新規送信時: ローカル File から URL.createObjectURL で発行 (SPA 生存中のみ)
   * - リロード後: 未設定。MessageBubble が fileId 経由で fetch して埋める
   */
  previewUrl?: string
  /** アップロード進捗 / 結果。サーバ送信に成功したものは "uploaded"。 */
  status: "uploading" | "uploaded" | "failed"
  /**
   * サーバ側 uploads/<sessionId>/<fileId>_... の uuid。
   * リロード時の rehydrate で server から返ってきたものはこれを使って再 fetch する。
   */
  fileId?: string
}

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  contentParts: MessageContentPart[]
  toolCalls: ToolCall[]
  htmlBlocks: HtmlBlock[]
  /** 参照された skill のチップ。SkillReferenceBlock で描画する。 */
  skillReferences: SkillReference[]
  plan?: Plan
  subAgents?: SubAgent[]
  /** ユーザーが送信時に添付したファイル。assistant 側では未使用。 */
  attachments?: MessageAttachment[]
  timestamp: number
  isStreaming: boolean
}
