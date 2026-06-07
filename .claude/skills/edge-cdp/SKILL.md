---
name: edge-cdp
description: >
  既存で起動している Microsoft Edge ブラウザを Chrome DevTools Protocol (CDP) 経由で操作するスキル。
  Chrome は業務で利用中のため触らず、Edge をリモートデバッグポート付きで起動して制御する。
  Playwright の `connectOverCDP` で既存 Edge に attach するため、Edge プロセスは終了させない。
  トリガー: (1) ブラウザ自動操作、(2) Web ページのスクリーンショット取得、(3) フォーム入力・クリック自動化、
  (4) ローカル dev サーバの画面確認、(5) 「ブラウザで開いて」「Edge でスクショ撮って」「フォーム入力して」等のリクエスト。
---

# Edge CDP 操作スキル

## 目的

ローカル Microsoft Edge を Chrome DevTools Protocol (CDP) 経由で操作する。

- **Chrome は絶対に触らない**: 業務利用中のため、起動・kill・プロファイル共有を避ける
- **専用プロファイルを使用**: `$HOME/.claude-edge-cdp-profile` に隔離。ユーザーの普段使い Edge プロファイルも汚さない
- **既存 Edge を再利用**: 一度起動した CDP-Edge は閉じずに使い回す（`connectOverCDP` は disconnect のみ）

## 前提

- Microsoft Edge がインストール済み (`/Applications/Microsoft Edge.app/`)
- Node.js が使える
- `client/` ワークスペースに `@playwright/test` がインストール済み (`client/package.json` の devDeps)。未インストールなら `pnpm -F client install` を先に
- `curl`, `jq` が PATH にある（起動確認用）

## 手順

### 1. Edge を CDP 付きで起動（idempotent）

```bash
.claude/skills/edge-cdp/scripts/launch-edge.sh
```

- 既に port 9222 が応答していれば何もしない
- 未起動なら専用 user-data-dir でバックグラウンド起動 → CDP ready まで最大 15 秒待機
- ポート変更したい場合は引数で: `launch-edge.sh 9223`

### 2. Playwright で接続して操作

このプロジェクトには既に `client/` ワークスペースに `@playwright/test` がインストール済み (`client/package.json` の devDeps)。
ESM の module resolution は **スクリプトの設置場所** を起点に解決されるため、スクリプトは **`client/` 配下に一時コピーして実行** するのが確実。

#### スクリーンショット取得（既製スクリプト使用）

```bash
# スクリプトを client/ にコピーして実行 → 終わったら消す
cp .claude/skills/edge-cdp/scripts/cdp-screenshot.mjs client/cdp-screenshot.tmp.mjs
node client/cdp-screenshot.tmp.mjs "http://localhost:5173/path" /tmp/shot.png
rm client/cdp-screenshot.tmp.mjs
```

スクリプトは `@playwright/test` → `playwright-core` の順で動的 import するので、他プロジェクトでも playwright が入っていれば動く。

#### インライン記述で操作する場合

```bash
# 必ず client/ 配下に書く（pnpm hoisting の都合で他から resolve できない）
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

#### よく使う操作レシピ

| やりたいこと | コード |
|---|---|
| URL を開く | `await page.goto(url, { waitUntil: 'networkidle' })` |
| 要素クリック | `await page.click(selector)` |
| 入力 | `await page.fill(selector, value)` |
| ロケータ + 待機 | `await page.locator('text=保存').click()` |
| スクショ（要素単位） | `await page.locator(sel).screenshot({ path })` |
| テキスト取得 | `await page.locator(sel).textContent()` |
| HTML 取得 | `await page.content()` |
| 待機 | `await page.waitForSelector(sel)` |
| 既存タブ一覧 | `context.pages().map(p => p.url())` |
| 新規タブ | `await context.newPage()` |
| 特定タブを選ぶ | `context.pages().find(p => p.url().includes('localhost:5173'))` |
| Console ログ取得 | `page.on('console', m => console.log(m.text()))` |

### 3. 既存タブを再利用する

CDP 接続後、`context.pages()` で既に開いているタブを取得できる。新規タブを作る代わりに既存タブを使い回すと、ログイン状態などを保てる。

```js
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().startsWith('http://localhost:5173'))
          ?? await ctx.newPage();
```

### 4. 後片付け

- スクリプト終了時は **`browser.close()` でも Edge プロセスは閉じない**（CDP の disconnect のみ）→ 次回も再利用可能
- どうしても Edge を終了したい場合のみ: `pkill -f 'Microsoft Edge.*remote-debugging-port=9222'`
- プロファイルをリセットしたい: `rm -rf "$HOME/.claude-edge-cdp-profile"` してから再起動

## やってはいけないこと

- ❌ `pkill -f Chrome` / `pkill chrome` 系の Chrome を巻き込むコマンド
- ❌ `/Applications/Google Chrome.app/...` の起動
- ❌ `--user-data-dir` を指定せずに Edge を起動する（ユーザーの普段使い Edge を CDP モードで奪ってしまう）
- ❌ Edge の通常起動プロセスに対して remote-debugging-port を後から付与しようとする（不可能）

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `ECONNREFUSED localhost:9222` | `launch-edge.sh` を実行。ログは `/tmp/edge-cdp.log` |
| Edge が黒い画面で固まる | 通常 Edge プロファイルと競合の可能性。`EDGE_CDP_PROFILE_DIR=/tmp/foo launch-edge.sh` で別パスを試す |
| screenshot が真っ白 | `await page.waitForLoadState('networkidle')` を `goto` 後に挟む |
| ポート 9222 が他で使用中 | `launch-edge.sh 9223` のように別ポートで起動。スクリプト側も `http://localhost:9223` に合わせる |
| `ERR_MODULE_NOT_FOUND: @playwright/test` | スクリプトを `client/` 配下に置いて実行する。`/tmp/` や repo root だと pnpm hoisting の都合で resolve 失敗 |

## 関連スキル

- `dev-server`: dev サーバ起動 → このスキルで画面確認の流れ
- `pr-ui-screenshots`: UI 変更 PR にスクショ添付するときの併用先
- `example-skills:webapp-testing`: より高度な Playwright 自動テスト（こちらは Playwright がブラウザを起動する。本スキルは既存 Edge に attach する点で異なる）
