import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { createLogger, serializeError } from "./logger"

const log = createLogger("skill-store")

// 個人用 skill の保存先。pi-coding-agent の DefaultResourceLoader は
// `<cwd>/.pi/skills/` と `<cwd>/.agents/skills/` を project scope として自動探索する。
// 優先順位:
//   1. SKILLS_DIR が明示されていればそれを使う
//   2. WORKDIR_USER / CLAUDE_CWD 配下の `.pi/skills/`
//   3. process.cwd() 配下の同じパス
const SKILLS_DIR = resolve(
  process.env.SKILLS_DIR ??
    join(process.env.WORKDIR_USER ?? process.env.CLAUDE_CWD ?? process.cwd(), ".pi", "skills"),
)

// Slash command (prompt template) として呼び出せるようにするため、skill と同名の md を
// project scope の `.pi/prompts/` にも書き出す。
// pi-coding-agent は <cwd>/.pi/prompts/<name>.md を `/name` で展開する。
const COMMANDS_DIR = resolve(
  process.env.COMMANDS_DIR ??
    join(process.env.WORKDIR_USER ?? process.env.CLAUDE_CWD ?? process.cwd(), ".pi", "prompts"),
)

// 共通 skill (RO で配布) のパス。docs/skills-architecture.md 参照。
// 実体はマウント済みのディレクトリ直下の `skills/`。pi 側は --skill <path> 相当で
// claude-agent.ts の skillPaths オプションに渡される。
const COMMON_SKILLS_DIR = process.env.WIZ_CLAUDE_COMMON_PLUGIN_PATH
  ? join(process.env.WIZ_CLAUDE_COMMON_PLUGIN_PATH, "skills")
  : null

// 個人用 skill 1 件あたりの最大バイト数 (frontmatter 含む全体)。
export const MAX_SKILL_BYTES = Number(process.env.SKILL_MAX_BYTES ?? 256 * 1024)

// ユーザーあたりの skill 数上限。
export const MAX_SKILLS_PER_USER = Number(process.env.MAX_SKILLS_PER_USER ?? 50)

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/
const RESERVED_NAMES = new Set(["claude-plugin", ".claude-plugin", "_", ".", ".."])

const DESCRIPTION_MIN = 16
const DESCRIPTION_MAX = 500

export type CreatedBy = "agent" | "user" | "unknown"

export interface PersonalSkill {
  name: string
  description: string
  body: string
  createdAt: number
  updatedAt: number
  createdBy: CreatedBy
  /** SKILL.md 以外のファイル (references/, scripts/ など) があるか */
  hasAttachments: boolean
}

export interface SkillSummary {
  name: string
  description: string
  createdAt: number
  updatedAt: number
  createdBy: CreatedBy
  hasAttachments: boolean
}

export interface CommonSkillSummary {
  name: string
  description: string
}

export class SkillError extends Error {
  readonly status: number
  readonly code: string
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = "SkillError"
    this.code = code
    this.status = status
  }
}

function assertValidName(name: string): void {
  if (!NAME_REGEX.test(name)) {
    throw new SkillError(
      "invalid_name",
      "name must be 2-63 chars of lowercase letters, digits or hyphens",
      400,
    )
  }
  if (RESERVED_NAMES.has(name)) {
    throw new SkillError("reserved_name", `name "${name}" is reserved`, 400)
  }
}

function assertValidDescription(description: string): void {
  const trimmed = description.trim()
  if (trimmed.length === 0) {
    throw new SkillError("description_required", "description is required", 400)
  }
  if (trimmed.length < DESCRIPTION_MIN || trimmed.length > DESCRIPTION_MAX) {
    throw new SkillError(
      "description_length",
      `description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} characters`,
      400,
    )
  }
}

// resolved path が SKILLS_DIR 配下であることを assert。
function resolveSkillDir(name: string): string {
  assertValidName(name)
  const target = resolve(join(SKILLS_DIR, name))
  if (target !== join(SKILLS_DIR, name) || !target.startsWith(`${SKILLS_DIR}${sep}`)) {
    // path traversal の最終ガード (assertValidName で弾けるはずだが念のため)
    throw new SkillError("invalid_name", "invalid skill path", 400)
  }
  return target
}

