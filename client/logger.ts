/**
 * 構造化ログ出力用の軽量ロガー（SPA 配信 Node サーバ向け）
 *
 * Lambda/`server` と同じ JSON 形式で出力し、CloudWatch Logs Insights の
 * クエリ互換性を保つ。
 */

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

const SERVICE_NAME = process.env.SERVICE_NAME ?? "spa-service"
const LOG_LEVEL = (process.env.LOG_LEVEL ?? "INFO").toUpperCase() as LogLevel

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
}

function emit(level: LogLevel, message: string, fields: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[LOG_LEVEL]) return
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message,
    ...fields,
  }
  if (level === "ERROR") {
    console.error(JSON.stringify(record))
  } else if (level === "WARN") {
    console.warn(JSON.stringify(record))
  } else {
    console.log(JSON.stringify(record))
  }
}

export function createLogger(component: string) {
  const baseFields = { component }
  return {
    debug: (msg: string, fields?: Record<string, unknown>) =>
      emit("DEBUG", msg, { ...baseFields, ...fields }),
    info: (msg: string, fields?: Record<string, unknown>) =>
      emit("INFO", msg, { ...baseFields, ...fields }),
    warn: (msg: string, fields?: Record<string, unknown>) =>
      emit("WARN", msg, { ...baseFields, ...fields }),
    error: (msg: string, fields?: Record<string, unknown>) =>
      emit("ERROR", msg, { ...baseFields, ...fields }),
  }
}
