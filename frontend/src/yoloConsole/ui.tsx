// ชิ้น UI เล็กๆ ที่ต้นแบบใช้ไลบรารี (sonner, tanstack table) — ที่นี่เขียนเองให้พอใช้กับ YOLO Console
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { getToasts, toastListeners } from './store'

export function Toaster() {
  const items = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener)
      return () => {
        toastListeners.delete(listener)
      }
    },
    getToasts,
  )
  return (
    <div className="yc-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`yc-toast is-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- sortable table

export interface Column<T> {
  id: string
  header: string
  /** ค่าที่ใช้เรียง — ไม่มี = เรียงคอลัมน์นี้ไม่ได้ */
  sort?: (row: T) => number | string
  cell: (row: T) => ReactNode
}

export function SortTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  initialSort: { id: string; desc: boolean }
}) {
  const [sort, setSort] = useState(initialSort)
  const by = columns.find((c) => c.id === sort.id)?.sort
  const sorted = by
    ? [...rows].sort((a, b) => {
        const x = by(a)
        const y = by(b)
        const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th')
        return sort.desc ? -order : order
      })
    : rows
  return (
    <div className="yc-table-scroll">
      <table className="dc-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} aria-sort={sort.id === c.id ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                {c.sort ? (
                  <button
                    type="button"
                    className="yc-sort"
                    onClick={() => setSort((s) => ({ id: c.id, desc: s.id === c.id ? !s.desc : false }))}
                  >
                    {c.header}
                    <span aria-hidden="true">{sort.id === c.id ? (sort.desc ? ' ↓' : ' ↑') : ''}</span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.id}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
