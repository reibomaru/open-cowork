import { describe, expect, it } from "vitest"
import {
  isPathInside,
  normalizeWorkingDirInput,
  resolveWorkingDirUnder,
} from "../../src/workdir-path"

const ROOT = "/home/node/workdir"

describe("isPathInside (write-deny boundary)", () => {
  it("配下 / root 自身は true", () => {
    expect(isPathInside(ROOT, `${ROOT}/foo.txt`)).toBe(true)
    expect(isPathInside(ROOT, `${ROOT}/a/b/c.md`)).toBe(true)
    expect(isPathInside(ROOT, ROOT)).toBe(true)
  })

  it("作業ディレクトリ外への絶対パスは false (= 書き込み拒否)", () => {
    expect(isPathInside(ROOT, "/home/node/workdir-other/x.txt")).toBe(false)
    expect(isPathInside(ROOT, "/etc/passwd")).toBe(false)
    expect(isPathInside(ROOT, `${ROOT}/../escape.txt`)).toBe(false)
  })
})

describe("normalizeWorkingDirInput", () => {
  it("先頭/末尾のスラッシュと空白を落とす", () => {
    expect(normalizeWorkingDirInput("  /project-a/  ")).toBe("project-a")
    expect(normalizeWorkingDirInput("project-a/sub")).toBe("project-a/sub")
  })

  it("空 / '.' は空文字 (= workdir 全体) に畳む", () => {
    expect(normalizeWorkingDirInput("")).toBe("")
    expect(normalizeWorkingDirInput("   ")).toBe("")
    expect(normalizeWorkingDirInput(".")).toBe("")
    expect(normalizeWorkingDirInput("/")).toBe("")
  })
})

describe("resolveWorkingDirUnder", () => {
  it("通常のサブディレクトリを root 配下に解決する", () => {
    expect(resolveWorkingDirUnder(ROOT, "project-a")).toEqual({
      abs: `${ROOT}/project-a`,
      rel: "project-a",
    })
    expect(resolveWorkingDirUnder(ROOT, "project-a/sub")).toEqual({
      abs: `${ROOT}/project-a/sub`,
      rel: "project-a/sub",
    })
  })

  it("root 自身 ('') は abs=root / rel='' を返す", () => {
    expect(resolveWorkingDirUnder(ROOT, "")).toEqual({ abs: ROOT, rel: "" })
  })

  it("path traversal で root の外に出るパスは null", () => {
    expect(resolveWorkingDirUnder(ROOT, "..")).toBeNull()
    expect(resolveWorkingDirUnder(ROOT, "../etc")).toBeNull()
    expect(resolveWorkingDirUnder(ROOT, "project-a/../../etc/passwd")).toBeNull()
  })

  it("内部に戻る .. は root 配下に収まれば許可される", () => {
    // project-a/../project-b は root 配下なので valid。
    expect(resolveWorkingDirUnder(ROOT, "project-a/../project-b")).toEqual({
      abs: `${ROOT}/project-b`,
      rel: "project-b",
    })
  })

  it("null 文字や長すぎるパスは null", () => {
    expect(resolveWorkingDirUnder(ROOT, "a\0b")).toBeNull()
    expect(resolveWorkingDirUnder(ROOT, "a".repeat(513))).toBeNull()
  })
})