interface ParsedFrontmatter {
  data: Record<string, string>
  body: string
}

// SKILL.md の frontmatter は単純な key: value 中心なので自前パーサで十分。
// 対応する形式:
//   key: value             // 単一行
//   key: |                 // リテラルブロック (改行保持)
//     line 1
//     line 2
//   key: >                 // 折りたたみブロック (改行をスペースに)
//     line 1
//     line 2
// 値がクオートされていれば外す。それ以外はそのまま使う。
function parseFrontmatter(raw: string): ParsedFrontmatter {
  // 先頭 `---\n` ... `\n---\n` を切り出す。CRLF は LF に正規化してから処理。
  const normalized = raw.replace(/\r\n/g, "\n")
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return { data: {}, body: normalized }
  }
  const fmText = match[1]
  const body = match[2]
  const data: Record<string, string> = {}
  const lines = fmText.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") {
      i += 1
      continue
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) {
      i += 1
      continue
    }
    const key = kv[1]
    let value = kv[2]
    if (value === "|" || value === ">") {
      const folded = value === ">"
      const collected: string[] = []
      i += 1
      while (i < lines.length) {
        const next = lines[i]
        if (/^\s+/.test(next) || next === "") {
          collected.push(next.replace(/^\s{0,4}/, ""))
          i += 1
        } else {
          break
        }
      }
      value = folded ? collected.join(" ").trim() : collected.join("\n").trim()
    } else {
      value = stripQuotes(value).trim()
      i += 1
    }
    data[key] = value
  }
  return { data, body }
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0]
    const last = s[s.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1)
    }
  }
  return s
}

function buildFrontmatter(fields: {
  name: string
  description: string
  createdBy: CreatedBy
}): string {
  // description は改行が含まれる可能性があるためリテラルブロック (`|`) で書き出す。
  const lines: string[] = []
  lines.push("---")
  lines.push(`name: ${fields.name}`)
  const descLines = fields.description.split("\n")
  if (descLines.length === 1) {
    // 単一行は inline で良いが、特殊文字 (:, #, [, {) が含まれるとパース崩れ
    // のリスクがあるため安全側でブロック化する。
    lines.push("description: |")
    lines.push(`  ${descLines[0]}`)
  } else {
    lines.push("description: |")
    for (const l of descLines) {
      lines.push(`  ${l}`)
    }
  }
  if (fields.createdBy !== "unknown") {
    lines.push(`createdBy: ${fields.createdBy}`)
  }
  lines.push("---")
  return lines.join("\n")
}

function normalizeCreatedBy(value: string | undefined): CreatedBy {
  if (value === "agent" || value === "user") return value
  return "unknown"
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }
}

async function hasAttachmentFiles(skillDir: string): Promise<boolean> {
  const entries = await safeReaddir(skillDir)
  return entries.some((e) => e !== "SKILL.md")
}

async function readSkillFromDir(name: string, skillDir: string): Promise<PersonalSkill | null> {
  const skillFile = join(skillDir, "SKILL.md")
  let buf: Buffer
  try {
    buf = await readFile(skillFile)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
  const raw = buf.toString("utf8")
  const { data, body } = parseFrontmatter(raw)
  const st = await stat(skillFile)
  const hasAttachments = await hasAttachmentFiles(skillDir)
  return {
    name,
    description: data.description ?? "",
    body: body.replace(/^\n+/, ""),
    createdAt: st.birthtimeMs || st.mtimeMs,
    updatedAt: st.mtimeMs,
    createdBy: normalizeCreatedBy(data.createdBy),
    hasAttachments,
  }
}

async function listPersonalSkillNames(): Promise<string[]> {
  const entries = await safeReaddir(SKILLS_DIR)
  const result: string[] = []
  for (const entry of entries) {
    if (!NAME_REGEX.test(entry)) continue
    try {
      const st = await stat(join(SKILLS_DIR, entry))
      if (st.isDirectory()) result.push(entry)
    } catch {
      // 列挙中に消えた等は無視
    }
  }
  return result
}

async function writeSkillAtomic(name: string, content: string): Promise<void> {
  const skillDir = resolveSkillDir(name)
  await mkdir(skillDir, { recursive: true })
  const target = join(skillDir, "SKILL.md")
  const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await writeFile(tmp, content, "utf8")
  await rename(tmp, target)
}

// `create()` の existence / 件数チェックと書き込みの間にレースがあると
// (a) 同名 2 並行 create で後勝ち上書き、(b) MAX_SKILLS_PER_USER の超過、を許してしまう。
// プロセス内では Promise queue で create を直列化することで両方を防ぐ。
// (multi-instance scale-out 時は外部 lock が必要だが Phase 1 は単一インスタンス前提)
let createSerial: Promise<unknown> = Promise.resolve()
function withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = createSerial.then(fn, fn)
  // 失敗しても後続の create をブロックしないように rejection は握りつぶす。
  createSerial = next.catch(() => {})
  return next
}

