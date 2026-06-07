export type PlanStepStatus = "pending" | "in-progress" | "completed" | "failed" | "skipped"

export interface PlanStep {
  id: string
  description: string
  status: PlanStepStatus
}

export interface Plan {
  id: string
  title: string
  steps: PlanStep[]
  status: "pending-approval" | "approved" | "rejected" | "executing" | "completed"
}
