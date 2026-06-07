# セッション単位トークン使用量 / コスト表示 実装計画 (Issue #102 / MVP)

## 背景・目的

利用者がコスト感覚を持って AI を使えるよう、チャットの **セッション単位**のトークン使用量と概算コストを可視化する。

Issue #102 はセッション単位と管理者向けダッシュボードの両方を含むが、後者は「任意」のため本実装では **セッション単位のみ (MVP)** に絞る。管理者ダッシュボード・CSV エクスポート・ユーザー集計 API は別 Issue とする。

### 確定した方針

- **コスト算出**: Claude Agent SDK が計算済みの値をそのまま使う。SDK の `result` メッセージ (`type:"result"`) は `usage` (`input_tokens` 等)、`modelUsage` (モデル別)、`total_cost_usd` を持つ。自前の単価マスタは作らない。
- **永続化**: 既存 DynamoDB Sessions テーブルの各セッションレコードに**累計**を加算する (新テーブル・メッセージ単位の記録はしない)。**原子的加算 (`ADD`)** を使い、リジューム / 長期セッション / 並行ターンでも累計が正しく積み上がるようにする。
- **読み出し**: `GET /api/sessions/:id` を新設し、リロード後も永続化された累計を表示できるようにする。LSI は変更しない。

### 重要な前提

現状 `server/src/agent-query.ts` は `result` メッセージの `usage` / `total_cost_usd` を破棄している。`total_cost_usd` は**クエリ単位 (=1ターン)** の値であり、各ターンは `resume` 付きの新規 `query()` のため、必ず累計する必要がある。

---

## バックエンド

### 1. SDK の sink に usage 取得を追加 — `server/src/agent-query.ts`

`AgentStreamSink` (L15) に追加:

```ts
onUsage?(usage: AgentTurnUsage): void | Promise<void>
```

1ターン分のデルタ型をエクスポート:

```ts
export interface AgentTurnUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}
```

`msg.type === "result"` ブランチ (L82) で、`msg.usage` (snake_case: `input_tokens` 等) からトークン、`msg.total_cost_usd` からコストを取り出して `AgentTurnUsage` に正規化し、`await sink.onUsage?.(delta)` を呼ぶ。

- 全フィールドを `?? 0` + `Number.isFinite` でガード (後述の `ADD` で `undefined` が入ると throw するため)。
- `usage` が無い場合は `modelUsage` の各値合算でフォールバック。
- 実装時、`result` メッセージの生オブジェクトを 1 度ログ出力して実 runtime キー名を確認する (`msg` は `any` 扱い)。

### 2. 原子的累計書き込み — `server/src/dynamodb-sessions.ts`

`patchSession` は `SET` のため累計には**使わない**。専用関数を新設:

```ts
export async function addSessionUsage(
  userId: string, sessionId: string, delta: AgentTurnUsage, updatedAt = Date.now()
): Promise<void>
```

- `UpdateExpression: "ADD usageInputTokens :it, usageOutputTokens :ot, usageCacheReadTokens :cr, usageCacheCreationTokens :cc, usageCostUSD :cost SET updatedAt = :u"`
- `ConditionExpression: "attribute_exists(sessionId)"`
- **フラットなトップレベル属性** (`usageInputTokens` 等) として格納。ネストした map にしない (`ADD` の原子性を保つため／map 初期化問題を回避)。
- `ADD` は属性が存在しなければ 0 から加算するので `if_not_exists` 不要。
- `ConditionalCheckFailedException` (ストリーム中にセッション削除) は warn ログのみで握りつぶす。呼び出し元は `setSdkSessionId` 同様 fire-and-forget。
- `ADD` の値に `undefined` を渡すと throw するので、デルタは必ず数値化済みであること。

### 3. Session 型と読み出し整形 — `server/src/types.ts`, `dynamodb-sessions.ts`

`Session` (server) に追加:

```ts
usage?: {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  costUSD: number
}
```

`recordToSession` (L44) で、フラットな `usage*` 属性からネストした `usage` オブジェクトを再構成する (いずれかが存在するときのみ。無ければ `usage` は undefined)。

