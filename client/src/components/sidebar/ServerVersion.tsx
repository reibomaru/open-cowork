import { useT } from "../../i18n"

/**
 * Vite build 時に焼き込んだ git バージョンを表示する。
 * - annotated tag が打たれた HEAD のビルド: tag (例: v1.2.3)
 * - それ以外: short SHA (例: abc1234)
 * - tag/commit いずれも空 (ローカル `vite dev` 等): unknown 表記
 *
 * 値は CI で `VITE_GIT_TAG` / `VITE_GIT_COMMIT` env 経由で渡す想定。
 */
export function ServerVersion() {
  const t = useT()
  const tag = import.meta.env.VITE_GIT_TAG
  const commit = import.meta.env.VITE_GIT_COMMIT
  const value = tag || commit || t("sidebar.versionUnknown")

  return (
    <div className="text-[10px] text-secondary/70 leading-none">
      {t("sidebar.versionLabel")}: {value}
    </div>
  )
}
