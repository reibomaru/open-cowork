# server

Hono ベースの API サーバー。Claude Agent SDK を呼び出し、Session / Message の永続化は DynamoDB に行う。

## E2E テスト

Hono API ルートを **DynamoDB Local** に対して実通信させて検証する。

### 構成

- DynamoDB → `docker-compose.test.yml` の `amazon/dynamodb-local`（host port 8100）に実通信
- 認証 → dev fallback (`DEV_USER_ID` + `X-User-Id` ヘッダ) で userId を切り替え
- HTTP → `app.fetch(new Request(...))` で HTTP サーバを介さず Hono を直接叩く
- ランナー → `vitest` (`pool: forks` で SDK 状態のリーク防止)
- seed → `test/e2e/fixtures/seedSessions.ts` に active / archived / 別ユーザー所有 / "New Session" を用意

### テスト構成

| ファイル | 対象 |
|---|---|
| `test/e2e/sessions.e2e.test.ts` | `GET/POST/PATCH/DELETE /api/sessions(/:id)` — 所有権、archived 除外、updatedAt DESC、404 |
| `test/e2e/messages.e2e.test.ts` | `GET/POST /api/sessions/:id/messages` — sdkSessionId なしで [] / 他人 404 / 自動 title |
| `test/e2e/auth.e2e.test.ts` | `X-User-Id` 切替、`DEV_USER_ID` フォールバック、`/api/browser/ticket` |

### 実行

```bash
pnpm install
pnpm -F server test:e2e:up    # DynamoDB Local を起動
pnpm -F server test:e2e        # vitest 実行
pnpm -F server test:e2e:down  # 後片付け
```

`test:e2e:watch` でファイル監視モード。テーブルは globalSetup で都度 drop/create され、各テスト前に truncate される。

### CI

`.github/workflows/test-server.yml` が `server/**` または `pnpm-lock.yaml` の変更を含む PR / `main`・`develop` push で起動し、`amazon/dynamodb-local` を service コンテナとして立ち上げてから `pnpm -F server test:e2e` を実行する。

### 設計メモ

- DynamoDB Local 経由でテストする (Hono の DAO 経路を直接叩く)
- `SessionManager.open` の transcript 読み込みは、対応する jsonl が無い場合に例外を catch して `[]` を返す。テストでは transcript を用意しないので結果は `[]`
- SSE ストリーミング (`/api/sessions/:id/stream`) は LLM 呼び出しを伴うため E2E では対象外
