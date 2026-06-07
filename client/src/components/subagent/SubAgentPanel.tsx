import { Bot, CheckCircle2, Loader2, XCircle } from "lucide-react"
import type { SubAgent } from "../../types/task"
import { Collapsible } from "../ui/Collapsible"

interface SubAgentPanelProps {
  agents: SubAgent[]
}

export function SubAgentPanel({ agents }: SubAgentPanelProps) {
  if (agents.length === 0) return null

  return (
    <div className="my-3 space-y-2">
      {agents.map((agent) => (
        <SubAgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  )
}

function SubAgentCard({ agent }: { agent: SubAgent }) {
  const statusIcon =
    agent.status === "running" ? (
      <Loader2 size={14} className="animate-spin text-tool-agent" />
    ) : agent.status === "completed" ? (
      <CheckCircle2 size={14} className="text-green-400" />
    ) : (
      <XCircle size={14} className="text-neutral-400" />
    )

  const header = (
    <div className="flex items-center gap-2 text-sm">
      <Bot size={14} className="text-tool-agent shrink-0" />
      <span className="text-primary font-medium">{agent.name}</span>
      <span className="text-xs text-secondary">{agent.type}</span>
      <div className="ml-auto">{statusIcon}</div>
    </div>
  )

  return (
    <Collapsible
      header={header}
      borderColor="var(--color-tool-agent)"
      defaultOpen={agent.status === "completed"}
    >
      <div className="px-3 py-2 text-xs">
        <div className="text-secondary mb-1">{agent.prompt}</div>
        {agent.output && (
          <div className="mt-2 text-primary bg-white/5 rounded p-2">{agent.output}</div>
        )}
      </div>
    </Collapsible>
  )
}
