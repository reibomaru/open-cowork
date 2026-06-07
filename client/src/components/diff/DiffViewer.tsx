import clsx from "clsx"
import type { DiffData } from "../../types/tool-call"

interface DiffViewerProps {
  diff: DiffData
}

export function DiffViewer({ diff }: DiffViewerProps) {
  return (
    <div className="rounded overflow-hidden border border-border-subtle">
      {diff.hunks.map((hunk, hi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: hunks have no unique id
        <div key={hi}>
          {hunk.lines.map((line, li) => (
            <div
              key={`${line.type}-${li}`}
              className={clsx(
                "flex text-xs font-mono leading-5",
                line.type === "add" && "bg-diff-add",
                line.type === "remove" && "bg-diff-remove",
              )}
            >
              <span className="w-5 shrink-0 text-center text-secondary/50 select-none">
                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
              </span>
              <pre className="flex-1 px-2 whitespace-pre-wrap text-primary">{line.content}</pre>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
