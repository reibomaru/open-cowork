#!/usr/bin/env bash
# cowork の開発サーバー (pnpm dev = client + server) を冪等に起動する。
#
# - 使用ポート (デフォルト 3000, 5173) で動いている既存プロセスを停止してから起動する。
# - すでに目的のサーバーが起動済みでも安全に再実行できる（古いプロセスを kill して上げ直す）。
# - バックグラウンドで起動し、ログを LOG_FILE に書き出して即座に return する。
#
# 環境変数:
#   DEV_PORTS   解放対象ポート (スペース区切り)。デフォルト "3000 5173"
#   LOG_FILE    起動ログの出力先。デフォルト /tmp/cowork-dev.log
#   READY_WAIT  起動確認の最大待機秒数。デフォルト 30

set -euo pipefail

PORTS="${DEV_PORTS:-3000 5173}"
LOG_FILE="${LOG_FILE:-/tmp/cowork-dev.log}"
READY_WAIT="${READY_WAIT:-30}"

# リポジトリルートへ移動（スクリプトの場所から辿る）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/pnpm-workspace.yaml" ]]; then
  echo "ERROR: pnpm-workspace.yaml が $ROOT に見つかりません。リポジトリルートを特定できませんでした。" >&2
  exit 1
fi

# 1. ポート競合を解消
for port in $PORTS; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "port $port を使用中のプロセスを停止します: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    # まだ残っていれば強制終了
    pids="$(lsof -ti :"$port" 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
done

# 2. バックグラウンドで起動
echo "pnpm dev を起動します (root=$ROOT, log=$LOG_FILE)"
: > "$LOG_FILE"
nohup pnpm dev >"$LOG_FILE" 2>&1 &
DEV_PID=$!
echo "pnpm dev launched: PID=$DEV_PID"

# 3. 起動確認（ログに Vite / server の起動が出るか、ポートが応答するまで待つ）
deadline=$(( $(date +%s) + READY_WAIT ))
while [[ "$(date +%s)" -lt "$deadline" ]]; do
  if grep -qiE 'localhost:5173|ready in|Local:.*5173' "$LOG_FILE" 2>/dev/null; then
    echo "client (Vite) 起動を確認しました"
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "ERROR: pnpm dev が起動直後に終了しました。ログを確認してください: $LOG_FILE" >&2
    tail -n 30 "$LOG_FILE" >&2 || true
    exit 1
  fi
  sleep 1
done

echo
echo "起動ログ末尾:"
tail -n 15 "$LOG_FILE" || true
echo
echo "URL:"
echo "  client: http://localhost:5173"
echo "  server: http://localhost:3000"
echo "ログ追跡: tail -f $LOG_FILE"
