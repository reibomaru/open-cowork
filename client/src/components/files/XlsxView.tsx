import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useT } from "../../i18n"

interface XlsxViewProps {
  blob: Blob
}

interface SheetData {
  name: string
  rows: string[][]
  truncated: boolean
}

const MAX_ROWS = 500
const MAX_COLS = 60

// exceljs は重いので動的 import する。xlsx の各シートをテーブルとして表示する。
export function XlsxView({ blob }: XlsxViewProps) {
  const t = useT()
  const [sheets, setSheets] = useState<SheetData[] | null>(null)
  const [active, setActive] = useState(0)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let cancelled = false
    setErrored(false)
    setSheets(null)
    setActive(0)
    ;(async () => {
      try {
        const ExcelJS = (await import("exceljs")).default
        const arrayBuffer = await blob.arrayBuffer()
        if (cancelled) return
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(arrayBuffer)
        if (cancelled) return
        const parsed: SheetData[] = wb.worksheets.map((ws) => {
          const rowCount = Math.min(ws.rowCount, MAX_ROWS)
          const colCount = Math.min(ws.columnCount, MAX_COLS)
          const rows: string[][] = []
          for (let r = 1; r <= rowCount; r++) {
            const row = ws.getRow(r)
            const cells: string[] = []
            for (let c = 1; c <= colCount; c++) {
              cells.push(row.getCell(c).text ?? "")
            }
            rows.push(cells)
          }
          return {
            name: ws.name,
            rows,
            truncated: ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLS,
          }
        })
        if (!cancelled) setSheets(parsed)
      } catch {
        if (!cancelled) setErrored(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blob])

  if (errored) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-secondary px-6 text-center">
        {t("filePreview.officeError")}
      </div>
    )
  }

  if (sheets === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-secondary">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">{t("filePreview.loading")}</span>
      </div>
    )
  }

  if (sheets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-secondary px-6 text-center">
        {t("filePreview.officeEmpty")}
      </div>
    )
  }

  const sheet = sheets[Math.min(active, sheets.length - 1)]

  return (
    <div className="h-full flex flex-col bg-app">
      {sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-app px-2 py-1.5 bg-sidebar">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded px-2.5 py-1 text-xs ${
                i === active ? "bg-white/15 text-primary" : "text-secondary hover:bg-white/5"
              }`}
              aria-pressed={i === active}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        <table className="border-collapse text-xs text-primary">
          <tbody>
            {sheet.rows.map((row, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: row order is stable per render
              <tr key={r}>
                <td className="sticky left-0 select-none border border-app bg-sidebar px-2 py-1 text-right text-secondary">
                  {r + 1}
                </td>
                {row.map((cell, c) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: cell order is stable per render
                    key={c}
                    className="max-w-[320px] truncate border border-app px-2 py-1"
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.truncated && (
        <div className="shrink-0 border-t border-app px-3 py-1.5 text-xs text-secondary">
          {t("filePreview.sheetTruncated")}
        </div>
      )}
    </div>
  )
}
