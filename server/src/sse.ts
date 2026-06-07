import type { SSEEvent } from "./types"

export interface SSEWriter {
  writeSSE(data: { event: string; data: string }): Promise<void>
}

export async function streamEvents(stream: SSEWriter, events: SSEEvent[]) {
  for (const event of events) {
    await sleep(event.delay)
    await stream.writeSSE({
      event: event.event,
      data: JSON.stringify(event.data),
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
