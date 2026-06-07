import clsx from "clsx"
import { CheckCircle2, Circle, Loader2, SkipForward, XCircle } from "lucide-react"
import { useT } from "../../i18n"
import { api } from "../../lib/api"
import type { Plan, PlanStepStatus } from "../../types/plan"

interface PlanDisplayProps {
  plan: Plan
  onStatusChange?: (status: Plan["status"]) => void
}

const stepIcons: Record<PlanStepStatus, React.ReactNode> = {
  pending: <Circle size={16} className="text-secondary" />,
  "in-progress": <Loader2 size={16} className="text-clay animate-spin" />,
  completed: <CheckCircle2 size={16} className="text-green-400" />,
  failed: <XCircle size={16} className="text-neutral-400" />,
  skipped: <SkipForward size={16} className="text-secondary" />,
}

export function PlanDisplay({ plan, onStatusChange }: PlanDisplayProps) {
  const t = useT()

  const handleApprove = async () => {
    try {
      await api.approvePlan(plan.id)
    } catch {}
    onStatusChange?.("approved")
  }

  const handleReject = async () => {
    try {
      await api.rejectPlan(plan.id)
    } catch {}
    onStatusChange?.("rejected")
  }

  return (
    <div className="my-3 rounded-lg border border-border-default overflow-hidden">
      <div className="px-4 py-3 bg-white/5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-primary">{plan.title}</span>
          <span
            className={clsx(
              "text-xs px-2 py-0.5 rounded",
              plan.status === "pending-approval" && "bg-yellow-500/15 text-yellow-400",
              plan.status === "approved" && "bg-green-500/15 text-green-400",
              plan.status === "rejected" && "bg-neutral-500/15 text-neutral-400",
              plan.status === "executing" && "bg-neutral-500/15 text-neutral-400",
              plan.status === "completed" && "bg-green-500/15 text-green-400",
            )}
          >
            {t(`plan.status.${plan.status}` as const)}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {plan.steps.map((step, i) => (
          <div key={step.id} className="flex items-start gap-2">
            <div className="mt-0.5 shrink-0">{stepIcons[step.status]}</div>
            <span
              className={clsx(
                "text-sm",
                step.status === "completed" ? "text-primary" : "text-secondary",
              )}
            >
              {i + 1}. {step.description}
            </span>
          </div>
        ))}
      </div>

      {plan.status === "pending-approval" && (
        <div className="px-4 py-3 border-t border-border-subtle flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
          >
            {t("plan.approve")}
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="px-4 py-1.5 rounded-lg bg-neutral-600/20 hover:bg-neutral-600/30 text-neutral-400 text-sm font-medium transition-colors"
          >
            {t("plan.reject")}
          </button>
        </div>
      )}
    </div>
  )
}
