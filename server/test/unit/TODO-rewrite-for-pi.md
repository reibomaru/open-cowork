# TODO: pi-coding-agent 向けにユニットテストを書き直す

旧実装の以下 2 件は Claude Agent SDK の internal message format (`stream_event` /
`content_block_*` / `result.usage`) を直接モックしていたため、pi-coding-agent への
移行に伴い削除した。

- `mcp-tool-notification.test.ts` … MCP tool 通知の chip 化を検証
- `usage-extraction.test.ts`       … `result.usage` / `modelUsage` の正規化を検証

pi-coding-agent では:

- ツール通知は `tool_execution_start` イベントで届くので、新規 `tool-event.test.ts`
  を書いてその handler 経由の `skill_invoked` SSE を検証する。
- usage は `turn_end.message.usage` (`{input, output, cacheRead, cacheWrite, cost}`)
  なので、`extractTurnUsage` を直接呼ぶ単体テストに置き換える。

詳細は `server/src/agent-query.ts` の実装と `docs/json.md` の AgentSessionEvent を参照。
