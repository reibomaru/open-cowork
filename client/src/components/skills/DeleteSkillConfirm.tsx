import { Loader2 } from "lucide-react"
import { useState } from "react"
import { useT } from "../../i18n"
import { useSkillStore } from "../../store/skill-store"

interface DeleteSkillConfirmProps {
  name: string
  onClose: () => void
}

export function DeleteSkillConfirm({ name, onClose }: DeleteSkillConfirmProps) {
  const t = useT()
  const remove = useSkillStore((s) => s.remove)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setError(null)
    setDeleting(true)
    try {
      await remove(name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg border border-app bg-sidebar shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("skills.delete.confirmTitle", { name })}
      >
        <h3 className="text-sm font-semibold text-primary mb-2">
          {t("skills.delete.confirmTitle", { name })}
        </h3>
        <p className="text-xs text-secondary mb-4">{t("skills.delete.confirmBody")}</p>
        {error && (
          <div className="mb-3 rounded border border-neutral-500/50 bg-neutral-500/10 px-3 py-2 text-xs text-neutral-500">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-3 py-1.5 rounded text-xs text-secondary hover:bg-white/10"
          >
            {t("skills.delete.cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded text-xs bg-neutral-600 text-white hover:bg-neutral-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {deleting && <Loader2 size={12} className="animate-spin" />}
            <span>{deleting ? t("skills.modal.deleting") : t("skills.delete.confirm")}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
