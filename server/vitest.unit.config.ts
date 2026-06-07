import { defineConfig } from "vitest/config"

// 純粋関数 / mock SDK で完結する unit テスト用。
// e2e と違って DynamoDB Local 起動は要らないので独立 config にしている。
export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    env: {
      LOG_LEVEL: "ERROR",
    },
  },
})
