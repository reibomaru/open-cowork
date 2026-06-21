---
name: dev-server
description: >
  cowork プロジェクトのローカル開発サーバー (pnpm dev = client + server) を起動・再起動するスキル。
  ポート競合があれば既存プロセスを停止してから冪等に立ち上げる。
  トリガー例（カジュアル/フォーマル/間接表現を含む）:
  「サーバー立てて」「dev 起動して」「開発サーバー起動」「ローカルで動かして」「立ち上げ直して」
  「pnpm dev して」「画面確認したいから起動して」「ポート競合してるから上げ直して」など。
  near-miss（このスキルではない）:
  ブラウザ操作・スクショは edge-cdp、Docker Compose の server コンテナ運用は対象外、
  Playwright での自動テストは webapp-testing を使う。
---

# 開発サーバー起動スキル

ホスト上で `pnpm dev`（client=Vite + server=Hono）を冪等に起動する。
既存プロセスの停止 → 起動 → 確認 → URL 報告までをスクリプト 1 本で行う。

## 使い方

```bash
.claude/skills/dev-server/scripts/start-dev.sh
```

このスクリプトは:

1. デフォルトポート (3000, 5173) を使う既存プロセスを停止する
2. リポジトリルートで `pnpm dev` をバックグラウンド起動する
3. client (Vite) の起動をログで確認する
4. URL とログ末尾を出力する

起動後、ユーザーに URL を報告する:

- client: http://localhost:5173
- server: http://localhost:3000

## 詳細

ポート / 環境変数のカスタマイズ、トラブルシュートは
[references/ports.md](references/ports.md) を参照（必要時のみ読む）。

## 関連スキル

- `edge-cdp`: 起動した画面をブラウザで開いて確認・スクショする
- `example-skills:webapp-testing`: Playwright での自動テスト（起動とテストを兼ねる場合）
