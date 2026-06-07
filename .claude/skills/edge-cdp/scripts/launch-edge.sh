#!/usr/bin/env bash
# Microsoft Edge を Chrome DevTools Protocol (CDP) 有効状態で起動する。
# 既に起動済みなら何もしない（idempotent）。
#
# 注意:
# - Chrome は触らない（業務利用中のため）
# - 専用 user-data-dir を使い、ユーザーの普段使い Edge プロファイルも汚さない
# - ポートは引数で上書き可。デフォルト 9222

set -euo pipefail

PORT="${1:-9222}"
EDGE_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
PROFILE_DIR="${EDGE_CDP_PROFILE_DIR:-$HOME/.claude-edge-cdp-profile}"
LOG_FILE="${EDGE_CDP_LOG:-/tmp/edge-cdp.log}"

if [[ ! -x "$EDGE_BIN" ]]; then
  echo "ERROR: Microsoft Edge not found at $EDGE_BIN" >&2
  echo "Install Microsoft Edge from https://www.microsoft.com/edge" >&2
  exit 1
fi

# 既に CDP が応答するなら何もしない
if curl -s -m 2 "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
  echo "Edge CDP already running on port ${PORT}"
  curl -s "http://localhost:${PORT}/json/version" | jq -r '"browser=\(.Browser)  ws=\(.webSocketDebuggerUrl)"'
  exit 0
fi

mkdir -p "$PROFILE_DIR"

# バックグラウンド起動
"$EDGE_BIN" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-features=ChromeWhatsNewUI,EdgeFirstRunRedesign \
  >"$LOG_FILE" 2>&1 &

EDGE_PID=$!
echo "Edge launched: PID=$EDGE_PID  profile=$PROFILE_DIR  port=$PORT"

# ポート応答待ち（最大 15 秒）
for _ in $(seq 1 30); do
  if curl -s -m 1 "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
    echo "CDP ready on port ${PORT}"
    curl -s "http://localhost:${PORT}/json/version" | jq -r '"browser=\(.Browser)"'
    exit 0
  fi
  sleep 0.5
done

echo "ERROR: Edge launched but CDP port ${PORT} did not respond within 15s" >&2
echo "Log: $LOG_FILE" >&2
exit 1
