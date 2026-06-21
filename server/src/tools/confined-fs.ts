import { execFileSync } from "node:child_process"
import { constants } from "node:fs"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  type BashSpawnContext,
  type EditOperations,
  type ToolDefinition,
  type WriteOperations,
  createBashToolDefinition,
  createEditToolDefinition,
  createLocalBashOperations,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { createLogger } from "../logger"
import { isPathInside } from "../workdir-path"

const log = createLogger("confined-fs")

/**
 * 作業ディレクトリ限定セッション用の edit / write / bash ツール定義を組み立てる。
 *
 * これらは built-in と同名 ("edit" / "write" / "bash") の ToolDefinition を返す。
 * createAgentSession の customTools に渡すと built-in を上書きするため、allowlist は
 * 触らず（DEFAULT_TOOLS のまま）に確定的に差し替えられる。
 *
 * - edit / write: ファイル書き込み系 operations の入口で writableRoot 配下かを検証し、
 *   外なら throw してツール失敗にする（モデルには拒否理由が見える）。read は制限しない。
 * - bash: bubblewrap が使える環境では FS 全体を read-only・作業ディレクトリだけ書込可で
 *   コマンドを実行する。使えない場合は cwd スコープのみにフォールバック（warn ログ）。
 */
export function buildConfinedTools(cwd: string, writableRoot: string): ToolDefinition[] {
  const root = resolve(writableRoot)

  const denyMessage = (p: string) =>
    `Write denied: "${p}" is outside this session's working directory (${root}). ` +
    `This session may only create or modify files under ${root}.`

  const assertWritable = (p: string): void => {
    if (!isPathInside(root, p)) {
      throw new Error(denyMessage(p))
    }
  }

  const editOperations: EditOperations = {
    // 読み取りは制限しない（編集範囲のみ縛る方針）。
    readFile: (absolutePath) => readFile(absolutePath),
    writeFile: async (absolutePath, content) => {
      assertWritable(absolutePath)
      await writeFile(absolutePath, content)
    },
    access: async (absolutePath) => {
      assertWritable(absolutePath)
      await access(absolutePath, constants.R_OK | constants.W_OK)
    },
  }

  const writeOperations: WriteOperations = {
    writeFile: async (absolutePath, content) => {
      assertWritable(absolutePath)
      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, content)
    },
    mkdir: async (dir) => {
      assertWritable(dir)
      await mkdir(dir, { recursive: true })
    },
  }

  const editDef = createEditToolDefinition(cwd, { operations: editOperations })
  const writeDef = createWriteToolDefinition(cwd, { operations: writeOperations })
  const bashDef = createBashToolDefinition(cwd, {
    operations: createLocalBashOperations(),
    spawnHook: makeBashSpawnHook(root),
  })

  return [editDef as ToolDefinition, writeDef as ToolDefinition, bashDef as ToolDefinition]
}

// bubblewrap の可用性は起動後 1 度だけ判定してキャッシュする。
let bwrapAvailable: boolean | null = null
function hasBwrap(): boolean {
  if (bwrapAvailable !== null) return bwrapAvailable
  try {
    execFileSync("bwrap", ["--version"], { stdio: "ignore" })
    bwrapAvailable = true
  } catch {
    bwrapAvailable = false
    log.warn(
      "bubblewrap (bwrap) not available; bash write-confinement falls back to cwd scoping only",
    )
  }
  return bwrapAvailable
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * bash コマンド実行直前に command を書き換えるフック。
 * bwrap があれば FS 全体を ro-bind し、作業ディレクトリだけ rw-bind して実行する。
 * これによりコマンド解析に頼らず作業ディレクトリ外への書き込みを物理的に防ぐ。
 */
function makeBashSpawnHook(root: string): (ctx: BashSpawnContext) => BashSpawnContext {
  return (ctx) => {
    if (!hasBwrap()) return ctx
    const wrapped = `exec bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --bind ${shellQuote(root)} ${shellQuote(root)} --chdir ${shellQuote(ctx.cwd)} /bin/bash -c ${shellQuote(ctx.command)}`
    return { ...ctx, command: wrapped }
  }
}