→ **保存はフラット (原子的)、API はネスト (クリーン)**。`getSession` は `ConsistentRead: true` 済みなのでターン直後の refetch でも最新累計が見える。

### 4. sink 接続 + ライブ SSE — `server/src/claude-agent.ts`

`sink` (L455) に追加:

```ts
onUsage(delta) {
  addSessionUsage(userId, sessionId, delta).catch((err) =>
    log.error("failed to persist usage", { userId, sessionId, error: String(err) }))
  stream.writeSSE({ event: "usage", data: JSON.stringify(delta) })
    .catch((err) => log.error("failed to emit usage SSE", { sessionId, error: String(err) }))
}
```

`onUsage` は `result` メッセージ時 (=ターン終盤) に発火し、最終 `done` イベントより前に流れるので順序問題なし。DynamoDB が真の情報源、ライブ SSE は即時フィードバック用。

### 5. セッション単体取得エンドポイント — `server/src/routes.ts`

`GET /api/sessions/:id` を新設 (現状未存在)。`getOwnedSession(id, userId)` → 404 or `c.json(session)`。既存エンドポイントと同じ auth/ownership パターン。`usage` を含む完全な Session を返す。

---

## フロントエンド

### 6. SSE 配線 — `client/src/lib/sse-client.ts`

`"usage"` を **`SSEEventType` union (L4) と `KNOWN_EVENT_TYPES` set (L22) の両方**に追加 (set に無いと L76 で破棄される)。

### 7. イベントハンドリング — `client/src/hooks/use-sse.ts`

switch に `case "usage":` を追加 (`done` とは独立):

```ts
case "usage":
  useSessionStore.getState().addUsageToActiveSession(sid, data)
  break
```

### 8. クライアント Session 型 — `client/src/types/session.ts`

`usage?: {...}` を追加 (サーバのネスト `usage` と同一フィールド名)。store は `api.getSessions()` の RPC 推論型をこの手書き型に構造的代入するため、名前を一致させる。新設 `GET /api/sessions/:id` の戻り型も構造的に互換であること。

### 9. store アクション — `client/src/store/session-store.ts`

- `addUsageToActiveSession(sessionId, delta)`: 対象セッションの `usage` を「既存 (or ゼロ) + デルタ」で**加算**する純粋累計 (SSE デルタはターン単位)。
- `setSessionUsage(id, usage)` (or セッションオープン時のマージ): `GET /api/sessions/:id` の権威ある値で**置換**する。セッション切替/初回オープン時に呼ぶ。

### 10. バッジ + ツールチップ — `client/src/components/chat/ChatHeader.tsx` + 新規 `UsageBadge.tsx`

- ChatHeader は既に active session を購読 (L12)。`session.usage` を `UsageBadge` に渡す。
- バッジ: コンパクトな合計 (トークン数省略表記 `1.2k` + コスト `$0.0123`)。CLAUDE.md に従い `<Tooltip label={...}>` でラップ。ツールチップに内訳 (input / output / cache-read / cache-creation トークン + コスト) を表示。`Tooltip` の `label` は string のため、内訳は i18n 補間で組んだ複数行文字列 (`\n` + CSS `white-space: pre-line`) で渡す。
- `session?.usage` が undefined のときは何も描画しない (mock / ターン未発生)。
- セッションオープン時に `GET /api/sessions/:id` を呼んで権威ある累計をマージ (9 の setter)。

### 11. 通貨 — USD のみ (MVP)

SDK は `costUSD` / `total_cost_usd` を USD で返す。表示は USD のみ (`$0.0123`)。JPY トグルは維持コストのある FX レートが必要なため対象外。コストは float、表示時のみ `toFixed(4)` 程度で整形し、永続化前に丸めない (`ADD` は完全な float を格納)。

### 12. i18n — `client/src/i18n/messages.ts`

`chat.usage.*` を ja/en 両方に追加 (ハードコード禁止):

- `chat.usage.label` ("使用量" / "Usage")
- `chat.usage.cost` ("コスト" / "Cost")
- `chat.usage.inputTokens` / `outputTokens` / `cacheRead` / `cacheCreation` (`{{count}}` 補間)
- `chat.usage.total` ("{{tokens}} トークン · ${{cost}}")

