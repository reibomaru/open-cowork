import { relative, resolve } from "node:path"

/**
 * 絶対パス `p` が `root` (それ自身を含む) の配下にあるかを判定する。
 * 作業ディレクトリ限定セッションの「書き込み許可境界」と
 * resolveWorkingDirUnder の traversal 防御の両方で共有する。
 */
export function isPathInside(root: string, p: string): boolean {
  const rootAbs = resolve(root)
  const abs = resolve(p)
  return abs === rootAbs || abs.startsWith(`${rootAbs}/`)
}

/**
 * 作業ディレクトリ用の相対パス入力を正規化する。
 * 先頭/末尾のスラッシュ・空白を落とし、空 / "." は "" (= workdir 全体) に畳む。
 */
export function normalizeWorkingDirInput(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "")
  return trimmed === "." ? "" : trimmed
}

/**
 * `root` 配下に解決される作業ディレクトリの相対パスを検証する。
 * 不正 (path traversal で root の外に出る / null 文字 / 長すぎる) なら null。
 * `/api/files/content` と同じ「resolve 後に root 配下か」防御を流用している。
 *
 * 返す rel は root からの正規化済み相対パス (root 自身なら "")。
 */
export function resolveWorkingDirUnder(
  root: string,
  rel: string,
): { abs: string; rel: string } | null {
  if (rel.length > 512 || rel.includes("\0")) return null
  const rootAbs = resolve(root)
  const abs = resolve(rootAbs, rel)
  if (!isPathInside(rootAbs, abs)) return null
  return { abs, rel: relative(rootAbs, abs) }
}