// `.claude/commands/<name>.md` を skill と同期して書き出す。
// 失敗してもメインの skill 書き込みは成功しているため、ログだけ出して握りつぶす。
async function writeCommandAtomic(name: string, description: string, body: string): Promise<void> {
  if (!NAME_REGEX.test(name)) return
  const target = resolve(join(COMMANDS_DIR, `${name}.md`))
  if (!target.startsWith(`${COMMANDS_DIR}${sep}`)) return
  try {
    await mkdir(COMMANDS_DIR, { recursive: true })
    // description は frontmatter で quote する必要があるため、簡易エスケープ:
    // - 改行は半角スペースに畳む (slash command の description は 1 行想定)
    // - ダブルクォートを backslash でエスケープ
    const desc = description.replace(/\r?\n/g, " ").trim().replace(/"/g, '\\"')
    const content = `---\ndescription: "${desc}"\n---\n\n${body.replace(/^\n+/, "")}`
    const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await writeFile(tmp, content, "utf8")
    await rename(tmp, target)
  } catch (err) {
    log.warn("command sync failed", { name, error: serializeError(err) })
  }
}

async function deleteCommand(name: string): Promise<void> {
  if (!NAME_REGEX.test(name)) return
  const target = resolve(join(COMMANDS_DIR, `${name}.md`))
  if (!target.startsWith(`${COMMANDS_DIR}${sep}`)) return
  try {
    await rm(target, { force: true })
  } catch (err) {
    log.warn("command delete failed", { name, error: serializeError(err) })
  }
}

export const skillStore = {
  getBaseDir(): string {
    return SKILLS_DIR
  },
  getCommonDir(): string | null {
    return COMMON_SKILLS_DIR
  },

  async list(): Promise<SkillSummary[]> {
    const names = await listPersonalSkillNames()
    const result: SkillSummary[] = []
    for (const name of names) {
      const skill = await readSkillFromDir(name, join(SKILLS_DIR, name))
      if (!skill) continue
      result.push({
        name: skill.name,
        description: skill.description,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
        createdBy: skill.createdBy,
        hasAttachments: skill.hasAttachments,
      })
    }
    result.sort((a, b) => b.updatedAt - a.updatedAt)
    return result
  },

  async get(name: string): Promise<PersonalSkill | null> {
    let skillDir: string
    try {
      skillDir = resolveSkillDir(name)
    } catch (err) {
      if (err instanceof SkillError) return null
      throw err
    }
    return readSkillFromDir(name, skillDir)
  },

  async create(input: {
    name: string
    description: string
    body: string
    createdBy?: CreatedBy
  }): Promise<PersonalSkill> {
    assertValidName(input.name)
    assertValidDescription(input.description)
    const createdBy = input.createdBy ?? "user"

    const fm = buildFrontmatter({
      name: input.name,
      description: input.description.trim(),
      createdBy,
    })
    const fullContent = `${fm}\n\n${input.body.replace(/^\n+/, "")}`
    const byteLen = Buffer.byteLength(fullContent, "utf8")
    if (byteLen > MAX_SKILL_BYTES) {
      throw new SkillError(
        "too_large",
        `skill too large (max ${Math.floor(MAX_SKILL_BYTES / 1024)}KB)`,
        413,
      )
    }

    // existence / 件数チェックと writeSkillAtomic の間のレースを防ぐため
    // プロセス内で create を直列化する (TOCTOU 対策)。
    return withCreateLock(async () => {
      const existing = await listPersonalSkillNames()
      if (existing.includes(input.name)) {
        throw new SkillError("already_exists", `skill "${input.name}" already exists`, 409)
      }
      if (existing.length >= MAX_SKILLS_PER_USER) {
        throw new SkillError(
          "too_many_skills",
          `reached the maximum number of skills (${MAX_SKILLS_PER_USER})`,
          429,
        )
      }

      await writeSkillAtomic(input.name, fullContent)
      await writeCommandAtomic(input.name, input.description.trim(), input.body)
      log.info("skill created", { name: input.name, createdBy })
      const skill = await readSkillFromDir(input.name, join(SKILLS_DIR, input.name))
      if (!skill) throw new SkillError("internal", "failed to read created skill", 500)
      return skill
    })
  },

  async update(name: string, input: { description: string; body: string }): Promise<PersonalSkill> {
    assertValidName(name)
    assertValidDescription(input.description)

    const skillDir = resolveSkillDir(name)
    const existing = await readSkillFromDir(name, skillDir)
    if (!existing) {
      throw new SkillError("not_found", `skill "${name}" not found`, 404)
    }

    // createdBy は維持 (passthrough)。frontmatter の他キーは Phase 1 では落とす
    // (allowed-tools 等の拡張対応は Phase 2)。
    const fm = buildFrontmatter({
      name,
      description: input.description.trim(),
      createdBy: existing.createdBy,
    })
    const fullContent = `${fm}\n\n${input.body.replace(/^\n+/, "")}`
    const byteLen = Buffer.byteLength(fullContent, "utf8")
    if (byteLen > MAX_SKILL_BYTES) {
      throw new SkillError(
        "too_large",
        `skill too large (max ${Math.floor(MAX_SKILL_BYTES / 1024)}KB)`,
        413,
      )
    }

    await writeSkillAtomic(name, fullContent)
    await writeCommandAtomic(name, input.description.trim(), input.body)
    log.info("skill updated", { name })
    const updated = await readSkillFromDir(name, skillDir)
    if (!updated) throw new SkillError("internal", "failed to read updated skill", 500)
    return updated
  },

  async delete(name: string): Promise<boolean> {
    let skillDir: string
    try {
      skillDir = resolveSkillDir(name)
    } catch (err) {
      if (err instanceof SkillError) return false
      throw err
    }
    try {
      await stat(skillDir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
      throw err
    }
    // path traversal の最終ガード。resolveSkillDir で弾けているが念のため再確認。
    if (dirname(skillDir) !== SKILLS_DIR) {
      log.warn("skill delete: refused due to unexpected parent", { skillDir })
      return false
    }
    try {
      await rm(skillDir, { recursive: true, force: true })
      await deleteCommand(name)
      log.info("skill deleted", { name })
      return true
    } catch (err) {
      log.error("skill delete failed", { name, error: serializeError(err) })
      return false
    }
  },

  async listCommon(): Promise<CommonSkillSummary[]> {
    if (!COMMON_SKILLS_DIR) return []
    const entries = await safeReaddir(COMMON_SKILLS_DIR)
    const result: CommonSkillSummary[] = []
    for (const entry of entries) {
      const skillDir = join(COMMON_SKILLS_DIR, entry)
      try {
        const st = await stat(skillDir)
        if (!st.isDirectory()) continue
      } catch {
        continue
      }
      const skillFile = join(skillDir, "SKILL.md")
      let raw: string
      try {
        raw = (await readFile(skillFile)).toString("utf8")
      } catch {
        continue
      }
      const { data } = parseFrontmatter(raw)
      result.push({
        name: entry,
        description: data.description ?? "",
      })
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
    return result
  },
}

// Internal helpers exported for unit tests.
export const __test__ = {
  parseFrontmatter,
  buildFrontmatter,
  NAME_REGEX,
}
