import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// resolveServerVersion は node:fs.readFileSync を直接呼ぶので、それを mock する。
// 各テストで vi.resetModules() してから動的 import することで
// 「import 時に走る SERVER_VERSION の初期化」を独立に評価できるようにする。
const readFileSyncMock = vi.fn()

vi.mock("node:fs", () => ({
  readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
}))

beforeEach(() => {
  vi.resetModules()
  readFileSyncMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const importVersionModule = async () => {
  const mod = await import("../../src/version")
  return mod
}

describe("resolveServerVersion", () => {
  it("VERSION ファイルの内容をトリムして返す", async () => {
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("/VERSION")) return "  1.2.3  \n"
      throw new Error(`unexpected read: ${path}`)
    })

    const { resolveServerVersion, SERVER_VERSION } = await importVersionModule()

    expect(resolveServerVersion()).toBe("1.2.3")
    expect(SERVER_VERSION).toBe("1.2.3")
  })

  it("コメント行と空行はスキップして最初の有効行を返す", async () => {
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("/VERSION")) return "# comment\n\n  4.5.6\nignored\n"
      throw new Error(`unexpected read: ${path}`)
    })

    const { resolveServerVersion } = await importVersionModule()

    expect(resolveServerVersion()).toBe("4.5.6")
  })

  it("VERSION が読めない場合は package.json の version にフォールバックする", async () => {
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("/VERSION")) throw new Error("ENOENT")
      if (path.endsWith("/package.json")) return JSON.stringify({ version: "9.9.9" })
      throw new Error(`unexpected read: ${path}`)
    })

    const { resolveServerVersion } = await importVersionModule()

    expect(resolveServerVersion()).toBe("9.9.9")
  })

  it("VERSION も package.json も読めない場合は 'unknown' を返す", async () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT")
    })

    const { resolveServerVersion } = await importVersionModule()

    expect(resolveServerVersion()).toBe("unknown")
  })

  it("package.json に version がない場合も 'unknown' を返す", async () => {
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("/VERSION")) throw new Error("ENOENT")
      if (path.endsWith("/package.json")) return JSON.stringify({ name: "no-version" })
      throw new Error(`unexpected read: ${path}`)
    })

    const { resolveServerVersion } = await importVersionModule()

    expect(resolveServerVersion()).toBe("unknown")
  })
})
