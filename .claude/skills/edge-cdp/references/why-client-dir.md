# なぜスクリプトを `client/` 配下にコピーして実行するのか

## 結論

CDP 操作スクリプト（`.mjs`）は **`client/` 配下に一時コピーして実行する**こと。
`/tmp/` やリポジトリルートに置いて実行すると `ERR_MODULE_NOT_FOUND: @playwright/test` で失敗する。

```bash
cp .claude/skills/edge-cdp/scripts/cdp-screenshot.mjs client/cdp-screenshot.tmp.mjs
node client/cdp-screenshot.tmp.mjs "http://localhost:5173/path" /tmp/shot.png
rm client/cdp-screenshot.tmp.mjs
```

## 背景（pnpm hoisting）

- `@playwright/test` はこのリポジトリでは **`client/` ワークスペースの devDependency** としてのみインストールされている（`client/package.json`）。
- pnpm はデフォルトで依存を **そのワークスペースの `node_modules` 配下**に閉じ込める（hoisting しない）。npm のようにルートへ巻き上げない。
- Node の ESM module resolution は **実行されるファイルの場所**を起点に、親ディレクトリへ向かって `node_modules` を辿る。
- したがって `/tmp/foo.mjs` やルートの `foo.mjs` から `import '@playwright/test'` しても、`client/node_modules` には到達できず解決に失敗する。
- `client/` 配下に置けば、`client/node_modules/@playwright/test` が直近の `node_modules` として解決される。

## 補足

- 既製スクリプト（`scripts/cdp-screenshot.mjs`）は `@playwright/test` → `playwright-core` の順で動的 import する。playwright が入っている他プロジェクトでも、実行場所さえ正しければ動く。
- 未インストールなら先に `pnpm -F client install` する。
- 一時ファイルは `*.tmp.mjs` で作り、実行後に削除する（リポジトリを汚さない）。
