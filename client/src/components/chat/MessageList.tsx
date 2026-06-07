import { useAutoScroll } from "../../hooks/use-auto-scroll"
import type { Message } from "../../types/message"
import { MessageBubble } from "./MessageBubble"

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps) {
  const { containerRef } = useAutoScroll([messages])

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {/* 中央寄せの max-width 制約は MessageBubble 内で適用する。
          html_block はバブルの外でフル幅描画したいのでここでは縛らない。 */}
      <div className="py-6 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  )
}
