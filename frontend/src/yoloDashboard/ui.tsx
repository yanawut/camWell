import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { getToasts, toastListeners } from '../yoloConsole/store'
import { Mark } from './marks'

// ชิ้น UI ที่ทุกหน้าของ /?yolo-dashboard ใช้ร่วมกัน สไตล์อยู่ใน yd-pages.css

/** หัวหน้า: ชื่อหน้า คำอธิบาย และปุ่มคำสั่งของหน้าชิดขวา */
export function PageHead({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="yd-page-head">
      <div className="yd-page-title">
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {children && <div className="yd-actions">{children}</div>}
    </header>
  )
}

/** ช่องตัวเลขในแถบสรุป — ใส่ onClick แล้วกลายเป็นปุ่มกรอง (pressed = กำลังกรองอยู่) */
export function LedgerCell({
  value,
  label,
  alert = false,
  pressed,
  onClick,
}: {
  value: ReactNode
  label: string
  alert?: boolean
  pressed?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <span className={`yd-ledger-value${alert ? ' is-alert' : ''}`}>{value}</span>
      <span className="yd-ledger-label">{label}</span>
    </>
  )
  if (!onClick) return <div className="yd-ledger-cell">{body}</div>
  return (
    <button type="button" className="yd-ledger-cell is-button" aria-pressed={pressed} onClick={onClick}>
      {body}
    </button>
  )
}

/** ช่องติ๊กแบบพิมพ์บนฉลาก — ข้างในเป็น checkbox จริง (กดด้วยคีย์บอร์ดได้ โปรแกรมอ่านหน้าจออ่านได้) */
export function PrintedCheckbox({
  checked,
  onChange,
  children,
  title,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  title?: string
}) {
  return (
    <label className="yd-dash-check" title={title}>
      <input className="yd-visually-hidden" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Mark state={checked ? 'tick' : 'empty'} label="" />
      <span>{children}</span>
    </label>
  )
}

/** กลุ่มปุ่มเลือกได้ทีละอัน (แท็บแหล่งภาพ รูปแบบการแสดง ฯลฯ) */
export function Segment<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="yd-segment" role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'is-on' : ''} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  )
}

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
    <div className="yd-toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`yd-toast is-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  )
}

export interface Column<T> {
  id: string
  header: string
  /** ค่าที่ใช้เรียง — ไม่มี = เรียงคอลัมน์นี้ไม่ได้ */
  sort?: (row: T) => number | string
  cell: (row: T) => ReactNode
}

/** ตารางที่กดหัวคอลัมน์เพื่อเรียงได้ — rowClass ใช้ทำแถวการล้มเป็นสีตรายาง */
export function SortTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  rowClass,
  caption,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  initialSort: { id: string; desc: boolean }
  rowClass?: (row: T) => string | undefined
  caption?: string
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
    <div className="yd-table-wrap">
      <table className="yd-table">
        {caption && <caption className="yd-visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" aria-sort={sort.id === c.id ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                {c.sort ? (
                  <button type="button" className="yd-sort" onClick={() => setSort((s) => ({ id: c.id, desc: s.id === c.id ? !s.desc : false }))}>
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
            <tr key={rowKey(row)} className={rowClass?.(row)}>
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
