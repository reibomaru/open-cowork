import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createLogger } from "./logger"

const log = createLogger("version")

const FALLBACK_VERSION = "unknown"

// `server/VERSION` と `server/package.json` を src/ から相対で解決する。
// import.meta.url 起点なので process.cwd() の差し替え (WORKDIR_USER) に影響されない。
const VERSION_FILE_URL = new URL("../VERSION", import.meta.url)
const PACKAGE_JSON_URL = new URL("../package.json", import.meta.url)

function tryReadVersionFile(): string | null {
  try {
    const raw = readFileSync(fileURLToPath(VERSION_FILE_URL), "utf8")
    const line = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#"))
    return line ?? null
  } catch {
    return null
  }
}

function tryReadPackageJsonVersion(): string | null {
  try {
    const raw = readFileSync(fileURLToPath(PACKAGE_JSON_URL), "utf8")
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version
    }
    return null
  } catch {
    return null
  }
}

export function resolveServerVersion(): string {
  const fromFile = tryReadVersionFile()
  if (fromFile) return fromFile
  const fromPackage = tryReadPackageJsonVersion()
  if (fromPackage) {
    log.warn("VERSION file not found; falling back to package.json", { version: fromPackage })
    return fromPackage
  }
  log.warn("VERSION file and package.json both unreadable; returning fallback")
  return FALLBACK_VERSION
}

// 起動時に 1 回だけ解決し、以降は参照だけにする (ファイルは immutable 前提)。
export const SERVER_VERSION = resolveServerVersion()
