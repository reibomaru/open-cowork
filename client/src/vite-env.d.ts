/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Docker build 時に注入される HEAD のショート SHA。未注入なら空文字。 */
  readonly VITE_GIT_COMMIT: string
  /** Docker build 時に注入される HEAD の annotated tag。無ければ空文字。 */
  readonly VITE_GIT_TAG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// mammoth のブラウザ向けプリビルド（Buffer 等のポリフィル同梱）には型定義が無い。
// 利用側で本体パッケージの型にキャストするため、ここでは any モジュールとして宣言する。
declare module "mammoth/mammoth.browser"
