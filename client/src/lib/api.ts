import type { ModelId } from "@server/models"
import type { AppType } from "@server/routes"
import { hc } from "hono/client"
import { useAuthStore } from "../store/auth-store"

const customFetch: typeof fetch = (input, init) => {
  const { userId } = useAuthStore.getState()
  const headers = new Headers(init?.headers)
  // server 側の authMiddleware が X-User-Id を userId として採用する。
  if (userId) {
    headers.set("X-User-Id", userId)
  }
  return fetch(input, { ...init, headers })
}

const client = hc<AppType>(window.location.origin, { fetch: customFetch })

export const api = {
  getSessions: async () => {
    const res = await client.api.sessions.$get()
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  // セッション単体取得。usage 累計を含む完全な Session が返る。
  // 一覧 (getSessions) は LSI 経由で usage を含まないため、累計表示にはこちらを使う。
  getSession: async (id: string) => {
    const res = await client.api.sessions[":id"].$get({ param: { id } })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  createSession: async (model?: ModelId) => {
    const res = await client.api.sessions.$post({
      json: model ? { model } : {},
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  updateSession: async (
    id: string,
    data: {
      title?: string
      status?: "active" | "archived"
      model?: ModelId
      permissionMode?: string
    },
  ) => {
    const res = await client.api.sessions[":id"].$patch({
      param: { id },
      json: data,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  getModels: async () => {
    const res = await client.api.models.$get()
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  getVersion: async () => {
    const res = await client.api.version.$get()
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  deleteSession: async (id: string) => {
    const res = await client.api.sessions[":id"].$delete({
      param: { id },
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
  },
  getMessages: async (sessionId: string) => {
    const res = await client.api.sessions[":id"].messages.$get({
      param: { id: sessionId },
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  sendMessage: async (sessionId: string, content: string, attachedFileIds?: string[]) => {
    const res = await client.api.sessions[":id"].messages.$post({
      param: { id: sessionId },
      json: {
        content,
        ...(attachedFileIds && attachedFileIds.length > 0 ? { attachedFileIds } : {}),
      },
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },

  // 添付ファイルアップロード。
  // 戻り値の id を sendMessage の attachedFileIds に渡すとエージェントが Read 可能になる。
  uploadFile: async (sessionId: string, file: File): Promise<AttachedFileInfo> => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/files`, {
      method: "POST",
      headers: customFetchHeaders(),
      body: form,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new UploadApiError(res.status, text || `upload failed: ${res.status}`)
    }
    return res.json() as Promise<AttachedFileInfo>
  },
  // session に紐付かないアップロード。working directory タブからの直接アップロードで使う。
  // 保存先・制限は uploadFile と同じだが、session 所有権チェックを介在させない。
  uploadUserFile: async (file: File): Promise<AttachedFileInfo> => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: customFetchHeaders(),
      body: form,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new UploadApiError(res.status, text || `upload failed: ${res.status}`)
    }
    return res.json() as Promise<AttachedFileInfo>
  },
  // セッション添付ファイルの実体を fetch して Blob URL にして返す。
  // img の src に直接 /api/... を使うと userId ヘッダが付かない経路で 401 になる
  // ケースがあるため、Auth ヘッダ付きで fetch → Object URL の経路を使う。
  fetchFileBlobUrl: async (sessionId: string, fileId: string): Promise<string> => {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`,
      { method: "GET", headers: customFetchHeaders() },
    )
    if (!res.ok) throw new Error(`fetch file failed: ${res.status}`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },
  listFiles: async (sessionId: string): Promise<AttachedFileInfo[]> => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/files`, {
      method: "GET",
      headers: customFetchHeaders(),
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<AttachedFileInfo[]>
  },
  deleteFile: async (sessionId: string, fileId: string) => {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE", headers: customFetchHeaders() },
    )
    if (!res.ok && res.status !== 404) {
      throw new Error(`API error: ${res.status}`)
    }
  },
  approvePlan: async (planId: string) => {
    const res = await client.api.plans[":id"].approve.$post({
      param: { id: planId },
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  rejectPlan: async (planId: string) => {
    const res = await client.api.plans[":id"].reject.$post({
      param: { id: planId },
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  getFiles: async () => {
    const res = await client.api.files.$get()
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  },
  // working directory 配下のファイル実体を fetch する。modal プレビュー用。
  // 認証ヘッダ込みで取得して Blob を返す。MIME 判定は Content-Type ヘッダから行う。
  fetchWorkdirFileBlob: async (relPath: string): Promise<{ blob: Blob; mimeType: string }> => {
    const res = await fetch(`/api/files/content?path=${encodeURIComponent(relPath)}`, {
      method: "GET",
      headers: customFetchHeaders(),
    })
    if (!res.ok) {
      throw new WorkdirFileError(res.status, `fetch file failed: ${res.status}`)
    }
    const mimeType = res.headers.get("content-type") ?? "application/octet-stream"
    const blob = await res.blob()
    return { blob, mimeType }
  },
  exportPdf: async (html: string, fileName: string): Promise<Blob> => {
    const res = await fetch("/api/export/pdf", {
      method: "POST",
      headers: { ...customFetchHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ html, fileName }),
    })
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
    return res.blob()
  },
  getStreamUrl: (sessionId: string) => {
    const url = client.api.sessions[":id"].stream.$url({
      param: { id: sessionId },
    })
    return url.toString()
  },
  // --- Personal skills ---
  // GET 一覧 / 取得 / 作成 / 更新 / 削除。Hono client の型は使わず、シンプルに fetch する
  // (PUT が hono/client から呼びにくいため、CRUD 全部を同じパターンで揃える)。
  listSkills: async (): Promise<{ skills: PersonalSkillSummary[] }> => {
    const res = await fetch("/api/skills", { method: "GET", headers: customFetchHeaders() })
    if (!res.ok) throw await SkillApiError.fromResponse(res)
    return res.json()
  },
  listCommonSkills: async (): Promise<{ skills: CommonSkillSummary[] }> => {
    const res = await fetch("/api/skills/common", { method: "GET", headers: customFetchHeaders() })
    if (!res.ok) throw await SkillApiError.fromResponse(res)
    return res.json()
  },
  getSkill: async (name: string): Promise<PersonalSkillDetail> => {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
      method: "GET",
      headers: customFetchHeaders(),
    })
    if (!res.ok) throw await SkillApiError.fromResponse(res)
    return res.json()
  },
  createSkill: async (input: {
    name: string
    description: string
    body: string
  }): Promise<PersonalSkillDetail> => {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { ...customFetchHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw await SkillApiError.fromResponse(res)
    return res.json()
  },
  updateSkill: async (
    name: string,
    input: { description: string; body: string },
  ): Promise<PersonalSkillDetail> => {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { ...customFetchHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw await SkillApiError.fromResponse(res)
    return res.json()
  },
  deleteSkill: async (name: string): Promise<void> => {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: customFetchHeaders(),
    })
    if (!res.ok && res.status !== 404) throw await SkillApiError.fromResponse(res)
  },

}

function customFetchHeaders(): HeadersInit {
  const { userId } = useAuthStore.getState()
  const headers: Record<string, string> = {}
  if (userId) headers["X-User-Id"] = userId
  return headers
}

export interface AttachedFileInfo {
  id: string
  name: string
  size: number
  mimeType: string
  createdAt: number
}

export class UploadApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "UploadApiError"
    this.status = status
  }
}

export class WorkdirFileError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "WorkdirFileError"
    this.status = status
  }
}

// 個人用スキル / 共通スキル API のレスポンス型。
export type SkillCreatedBy = "agent" | "user" | "unknown"

export interface PersonalSkillSummary {
  name: string
  description: string
  createdAt: number
  updatedAt: number
  createdBy: SkillCreatedBy
  hasAttachments: boolean
}

export interface PersonalSkillDetail extends PersonalSkillSummary {
  body: string
}

export interface CommonSkillSummary {
  name: string
  description: string
}

export class SkillApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "SkillApiError"
    this.status = status
    this.code = code
  }
  static async fromResponse(res: Response): Promise<SkillApiError> {
    let code = "unknown"
    let message = `API error: ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      if (body.error) code = body.error
      if (body.message) message = body.message
    } catch {
      // body が JSON でないケースは status だけで返す
    }
    return new SkillApiError(res.status, code, message)
  }
}
