/**
 * 構造化ログ出力用の軽量ロガー
 *
 * CloudWatch Logs Insights でフィールド検索可能な JSON 形式で出力する。
 * Lambda 側 (`infra/cdk/lambda/shared/logger.ts`) と同じ出力形式を踏襲し、
 * 運用上のクエリを統一する。
 */

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

const SERVICE_NAME = process.env.SERVICE_NAME ?? "open-cowork-server"
const LOG_LEVEL = (process.env.LOG_LEVEL ?? "INFO").toUpperCase() as LogLevel

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[LOG_LEVEL]
}

function emit(level: LogLevel, message: string, fields: Record<string, unknown>): void {
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

export function createLogger(component: string): Logger {
  const baseFields = { component }
  return {
    debug(message, fields) {
      if (!shouldLog("DEBUG")) return
      emit("DEBUG", message, { ...baseFields, ...fields })
    },
    info(message, fields) {
      if (!shouldLog("INFO")) return
      emit("INFO", message, { ...baseFields, ...fields })
    },
    warn(message, fields) {
      if (!shouldLog("WARN")) return
      emit("WARN", message, { ...baseFields, ...fields })
    },
    error(message, fields) {
      if (!shouldLog("ERROR")) return
      emit("ERROR", message, { ...baseFields, ...fields })
    },
  }
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    }
  }
  return { value: String(err) }
}
