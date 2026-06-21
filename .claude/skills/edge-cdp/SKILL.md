---
name: edge-cdp
description: >
  既存で起動している macOS の Microsoft Edge を Chrome DevTools Protocol (CDP) 経由で操作するスキル。
  Edge をリモートデバッグポート付きで起動し、Playwright の connectOverCDP で attach して
  ページ遷移・スクショ・フォーム入力・クリック・DOM/console 取得を行う。Edge プロセスは終了させない。
  トリガー例（カジュアル/フォーマル/間接表現を含む）:
  「ブラウザで開いて」「Edge でスクショ撮って」「この画面キャプチャして」「フォームに入力して」
  「ボタンを押して動作確認して」「localhost:5173 を見て」「ログイン後の画面を確認して」など。
  near-miss（このスキルではない）:
  - dev サーバーの起動だけなら dev-server（起動した画面の確認は本スキル）。
  - Playwright が自前でブラウザを起動して回す自動テストは webapp-testing
    （本スキルは業務利用中の Chrome を避け、既存 Edge に attach する点で異なる）。
  - 認証必須・実ブラウザのログイン状態を使いたい画面確認は本スキル
    （専用プロファイルでログイン状態を保持できる）。
---

# Edge CDP 操作スキル

ローカル Microsoft Edge を Chrome DevTools Protocol (CDP) 経由で操作する。

## 原則

- **Chrome は絶対に触らない**: 業務利用中のため、起動・kill・プロファイル共有を避ける。
- **専用プロファイルを使用**: `$HOME/.claude-edge-cdp-profile` に隔離。普段使い Edge プロファイルも汚さない。
- **既存 Edge を再利用**: 一度起動した CDP-Edge は閉じずに使い回す（`connectOverCDP` は disconnect のみ）。

## 前提

- Microsoft Edge がインストール済み (`/Applications/Microsoft Edge.app/`)
- Node.js が使える / `curl`, `jq` が PATH にある
- `client/` ワークスペースに `@playwright/test` がインストール済み（未なら `pnpm -F client install`）

## 手順

### 1. Edge を CDP 付きで起動（冪等）

```bash
.claude/skills/edge-cdp/scripts/launch-edge.sh
```

既に port 9222 が応答していれば何もしない。未起動なら専用 user-data-dir でバックグラウンド起動し、
CDP ready まで最大 15 秒待機する。ポート変更は `launch-edge.sh 9223`。

### 2. Playwright で接続して操作

スクリプトは **必ず `client/` 配下にコピーして実行**する（pnpm hoisting の都合。理由は
[references/why-client-dir.md](references/why-client-dir.md)）。

スクリーンショットは既製スクリプトを使う:

```bash
cp .claude/skills/edge-cdp/scripts/cdp-screenshot.mjs client/cdp-screenshot.tmp.mjs
node client/cdp-screenshot.tmp.mjs "http://localhost:5173/path" /tmp/shot.png
rm client/cdp-screenshot.tmp.mjs
```

任意の操作はインラインで書く（同じく `client/` 配下に `*.tmp.mjs` で作って実行後に削除）:

```bash
cat > client/cdp-action.tmp.mjs <<'EOF'
import { chromium } from '@playwright/test';
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0] ?? await browser.newContext();
const page = ctx.pages()[0] ?? await ctx.newPage();

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/shot.png', fullPage: true });

await browser.close(); // disconnect のみ。Edge プロセスは閉じない
EOF
node client/cdp-action.tmp.mjs
rm client/cdp-action.tmp.mjs
```

## 詳細（必要時のみ読む）

- 操作レシピ・既存タブ再利用・後片付け・**やってはいけないこと**・トラブルシュート →
  [references/recipes.md](references/recipes.md)
- `client/` 配下で実行する理由（pnpm hoisting の背景）→
  [references/why-client-dir.md](references/why-client-dir.md)

## 関連スキル

- `dev-server`: dev サーバ起動 → 本スキルで画面確認、の流れ
- `example-skills:webapp-testing`: Playwright がブラウザを起動して回す自動テスト（本スキルは既存 Edge に attach する点で異なる）
