# dev-server: ポートと環境変数の詳細

## デフォルトポート

| サービス | ポート | 備考 |
|----------|--------|------|
| Server (Hono) | 3000 | `process.env.PORT` で変更可 |
| Client (Vite) | 5173 | 競合時は Vite が自動で別ポートを使う |

`pnpm dev` はルートの workspace スクリプトで client と server を並行起動する。

## スクリプトの環境変数

`scripts/start-dev.sh` は以下の環境変数で挙動を変えられる。

| 変数 | デフォルト | 用途 |
|------|-----------|------|
| `DEV_PORTS` | `"3000 5173"` | 起動前に解放するポート（スペース区切り）。 |
| `LOG_FILE` | `/tmp/cowork-dev.log` | 起動ログの出力先。`tail -f` で追跡できる。 |
| `READY_WAIT` | `30` | client 起動を待つ最大秒数。 |

例: server のポートを変えて起動する場合

```bash
PORT=4000 DEV_PORTS="4000 5173" .claude/skills/dev-server/scripts/start-dev.sh
```

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `EADDRINUSE` が出る | 解放対象ポートに別プロセスがいる。`DEV_PORTS` に該当ポートを追加して再実行。 |
| すぐに pnpm dev が落ちる | `LOG_FILE`（既定 `/tmp/cowork-dev.log`）末尾を確認。依存未インストールなら `pnpm install`。 |
| client が 5173 以外で立つ | 5173 が別用途で使用中。Vite が自動で +1 する。ログの `Local:` 行で実ポートを確認。 |
| ポートは解放されたが応答しない | `READY_WAIT` を伸ばす（初回ビルドが重い場合）。 |

## 補足

- Docker Compose 上の server（`docker-compose.yml` の `server` サービス）とは別物。本スキルはホスト上のローカル開発サーバー (`pnpm dev`) を対象とする。
- 複数の git worktree で並行起動するとポートが衝突する。worktree ごとに `DEV_PORTS` / `PORT` をずらすこと。
