# edge-cdp: 操作レシピとトラブルシュート

`http://localhost:9222` に attach 済みの `page` を使う前提のスニペット集。

## よく使う操作レシピ

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

## 既存タブを再利用する

CDP 接続後、`context.pages()` で既に開いているタブを取得できる。新規タブを作る代わりに既存タブを使い回すと、ログイン状態などを保てる。

```js
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().startsWith('http://localhost:5173'))
          ?? await ctx.newPage();
```

## 後片付け

- スクリプト終了時は **`browser.close()` でも Edge プロセスは閉じない**（CDP の disconnect のみ）→ 次回も再利用可能
- どうしても Edge を終了したい場合のみ: `pkill -f 'Microsoft Edge.*remote-debugging-port=9222'`
- プロファイルをリセットしたい: `rm -rf "$HOME/.claude-edge-cdp-profile"` してから再起動

## やってはいけないこと

- ❌ `pkill -f Chrome` / `pkill chrome` 系の Chrome を巻き込むコマンド（業務利用中の Chrome を落とす）
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
| `ERR_MODULE_NOT_FOUND: @playwright/test` | スクリプトを `client/` 配下に置いて実行する（下記「client/ 配下で実行する理由」参照） |
