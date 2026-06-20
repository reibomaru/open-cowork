import { defineTool } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"

const SEARXNG_BASE_URL = process.env.SEARXNG_BASE_URL ?? "http://localhost:8080"

interface SearxngResult {
  url: string
  title: string
  content?: string
}

interface SearxngResponse {
  results?: SearxngResult[]
}

export const webSearchTool = defineTool({
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web for up-to-date information. Returns titles, URLs, and snippets from search results.",
  promptSnippet: "web_search(query) — search the web",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    max_results: Type.Optional(
      Type.Number({ description: "Maximum number of results to return (default: 5, max: 10)" }),
    ),
  }),
  async execute(_toolCallId, params, signal) {
    const limit = Math.min(params.max_results ?? 5, 10)
    const url = new URL(`${SEARXNG_BASE_URL}/search`)
    url.searchParams.set("q", params.query)
    url.searchParams.set("format", "json")
    url.searchParams.set("language", "auto")

    let text: string
    try {
      const res = await fetch(url.toString(), { signal: signal ?? undefined })
      if (!res.ok) {
        text = `Search failed: HTTP ${res.status}`
      } else {
        const data: SearxngResponse = await res.json()
        const results = (data.results ?? []).slice(0, limit)

        if (results.length === 0) {
          text = "No results found."
        } else {
          text = results
            .map((r, i) => {
              const lines = [`${i + 1}. ${r.title}`, `   URL: ${r.url}`]
              if (r.content) lines.push(`   ${r.content}`)
              return lines.join("\n")
            })
            .join("\n\n")
        }
      }
    } catch (err) {
      text = `Search error: ${err instanceof Error ? err.message : String(err)}`
    }

    return {
      content: [{ type: "text" as const, text }],
      details: undefined,
    }
  },
})
