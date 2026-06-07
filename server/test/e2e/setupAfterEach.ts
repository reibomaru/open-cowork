import { beforeEach } from "vitest"
import { truncateSessions } from "./helpers/dynamodb"

// 各テストの前にテーブルを空にする。seed が必要なテストは自身で seedSessions() を呼ぶ。
beforeEach(async () => {
  await truncateSessions()
})
