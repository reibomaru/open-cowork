export interface SSEWriter {
  writeSSE(data: { event: string; data: string }): Promise<void>
}
