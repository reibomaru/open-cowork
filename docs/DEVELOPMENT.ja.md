# 開発者ガイド

[English / 英語版](./DEVELOPMENT.md)

利用者向けの [Quick Start](../README.ja.md) では触れない、プロジェクトの構成・スクリプト・開発時に把握しておきたい設定をまとめています。

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
  └── screenshots/     … README に貼る画像 (`pnpm screenshot` で再生成)
scripts/               … リポジトリ全体のヘルパースクリプト (screenshot など)
```

主要なエージェント実行コードは `server/src/agent-query.ts` と `server/src/claude-agent.ts`。
ファイル名は履歴経緯で残しているが、中身は pi-coding-agent ベースで動いている。

> 本リポジトリは本番デプロイ用の IaC / CI/CD / 認証基盤を含めていない。
> 認証や DB のクラウド永続化が必要な場合は `server/src/auth.ts` と
> `server/src/dynamodb-sessions.ts` を差し替えてください。

## 前提

- Node.js 22+
- pnpm 10+
- Docker Desktop

## セットアップ

```bash
pnpm install
[ -f server/.env ] || cp server/.env.example server/.env
[ -f client/.env ] || cat > client/.env << 'EOF'
VITE_API_BASE_URL=http://localhost:5173
VITE_DEV_USER_ID=dev-user-1
EOF
docker compose build server
```

pi-coding-agent 経由で Anthropic API を直接叩く場合は API キーを export (もしくは `server/.env` に書く):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## ローカル起動

```bash
pnpm dev
```

- Frontend: <http://localhost:5173> (Vite, ネイティブ HMR)
- Backend: <http://localhost:3000> (Docker コンテナ, `--watch` で自動再起動)

## npm scripts

| コマンド | 説明 |
|---------|-----|
| `pnpm dev` | Frontend + Backend を同時起動 |
| `pnpm dev:client` | Frontend のみ |
| `pnpm dev:server` | Backend コンテナのみ |
| `pnpm build` | SPA ビルド (`client/dist/`) |
| `pnpm check` | Lint + Format チェック (Biome) |
| `pnpm check:fix` | Lint + Format 自動修正 |
| `pnpm screenshot` | README 用スクリーンショット再生成 (`pnpm dev` が動作している前提) |

サーバ側のテスト (`server/` ワークスペース内で実行):

| コマンド | 説明 |
|---------|-----|
| `pnpm -F server test:unit` | Vitest ユニットテスト |
| `pnpm -F server test:e2e:up` | e2e 用 DynamoDB Local コンテナ起動 |
| `pnpm -F server test:e2e` | Hono の e2e テスト |
| `pnpm -F server test:e2e:down` | e2e 用コンテナ停止 |

## 環境変数

| ファイル | 主要な設定 |
|---------|----------|
| `server/.env` | `USE_MOCK` (mock/実SDK切替), `DEV_USER_ID` (認証フォールバック), `DYNAMODB_TABLE_SESSIONS`, `ANTHROPIC_API_KEY`, `MODEL_PROVIDER`, `PI_AGENT_DIR` |
| `client/.env` | `VITE_DEV_USER_ID` (認証フォールバック) |

`server/.env` で `USE_MOCK=true` にするとモックエージェントが使われ、API キーなしで動作する。UI 反復に便利。

## DynamoDB (ローカル)

`pnpm dev` / `docker compose up server` で `dynamodb-local` コンテナと、
`SessionsTableV2` 相当のスキーマ (`PK=userId` / `SK=sessionId` / LSI
`SessionsByUpdatedAt` / TTL は `ttl`) を作る `dynamodb-init` が自動起動する。

- 永続化先: `dynamodb-local-data` Docker volume。
  `docker compose down` では残り、`docker compose down -v` で消える。
- ホストから直接叩く場合 (複数 worktree で port が衝突するため host bind はしていない):

  ```bash
  docker compose run --rm \
    -e AWS_ENDPOINT_URL_DYNAMODB=http://dynamodb-local:8000 \
    dynamodb-init aws dynamodb scan --table-name sessions-local
  ```

## スクリーンショット再生成

README で表示している画像は `docs/screenshots/` 配下にある。UI 変更後は次の手順で更新する:

1. 別ターミナルで `pnpm dev` を起動。
2. もう一方で `pnpm screenshot` を実行。

スクリプトは Playwright (`@playwright/test`、client ワークスペースに同梱) でライト/ダーク両テーマを撮影する。

## 関連ファイル

- [`README.md`](../README.md) / [`README.ja.md`](../README.ja.md) — 利用者向けクイックスタート
- [`server/.env.example`](../server/.env.example) — サーバ側 env の全項目
- [`scripts/screenshot.mjs`](../scripts/screenshot.mjs) — スクリーンショット生成スクリプト
