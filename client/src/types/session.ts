export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  status: "active" | "archived"
  model: string
  permissionMode: "ask" | "auto-accept" | "plan" | "auto"
  /**
   * セッションの作業ディレクトリ。workdir root からの相対パス。
   * 指定セッションは編集範囲がこの配下に制限される。未指定は workdir 全体。
   */
  workingDir?: string
  /**
   * セッション累計のトークン使用量・コスト (USD)。サーバ側 Session.usage と同形。
   * GET /api/sessions/:id で権威ある値が取れる。1 ターンも完了していなければ undefined。
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
