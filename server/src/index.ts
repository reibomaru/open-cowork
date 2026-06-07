import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { authMiddleware } from "./auth"
import { createLogger } from "./logger"
import routes, { USE_MOCK } from "./routes"

// docker-compose や entrypoint で WORKDIR_USER を渡したときは Node 起動後にそちらへ
// chdir する。artifact-store / claude-agent の writableRoot 解決を揃えつつ、起動
// コマンド (`node --import tsx/esm`) の node_modules 解決は WORKDIR で維持する。
if (process.env.WORKDIR_USER) {
  process.chdir(process.env.WORKDIR_USER)
}

const log = createLogger("index")

// 許可オリジンのカンマ区切りリスト。未指定の場合は同一オリジンのみ。
// 例: ALLOWED_ORIGINS="http://localhost:5173"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const app = new Hono()
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (ALLOWED_ORIGINS.length === 0) return null // 同一オリジンのみ許可
      return ALLOWED_ORIGINS.includes(origin) ? origin : null
    },
    credentials: true,
  }),
)
app.get("/health", (c) => c.text("ok"))

// /api/* に着信した全リクエストをログ。auth より前 (どこで弾かれたか分かるように)
app.use("/api/*", async (c, next) => {
  const start = Date.now()
  log.info("api:req", {
    method: c.req.method,
    path: c.req.path,
    userIdHeader: c.req.header("x-user-id") ?? null,
  })
  await next()
  log.info("api:res", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  })
})

app.use("/api/*", authMiddleware)

app.get("/api/me", (c) => {
  return c.json({ userId: c.get("userId") })
})

app.route("/", routes)

const PORT = Number(process.env.PORT) || 3000

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  const mode = USE_MOCK ? "MOCK" : "PI-CODING-AGENT"
  log.info("Server started", { port: PORT, mode })
})

function shutdown() {
  server.close()
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
