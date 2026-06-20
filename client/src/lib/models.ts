import { api } from "./api"

export interface ModelOption {
  id: string
  label: string
  description: string
}

// /api/models のレスポンスはセッション間で共通かつ不変なのでモジュールスコープにキャッシュする。
// ModelSelector とは別に、メッセージのモデルバッジ (どのモデルが回答したか) のラベル解決に使う。
let cache: ModelOption[] | null = null
let inflight: Promise<ModelOption[]> | null = null

/** モデルカタログを取得してキャッシュする。warm 用に副作用的に呼んでもよい。 */
export function loadModels(): Promise<ModelOption[]> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = api
    .getModels()
    .then((r) => {
      cache = r.models
      inflight = null
      return cache
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}

/**
 * モデル id を表示用ラベルに解決する。カタログ未ロード / 未知の id のときは id をそのまま返す。
 * 同期的に使えるよう、ロードは loadModels() で別途 warm しておくこと。
 */
export function getModelLabelSync(id: string): string {
  return cache?.find((m) => m.id === id)?.label ?? id
}
