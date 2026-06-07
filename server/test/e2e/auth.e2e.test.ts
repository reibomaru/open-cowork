import { describe, expect, it } from "vitest"
import { userASessionLatest, userBSession } from "./fixtures/seedSessions"
import { seedSessions } from "./helpers/dynamodb"
import { apiFetch, createTestApp } from "./helpers/testApp"

const app = createTestApp()

describe("Hono auth e2e", () => {
  it("X-User-Id ヘッダで userId を切り替えできる", async () => {
    await seedSessions([userASessionLatest, userBSession])

    const resA = await apiFetch(app, "/api/sessions", { userId: "user-a" })
    expect(resA.status).toBe(200)
    expect(((await resA.json()) as { id: string }[]).map((s) => s.id)).toEqual(["session-a-latest"])

    const resB = await apiFetch(app, "/api/sessions", { userId: "user-b" })
    expect(resB.status).toBe(200)
    expect(((await resB.json()) as { id: string }[]).map((s) => s.id)).toEqual(["session-b-1"])
  })

  it("X-User-Id を付けないと DEV_USER_ID にフォールバック", async () => {
    // DEV_USER_ID="test-user-default" のセッションを作る
    await seedSessions([{ ...userASessionLatest, ownerId: "test-user-default" }])

    const res = await apiFetch(app, "/api/sessions", { userId: null })

    expect(res.status).toBe(200)
    expect(((await res.json()) as { ownerId: string }[]).map((s) => s.ownerId)).toEqual([
      "test-user-default",
    ])
  })

  it("認証ミドルウェアの対象外パス (/health) は X-User-Id 無しでも通る", async () => {
    const res = await app.fetch(new Request("http://test.local/health"))

    // /health は 404 (testApp に登録していない) — 401 で弾かれないことを確認する。
    expect(res.status).toBe(404)
  })
})
