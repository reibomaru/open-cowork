export interface Session {
  id: string
  /** セッション所有者 (authMiddleware が返す userId) */
  ownerId: string
  title: string
  createdAt: number
  updatedAt: number
  status: "active" | "archived"
  model: string
  permissionMode: "ask" | "auto-accept" | "plan" | "auto"
  /**
   * Claude Agent SDK が初回 init で発行する内部 session_id。
   * resume パラメータとして再投入することで会話の context を継続させる。
   * 1 回目のメッセージ送信が走るまでは undefined。
   */
  sdkSessionId?: string
  /**
   * Haiku でのタイトル要約が一度試行されたか、もしくはユーザーが手動で編集したかを示すフラグ。
   * true が立っているセッションには自動要約を再実行しない（「1 回だけ実行」の保証）。
   * 初回のフォールバックタイトル付与だけでは true にしない。
   */
  titleGenerated?: boolean
  /**
   * セッションの累計トークン使用量とコスト (USD)。
   * 各ターンの SDK result メッセージから取れた値を加算していく。
   * DynamoDB 上は usageInputTokens 等のフラット属性で保持し (ADD で原子的加算)、
   * getSession 時に recordToSession でこの形へ再構成する。
   * 1 ターンも完了していないセッションでは undefined。
   */
  usage?: SessionUsage
}

/** セッション累計の使用量・コスト。トークンは合算値、costUSD は USD のコスト合計。 */
export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}

/**
 * クライアントへの返却用 attachment 情報。
 * fileId からは `/api/sessions/:id/files/:fileId` 経由で実体を取得できる。
 */
export interface MessageAttachmentInfo {
  /** uploads/ 配下のファイル uuid */
  id: string
  name: string
  size: number
  mimeType: string
  isImage: boolean
}

export interface SkillReferenceInfo {
  /** id は transcript の tool_use id を使う (slash の場合は `slash-<sm.uuid>`)。 */
  id: string
  /**
   * 表示用の名前。
   *   - source="tool" / "slash": skill 名 (例: "morning-standup")
   *   - source="mcp": 整形済み MCP tool 名 (例: "wiz-skills / create_skill")
   *   - source="builtin": 標準ツール名 (例: "Read", "Edit", "Bash")
   */
  name: string
  /**
   * "tool" = Claude が built-in Skill tool を auto-trigger で呼んだ
   * "slash" = ユーザが /<name> を入力した
   * "mcp" = Claude が MCP tool (`mcp__<server>__<tool>`) を呼んだ
   * "builtin" = Claude が標準ツール (Read/Edit/Write/Bash/Glob/Grep/Task etc.) を呼んだ
   */
  source: "tool" | "slash" | "mcp" | "builtin"
  /**
   * chip に併記する 1 行説明 (例: Read なら file_path、Bash なら command)。
   * 抽出できない tool では undefined。
   */
  detail?: string
}

export interface StoredMessage {
  id: string
  sessionId: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  /** ユーザーが送信時に添付したファイル。transcript の prompt prefix から復元する。 */
  attachments?: MessageAttachmentInfo[]
  /** この message から参照された skill の chip 情報。skill_invoked SSE と同じ形を取る。 */
  skillReferences?: SkillReferenceInfo[]
}
