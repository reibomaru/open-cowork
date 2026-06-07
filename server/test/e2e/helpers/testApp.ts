import { Hono } from "hono"
import { authMiddleware } from "../../../src/auth"
import routes from "../../../src/routes"

/**
 * テスト用 Hono アプリを構築する。
 *
 * 本番の `src/index.ts` は WebSocket / シャットダウンハンドラまで含むので、
 * E2E では HTTP ルートと認証ミドルウェアだけ載せた薄い app を別途組む。
 * SPA からの実リクエストと同じ経路 (auth → routes) を通る。
 *
 * リクエスト発行は `app.fetch(new Request(...))` で HTTP サーバを介さず叩く。
 */
export function createTestApp() {
  const app = new Hono()
  app.use("/api/*", authMiddleware)
  app.route("/", routes)
  return app
}

/**
 * 指定 userId として GET リクエストを発行する。
 * dev fallback の X-User-Id ヘッダで userId を切替える。
 */
export interface FetchOptions {
  /** X-User-Id ヘッダで指定する userId。`null` を渡すとヘッダ自体を付けず DEV_USER_ID にフォールバックさせる。 */
  userId?: string | null
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

/**
 * テスト用の fetch ラッパ。X-User-Id ヘッダ + JSON ボディを自動で付ける。
 * userId に明示的に `null` を渡すと X-User-Id を付けない (DEV_USER_ID にフォールバックする)。
 * userId 省略時は `"test-user-default"` を使う。
 */
export async function apiFetch(
  app: ReturnType<typeof createTestApp>,
  path: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { userId = "test-user-default", method = "GET", body, headers = {} } = options

  // Content-Type は body がある時だけ付ける。Node 22 + undici では
  // Content-Type: application/json + 空 body だと Hono 内部の body 解析が
  // 400 を返すことがあるため。
  const finalHeaders: Record<string, string> = { ...headers }
  if (body !== undefined) {
    finalHeaders["content-type"] ??= "application/json"
  }
  if (userId !== null) {
    finalHeaders["x-user-id"] = userId
  }

  const init: RequestInit = {
    method,
    headers: finalHeaders,
  }
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body)
  }

  return await app.fetch(new Request(`http://test.local${path}`, init))
}
