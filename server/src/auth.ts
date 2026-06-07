/**
 * 認証ミドルウェア (dev フォールバックのみ)
 *
 * 本リポジトリは本番デプロイ用の OIDC / JWT 検証を含めていない。
 * リクエストヘッダ `X-User-Id` か、未指定なら `DEV_USER_ID` env をそのまま userId として
 * セットする。実運用で認証基盤を導入する場合はここで JWT 検証ロジックを差し込む。
 *
 * 環境変数:
 *   DEV_USER_ID … ヘッダ未指定時のフォールバック (NODE_ENV=production では無効)
 */

import type { MiddlewareHandler } from "hono"
import { createLogger } from "./logger"

const log = createLogger("auth")

const DEV_USER_ID = process.env.NODE_ENV === "production" ? "" : (process.env.DEV_USER_ID ?? "")

/**
 * Hono context に userId を載せる。ハンドラ側で `c.get("userId")` で取り出す。
 */
declare module "hono" {
  interface ContextVariableMap {
    userId: string
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const headerUserId = c.req.header("x-user-id")
  const userId = headerUserId ?? DEV_USER_ID

  if (!userId) {
    log.warn("認証情報なし (DEV_USER_ID 未設定)")
    return c.json({ error: "Not authenticated" }, 401)
  }

  c.set("userId", userId)
  await next()
}
