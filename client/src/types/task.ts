export interface SubAgent {
  id: string
  name: string
  type: string
  prompt: string
  status: "running" | "completed" | "failed"
  output?: string
  startedAt: number
  completedAt?: number
}