---

## 動作確認

1. **ライブ反映**: 実 Bedrock でメッセージ送信 → Network の EventStream に `usage` イベントが届き、ターン終了時にバッジが更新される。
2. **ツール実行のトークン計上**: Read/Bash を強制するプロンプトで、usage 合計にツールターン分 (cache 系が非ゼロ) が含まれることを確認。
3. **長期セッションの累計精度**: N 通送信後、`GET /api/sessions/:id` (or リロード) で累計が単調増加し、各ターンのデルタ合計と一致することを確認。DynamoDB アイテムの `usageInputTokens` 等が増えること。
4. **モデル切替**: ModelSelector で途中変更 → 次ターンでもコストが累加される (`total_cost_usd` はクエリ単位なので単純加算)。
5. **並行性**: 同一セッションに 2 ターンをほぼ同時実行 → 合計が両者の和になる (`ADD` vs `SET` の回帰テスト)。
6. **リロード永続化**: リロード → セッション再オープン → `GET /api/sessions/:id` の永続累計がバッジに出る。
7. **データ無し状態**: 新規セッション / mock でバッジ非表示・クラッシュしない (`usage === undefined`)。

---

## 主要ファイル

### 変更 (中核)

- `server/src/agent-query.ts` — sink 拡張 + usage 正規化
- `server/src/dynamodb-sessions.ts` — `addSessionUsage` (ADD) + `recordToSession` 整形
- `server/src/claude-agent.ts` — sink 接続 + usage SSE
- `client/src/lib/sse-client.ts` — `"usage"` イベント登録
- `client/src/store/session-store.ts` — 累計/置換アクション

### 変更 (小)

- `server/src/types.ts` — `Session.usage` 追加
- `server/src/routes.ts` — `GET /api/sessions/:id` 新設 + mock usage イベント
- `client/src/hooks/use-sse.ts` — `usage` case
- `client/src/types/session.ts` — usage 追加
- `client/src/components/chat/ChatHeader.tsx` + 新規 `UsageBadge.tsx`
- `client/src/i18n/messages.ts` — `chat.usage.*` (ja/en)

---

## 落とし穴

- **`SET` vs `ADD`**: 累計に `patchSession` (SET) を使うと並行/連続加算を取りこぼす。専用 `ADD` 関数必須 (最大の正確性リスク)。
- **`total_cost_usd` はクエリ単位**: ターン/リジュームをまたいで累計する。セッション合計として直接保存しない。
- **LSI projection**: セッション一覧 (`listByUserId`) は LSI 経由で usage を含まない。LSI を拡張しない (リビルド/コストリスク)。読み出しは `GET /api/sessions/:id` とライブ SSE で行う。
- **`removeUndefinedValues` + `ADD`**: marshalled `undefined` の ADD は throw。デルタは `?? 0` で必ず数値化。
- **SDK フィールド名**: `usage` (snake_case) と `modelUsage` (camelCase)。正規化は `agent-query.ts` の 1 箇所に集約。実 runtime キーを検証時にログ確認。
- **SSE イベント脱落**: 新 `"usage"` は union と `KNOWN_EVENT_TYPES` 両方に追加。
- **mock モード**: `streamClaudeAgentResponse` を経由しないため usage は流れない。バッジは未定義で no-op。ローカル確認用にダミー usage イベントを注入。
- **数値精度**: コストは float。DynamoDB は数値を 10 進文字列で保持するため `ADD` の float は安全。JS 側は表示時のみ整形、永続化前に丸めない。
- **クライアント型同期**: `client/src/types/session.ts` は手書きで、サーバのネスト `usage` 形と一致させる。

---

## スコープ外 (別 Issue)

- 管理者向けダッシュボード UI / admin role 判定の仕組み
- ユーザー単位・期間別の集計エンドポイント
- CSV エクスポート
- 通貨切替 (JPY 換算)
- モデル別内訳の永続化 (DynamoDB map の原子的初期化が煩雑なため MVP では見送り)
