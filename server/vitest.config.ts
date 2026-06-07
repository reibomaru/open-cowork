import { defineConfig } from "vitest/config"

// Hono API の E2E テスト。
//
// DynamoDB は docker-compose.test.yml で起動した DynamoDB Local (port 8100) を使う。
// auth は dev fallback (DEV_USER_ID + X-User-Id ヘッダ) でユーザー切替する。
//
// env はテストプロセス共通。Hono ルートはモジュールロード時に SDK Client を
// new するため、子プロセス起動前に確実に値を渡す必要がある。
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.test.ts"],
    globalSetup: ["./test/e2e/globalSetup.ts"],
    setupFiles: ["./test/e2e/setupAfterEach.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      // --- DynamoDB Local 接続 ---
      AWS_REGION: "ap-northeast-1",
      AWS_DEFAULT_REGION: "ap-northeast-1",
      AWS_ACCESS_KEY_ID: "test",
      AWS_SECRET_ACCESS_KEY: "test",
      AWS_ENDPOINT_URL_DYNAMODB: "http://localhost:8100",
      DYNAMODB_TABLE_SESSIONS: "open-cowork-sessions-test",
      DEFAULT_MODEL: "claude-sonnet-4-6-test",
      // --- auth dev fallback ---
      DEV_USER_ID: "test-user-default",
      // NODE_ENV を production 以外にして DEV_USER_ID を有効化
      NODE_ENV: "test",
      // --- ログ抑制 ---
      LOG_LEVEL: "ERROR",
    },
  },
})
