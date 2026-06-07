import { describe, expect, it } from "vitest"
import type { Session } from "../../src/types"
import { userANewSession, userASessionLatest, userBSession } from "./fixtures/seedSessions"
import { getSessionRecord, seedSessions } from "./helpers/dynamodb"
import { apiFetch, createTestApp } from "./helpers/testApp"

const app = createTestApp()

describe("Hono /api/sessions/:id/messages e2e", () => {
  describe("GET messages", () => {
    it("sdkSessionId が無いセッションは [] を返す", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}/messages`, {
        userId: "user-a",
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })

    it("他人のセッションは 404 (存在情報を漏らさない)", async () => {
      await seedSessions([userBSession])

      const res = await apiFetch(app, `/api/sessions/${userBSession.id}/messages`, {
        userId: "user-a",
      })

      expect(res.status).toBe(404)
    })

    it("存在しない sessionId も 404", async () => {
      const res = await apiFetch(app, "/api/sessions/non-existent/messages", {
        userId: "user-a",
      })

      expect(res.status).toBe(404)
    })

    it("sdkSessionId はあるが transcript ファイルが存在しない場合は [] (例外を握りつぶす)", async () => {
      const sessionWithSdk: Session = {
        ...userASessionLatest,
        sdkSessionId: "sdk-non-existent-1234",
      }
      await seedSessions([sessionWithSdk])

      const res = await apiFetch(app, `/api/sessions/${sessionWithSdk.id}/messages`, {
        userId: "user-a",
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })
  })

  describe("POST message", () => {
    it("自分のセッションに送れる。userMessage と assistantMessageId が返る", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}/messages`, {
        userId: "user-a",
        method: "POST",
        body: { content: "こんにちは" },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        userMessage: { content: string; role: string; sessionId: string }
        assistantMessageId: string
      }
      expect(body.userMessage.content).toBe("こんにちは")
      expect(body.userMessage.role).toBe("user")
      expect(body.userMessage.sessionId).toBe(userASessionLatest.id)
      expect(body.assistantMessageId).toBeTruthy()
    })

    it('title が "New Session" のセッションは 1 通目の内容で自動 title 化される', async () => {
      await seedSessions([userANewSession])

      const longContent = "あ".repeat(60)
      const res = await apiFetch(app, `/api/sessions/${userANewSession.id}/messages`, {
        userId: "user-a",
        method: "POST",
        body: { content: longContent },
      })

      expect(res.status).toBe(200)

      // 50 文字 + "..." に短縮されて DynamoDB に書かれていること
      const persisted = await getSessionRecord("user-a", userANewSession.id)
      const expected = `${"あ".repeat(50)}...`
      expect(persisted?.title).toBe(expected)
    })

    it('短い content (50字以下) は "..." を付けずに title になる', async () => {
      await seedSessions([userANewSession])

      const res = await apiFetch(app, `/api/sessions/${userANewSession.id}/messages`, {
        userId: "user-a",
        method: "POST",
        body: { content: "短い質問" },
      })

      expect(res.status).toBe(200)
      const persisted = await getSessionRecord("user-a", userANewSession.id)
      expect(persisted?.title).toBe("短い質問")
    })

    it("既に title が設定されているセッションへの送信では title 上書きしない", async () => {
      const namedSession: Session = {
        ...userASessionLatest,
        title: "既存タイトル",
      }
      await seedSessions([namedSession])

      const res = await apiFetch(app, `/api/sessions/${namedSession.id}/messages`, {
        userId: "user-a",
        method: "POST",
        body: { content: "新しい質問内容" },
      })

      expect(res.status).toBe(200)
      const persisted = await getSessionRecord("user-a", namedSession.id)
      expect(persisted?.title).toBe("既存タイトル")
    })

    it("他人のセッションには送れず 404 (実データに変化なし)", async () => {
      await seedSessions([userBSession])

      const res = await apiFetch(app, `/api/sessions/${userBSession.id}/messages`, {
        userId: "user-a",
        method: "POST",
        body: { content: "侵入を試みる" },
      })

      expect(res.status).toBe(404)
      const persisted = await getSessionRecord("user-b", userBSession.id)
      expect(persisted?.title).toBe(userBSession.title)
      expect(persisted?.updatedAt).toBe(userBSession.updatedAt)
    })

    it("存在しない sessionId も 404", async () => {
      const res = await apiFetch(app, "/api/sessions/non-existent/messages", {
        userId: "user-a",
        method: "POST",
        body: { content: "x" },
      })

      expect(res.status).toBe(404)
    })

    it("content が無い不正リクエストは zod バリデーションで 400 系", async () => {
      await seedSessions([userASessionLatest])

      const res = await apiFetch(app, `/api/sessions/${userASessionLatest.id}/messages`, {
        userId: "user-a",
        method: "POST",
        body: {},
      })

      // zValidator は 400 を返す
      expect(res.status).toBe(400)
    })
  })
})
