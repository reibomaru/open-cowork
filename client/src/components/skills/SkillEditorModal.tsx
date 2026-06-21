import { Loader2, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useT } from "../../i18n"
import { SkillApiError } from "../../lib/api"
import { useSkillStore } from "../../store/skill-store"
import { MarkdownView } from "../files/MarkdownView"
import { DeleteSkillConfirm } from "./DeleteSkillConfirm"

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/
const DESCRIPTION_MIN = 16
const DESCRIPTION_MAX = 500

export function SkillEditorModal() {
  const t = useT()
  const mode = useSkillStore((s) => s.editorMode)
  const targetName = useSkillStore((s) => s.editorTargetName)
  const detail = useSkillStore((s) => s.editorDetail)
  const commonDescription = useSkillStore((s) => s.editorCommonDescription)
  const loading = useSkillStore((s) => s.editorLoading)
  const common = useSkillStore((s) => s.common)
  const closeEditor = useSkillStore((s) => s.closeEditor)
  const createSkill = useSkillStore((s) => s.create)
  const updateSkill = useSkillStore((s) => s.update)

  const isView = mode === "view"
  const isNew = mode === "new"
  const isEdit = mode === "edit"

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [body, setBody] = useState("")
  const [bodyView, setBodyView] = useState<"preview" | "edit">(isView ? "preview" : "preview")
  const [saving, setSaving] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [initialState, setInitialState] = useState<{
    name: string
    description: string
    body: string
  }>({ name: "", description: "", body: "" })

  // mode / detail が変わったら初期値をリセット。
  useEffect(() => {
    if (mode === null) return
    let init: { name: string; description: string; body: string }
    if (mode === "view") {
      init = { name: targetName ?? "", description: commonDescription ?? "", body: "" }
    } else if (mode === "new") {
      init = { name: "", description: "", body: "" }
    } else {
      init = {
        name: detail?.name ?? targetName ?? "",
        description: detail?.description ?? "",
        body: detail?.body ?? "",
      }
    }
    setName(init.name)
    setDescription(init.description)
    setBody(init.body)
    setBodyView(mode === "view" ? "preview" : "preview")
    setErrorCode(null)
    setInitialState(init)
  }, [mode, targetName, commonDescription, detail])

  const dirty = useMemo(() => {
    return (
      name !== initialState.name ||
      description !== initialState.description ||
      body !== initialState.body
    )
  }, [name, description, body, initialState])

  // 最新の dirty を Esc ハンドラから参照するための ref。
  // tryClose を依存に持たせると毎レンダー再登録になるため、ref 経由で読む。
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const isViewRef = useRef(isView)
  isViewRef.current = isView

  const tryClose = useCallback(() => {
    if (dirtyRef.current && !isViewRef.current) {
      if (!window.confirm(t("skills.modal.unsavedConfirm"))) return
    }
    closeEditor()
  }, [closeEditor, t])

  // Esc で閉じる (dirty なら確認)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tryClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tryClose])

  const nameError = (() => {
    if (!isNew) return null
    if (name.length === 0) return null // empty は別途 submit 時に
    if (!NAME_REGEX.test(name)) return t("skills.error.invalid_name")
    return null
  })()

  const descLen = description.trim().length
  const descError =
    !isView && descLen > 0 && (descLen < DESCRIPTION_MIN || descLen > DESCRIPTION_MAX)
      ? t("skills.error.description_length")
      : null

  const hasCommonNameConflict = useMemo(() => {
    if (isView) return false
    return common.some((c) => c.name === name)
  }, [common, name, isView])

  const submit = async () => {
    if (isView) return
    setErrorCode(null)
    setSaving(true)
    try {
      if (isNew) {
        await createSkill({ name, description, body })
      } else if (isEdit && targetName) {
        await updateSkill(targetName, { description, body })
      }
    } catch (err) {
      if (err instanceof SkillApiError) {
        setErrorCode(err.code)
      } else {
        setErrorCode("internal")
      }
    } finally {
      setSaving(false)
    }
  }

  const submitDisabled =
    saving ||
    loading ||
    isView ||
    (isNew && (name.length === 0 || nameError !== null)) ||
    description.trim().length < DESCRIPTION_MIN ||
    description.trim().length > DESCRIPTION_MAX ||
    !dirty

  const title = isNew
    ? t("skills.modal.titleNew")
    : isView
      ? t("skills.modal.titleView")
      : t("skills.modal.titleEdit")

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={tryClose}
      onKeyDown={(e) => {
        if (e.key === "Enter") tryClose()
      }}
      role="presentation"
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg border border-app bg-sidebar shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-app">
          <div className="min-w-0">
            <div className="text-xs text-secondary">{title}</div>
            <div className="text-base text-primary truncate" title={name || "—"}>
              {name || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={tryClose}
            className="p-1.5 rounded hover:bg-white/10 text-secondary"
            aria-label={t("skills.modal.close")}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-secondary">
              <Loader2 size={20} className="animate-spin" />
              <span className="ml-2 text-sm">{t("skills.modal.loading")}</span>
            </div>
          ) : (
            <>
              {/* Name */}
              <div>
                <label htmlFor="skill-name" className="block text-xs text-secondary mb-1">
                  {t("skills.modal.name")}
                </label>
                <input
                  id="skill-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  disabled={!isNew}
                  placeholder="my-skill"
                  className="w-full px-2 py-1 rounded border border-app bg-input text-primary text-sm disabled:opacity-60"
                />
                <div className="mt-1 text-[10px] text-secondary">
                  {isNew ? t("skills.modal.nameHelp") : t("skills.modal.nameReadonly")}
                </div>
                {nameError && <div className="mt-1 text-xs text-neutral-500">{nameError}</div>}
                {hasCommonNameConflict && (
                  <div className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                    {t("skills.modal.commonConflict", { name })}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label htmlFor="skill-desc" className="block text-xs text-secondary mb-1">
                  {t("skills.modal.description")}
                </label>
                <textarea
                  id="skill-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isView}
                  placeholder={t("skills.modal.descriptionPlaceholder")}
                  rows={3}
                  className="w-full px-2 py-1 rounded border border-app bg-input text-primary text-sm disabled:opacity-60 resize-y"
                />
                <div className="mt-1 flex items-center justify-between text-[10px] text-secondary">
                  <span>
                    {t("skills.modal.descriptionCount", {
                      count: description.trim().length,
                      max: DESCRIPTION_MAX,
                    })}
                  </span>
                  {descError && <span className="text-neutral-500">{descError}</span>}
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="skill-body" className="block text-xs text-secondary">
                    {t("skills.modal.body")}
                  </label>
                  {!isView && (
                    <div className="inline-flex rounded border border-app overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setBodyView("preview")}
                        className={`px-2 py-0.5 ${
                          bodyView === "preview"
                            ? "bg-white/15 text-primary"
                            : "text-secondary hover:bg-white/5"
                        }`}
                        aria-pressed={bodyView === "preview"}
                      >
                        {t("skills.modal.preview")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyView("edit")}
                        className={`px-2 py-0.5 border-l border-app ${
                          bodyView === "edit"
                            ? "bg-white/15 text-primary"
                            : "text-secondary hover:bg-white/5"
                        }`}
                        aria-pressed={bodyView === "edit"}
                      >
                        {t("skills.modal.edit")}
                      </button>
                    </div>
                  )}
                </div>
                {bodyView === "edit" && !isView ? (
                  <textarea
                    id="skill-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={t("skills.modal.bodyPlaceholder")}
                    rows={16}
                    spellCheck={false}
                    className="w-full px-2 py-1 rounded border border-app bg-input text-primary text-xs font-mono resize-y"
                  />
                ) : (
                  <div className="rounded border border-app bg-app overflow-hidden">
                    {body.trim().length > 0 ? (
                      <MarkdownView content={body} enableControls={false} />
                    ) : (
                      <div className="px-3 py-4 text-xs text-secondary">—</div>
                    )}
                  </div>
                )}
              </div>

              {errorCode && (
                <div className="rounded border border-neutral-500/50 bg-neutral-500/10 px-3 py-2 text-xs text-neutral-500">
                  {t(`skills.error.${errorCode}` as Parameters<typeof t>[0]) || errorCode}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-app">
          {isEdit ? (
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-500 hover:bg-neutral-500/10"
            >
              <Trash2 size={14} />
              <span>{t("skills.modal.delete")}</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={tryClose}
              className="px-3 py-1.5 rounded text-xs text-secondary hover:bg-white/10"
            >
              {t("skills.modal.cancel")}
            </button>
            {!isView && (
              <button
                type="button"
                onClick={submit}
                disabled={submitDisabled}
                className="px-3 py-1.5 rounded text-xs bg-clay text-white hover:bg-clay-deep disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                <span>{saving ? t("skills.modal.saving") : t("skills.modal.save")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showDelete && targetName && (
        <DeleteSkillConfirm name={targetName} onClose={() => setShowDelete(false)} />
      )}
    </div>
  )
}
