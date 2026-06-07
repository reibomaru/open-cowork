# Open Cowork

[`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) を利用した AI アシスタント Web アプリケーション。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | React 19 / TypeScript / Vite / Tailwind CSS / Zustand |
| Backend | Hono / TypeScript / **@earendil-works/pi-coding-agent** |
| データ | DynamoDB (ローカルは `dynamodb-local` コンテナ) |
| 認証 | 開発時は `DEV_USER_ID` の固定 userId フォールバック |

## ディレクトリ構成

```
client/                … React SPA
server/                … Hono API サーバー + pi-coding-agent SDK
common-skills/         … pi-coding-agent に渡す共通 skill 集 (RO bind)
workdir/               … pi-coding-agent の cwd・HTML artifact 出力先
docs/                  … 機能仕様・設計メモ
```

主要なエージェント実行コードは `server/src/agent-query.ts` と `server/src/claude-agent.ts`。
ファイル名は履歴経緯で残しているが、中身は pi-coding-agent ベース。

> 本リポジトリは本番デプロイ用の IaC / CI/CD / 認証基盤を含めていない。
> 認証や DB のクラウド永続化が必要な場合は `server/src/auth.ts` と
> `server/src/dynamodb-sessions.ts` を差し替えてください。

## ローカル開発

### 前提

- Node.js 22+ / pnpm 10+ / Docker Desktop

### セットアップ

```bash
pnpm install
[ -f server/.env ] || cp server/.env.example server/.env
[ -f client/.env ] || cat > client/.env << 'EOF'
VITE_API_BASE_URL=http://localhost:5173
VITE_DEV_USER_ID=dev-user-1
EOF
docker compose build server
```

pi-coding-agent を介して Anthropic API を直接叩くなら API key を export:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 起動

```bash
pnpm dev
```

- Frontend: http://localhost:5173 (Vite, ネイティブ HMR)
- Backend: http://localhost:3000 (Docker コンテナ, `--watch` で自動再起動)

### npm scripts

| コマンド | 説明 |
|---------|-----|
| `pnpm dev` | Frontend + Backend を同時起動 |
| `pnpm dev:client` | Frontend のみ |
| `pnpm dev:server` | Backend コンテナのみ |
| `pnpm build` | SPA ビルド (`client/dist/`) |
| `pnpm check:fix` | Lint + Format (Biome) |

### 環境変数

| ファイル | 主要な設定 |
|---------|----------|
| `server/.env` | `USE_MOCK` (mock/実SDK切替), `DEV_USER_ID` (認証フォールバック), `DYNAMODB_TABLE_SESSIONS`, `ANTHROPIC_API_KEY`, `MODEL_PROVIDER`, `PI_AGENT_DIR` |
| `client/.env` | `VITE_DEV_USER_ID` (認証フォールバック) |

`server/.env` で `USE_MOCK=true` にするとモックエージェントが使われ、API キーなしで動作する。

### DynamoDB（ローカル）

`pnpm dev` / `docker compose up server` で `dynamodb-local` コンテナと、`SessionsTableV2`
相当のスキーマ (PK=userId / SK=sessionId / LSI=SessionsByUpdatedAt / TTL=ttl) を作る
`dynamodb-init` が自動起動する。
- 永続化先: `dynamodb-local-data` volume (`docker compose down` では残り、`docker compose down -v` で消える)
- ホストから直接叩く場合 (複数 worktree で port が衝突するため host bind はしていない):
  `docker compose run --rm -e AWS_ENDPOINT_URL_DYNAMODB=http://dynamodb-local:8000 dynamodb-init aws dynamodb scan --table-name sessions-local`
