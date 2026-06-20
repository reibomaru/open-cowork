import { describe, expect, it } from "vitest"
import type { Session } from "../../src/types"
import {
  userASessionArchived,
  userASessionLatest,
  userASessionMiddle,
  userASessionOldest,
  userBSession,
} from "./fixtures/seedSessions"
import { getSessionRecord, seedSessions } from "./helpers/dynamodb"
import { apiFetch, createTestApp } from "./helpers/testApp"

const app = createTestApp()

describe("Hono /api/sessions e2e", () => {
  describe("GET /api/sessions", () => {
    it("自分の active セッションだけを updatedAt DESC で返す", async () => {
      await seedSessions([
        userASessionMiddle,
        userASessionOldest,
        userASessionLatest,
        userASessionArchived,
        userBSession,
      ])

      const res = await apiFetch(app, "/api/sessions", { userId: "user-a" })

      expect(res.status).toBe(200)
      const list = (await res.json()) as Session[]
      // archived は除外、user-b は除外、updatedAt DESC
      expect(list.map((s) => s.id)).toEqual([
        "session-a-latest",
        "session-a-middle",
        "session-a-oldest",
      ])
    })

    it("テーブルが空なら [] を返す", async () => {
      const res = await apiFetch(app, "/api/sessions", { userId: "user-a" })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it("他のユーザーのセッションが seed されていても自分の分は空", async () => {
      await seedSessions([userBSession])

      const res = await apiFetch(app, "/api/sessions", { userId: "user-a" })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })
  })

  describe("POST /api/sessions", () => {
    it("新規セッションを DynamoDB に永続化し JSON で返す", async () => {
      const res = await apiFetch(app, "/api/sessions", {
        userId: "user-a",
        method: "POST",
      })

      expect(res.status).toBe(200)
      const session = (await res.json()) as Session
      expect(session).toMatchObject({
        ownerId: "user-a",
        title: "New Session",
        status: "active",
        permissionMode: "ask",
      })
      expect(session.id).toBeTruthy()
      expect(session.createdAt).toBeGreaterThan(0)

      // DynamoDB 永続化を確認
      const record = await getSessionRecord("user-a", session.id)
      expect(record).toMatchObject({
        userId: "user-a",
        sessionId: session.id,
        ownerId: "user-a",
        title: "New Session",
      })
    })
  })

  describe("PATCH /api/sessions/:id", () => {
    it("title を更新できる", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}`, {
        userId: "user-a",
        method: "PATCH",
        body: { title: "更新後のタイトル" },
      })

      expect(res.status).toBe(200)
      const updated = (await res.json()) as Session
      expect(updated.title).toBe("更新後のタイトル")
      expect(updated.updatedAt).toBeGreaterThan(userASessionLatest.updatedAt)

      const persisted = await getSessionRecord("user-a", userASessionLatest.id)
      expect(persisted?.title).toBe("更新後のタイトル")
    })

    it("title を手動更新すると titleGenerated=true が立ち、以後の Haiku 自動要約対象から外れる", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}`, {
        userId: "user-a",
        method: "PATCH",
        body: { title: "手動タイトル" },
      })

      expect(res.status).toBe(200)
      const persisted = await getSessionRecord("user-a", userASessionLatest.id)
      expect(persisted?.titleGenerated).toBe(true)
    })

    it("title 以外の patch では titleGenerated は立たない", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}`, {
        userId: "user-a",
        method: "PATCH",
        body: { model: "gemini-2.5-flash" },
      })

      expect(res.status).toBe(200)
      const persisted = await getSessionRecord("user-a", userASessionLatest.id)
      expect(persisted?.titleGenerated).toBeUndefined()
    })

    it("status を archived に変更できる (= GET /sessions から消える)", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}`, {
        userId: "user-a",
        method: "PATCH",
        body: { status: "archived" },
      })

      expect(res.status).toBe(200)

      const listRes = await apiFetch(app, "/api/sessions", { userId: "user-a" })
      expect(await listRes.json()).toEqual([])
    })

    it("他人のセッションを更新しようとすると 404", async () => {
      await seedSessions([userBSession])

      const res = await apiFetch(app, `/api/sessions/${userBSession.id}`, {
        userId: "user-a",
        method: "PATCH",
        body: { title: "悪意ある書き換え" },
      })

      expect(res.status).toBe(404)
      // user-b 側のデータが書き換わっていないこと
      const persisted = await getSessionRecord("user-b", userBSession.id)
      expect(persisted?.title).toBe(userBSession.title)
    })

    it("存在しない sessionId は 404", async () => {
      const res = await apiFetch(app, "/api/sessions/non-existent", {
        userId: "user-a",
        method: "PATCH",
        body: { title: "x" },
      })

      expect(res.status).toBe(404)
    })
  })

  describe("DELETE /api/sessions/:id", () => {
    it("自分のセッションを削除できる", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}`, {
        userId: "user-a",
        method: "DELETE",
      })

      expect(res.status).toBe(204)
      expect(await getSessionRecord("user-a", userASessionLatest.id)).toBeNull()
    })

    it("他人のセッションは削除できず 404 (実データも残る)", async () => {
      await seedSessions([userBSession])

      const res = await apiFetch(app, `/api/sessions/${userBSession.id}`, {
        userId: "user-a",
        method: "DELETE",
      })

      expect(res.status).toBe(404)
      expect(await getSessionRecord("user-b", userBSession.id)).not.toBeNull()
    })

    it("存在しない sessionId は 404", async () => {
      const res = await apiFetch(app, "/api/sessions/non-existent", {
        userId: "user-a",
        method: "DELETE",
      })

      expect(res.status).toBe(404)
    })
  })
})
