import { useMemo, useState } from 'react'
import { useRemote } from './store'
import { SortTable, type Column } from './ui'
import { yoloService } from './yoloService'
import type { AlertList, AlertRecord, WellCategory } from './types'
import {
  addDays,
  CATEGORIES,
  CATEGORY_TEXT,
  describeWorst,
  downloadCsv,
  formatDateTime,
  formatSeconds,
  isoDay,
  personName,
} from './wellness'

const COLUMNS: Column<AlertRecord>[] = [
  {
    id: 'started_at',
    header: 'เวลาเริ่ม',
    sort: (a) => a.started_at,
    cell: (a) => <span className={a.category === 'fall' ? 'yc-bad' : ''}>{formatDateTime(a.started_at)}</span>,
  },
  {
    id: 'person',
    header: 'บุคคล',
    sort: (a) => personName(a.name, a.person),
    cell: (a) => <span className={a.name ? 'dc-w500' : ''}>{personName(a.name, a.person)}</span>,
  },
  { id: 'camera', header: 'กล้อง', sort: (a) => a.camera, cell: (a) => <span className="yc-truncate">{a.camera}</span> },
  { id: 'category', header: 'หมวด', sort: (a) => CATEGORY_TEXT[a.category], cell: (a) => CATEGORY_TEXT[a.category] },
  {
    id: 'text',
    header: 'ประเภท',
    sort: (a) => a.text,
    cell: (a) => <span className={a.category === 'fall' ? 'yc-bad dc-w500' : ''}>{a.text}</span>,
  },
  {
    id: 'seconds',
    header: 'ระยะเวลา',
    sort: (a) => a.seconds ?? Number.POSITIVE_INFINITY,
    cell: (a) => (a.category === 'fall' || a.type === 'yawn' ? 'ทันที' : formatSeconds(a.seconds)),
  },
  { id: 'worst', header: 'ค่าที่แย่ที่สุด', cell: (a) => <span className="dc-muted-12">{describeWorst(a) || '-'}</span> },
]

function Tile({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="dc-stat yc-tile">
      <span className={`dc-stat-value ${danger && value > 0 ? 'yc-bad' : ''}`}>{value}</span>
      <span className="dc-muted-12">{label}</span>
    </div>
  )
}

export default function AlertsTab() {
  const [today] = useState(() => isoDay(new Date()))
  const [start, setStart] = useState(addDays(today, -6))
  const [end, setEnd] = useState(today)
  const [person, setPerson] = useState('')
  const [category, setCategory] = useState<WellCategory | ''>('')
  const list = useRemote<AlertList>(`alerts:${start}:${end}`, () => yoloService.listAlerts(start, end), 15000)
  const all = useMemo(() => list.data?.alerts ?? [], [list.data])
  const people = useMemo(() => [...new Set(all.map((a) => personName(a.name, a.person)))].sort(), [all])
  const shown = all.filter(
    (a) => (!person || personName(a.name, a.person) === person) && (!category || a.category === category),
  )
  const count = (c: WellCategory) => shown.filter((a) => a.category === c).length

  const exportCsv = () =>
    downloadCsv(`alerts_${start}_${end}.csv`, [
      ['เวลาเริ่ม', 'เวลาจบ', 'บุคคล', 'กล้อง', 'หมวด', 'ประเภท', 'ระยะเวลา (วินาที)', 'ค่าที่แย่ที่สุด'],
      ...shown.map((a) => [
        formatDateTime(a.started_at),
        a.ended_at === null ? '' : formatDateTime(a.ended_at),
        personName(a.name, a.person),
        a.camera,
        CATEGORY_TEXT[a.category],
        a.text,
        a.seconds === null ? null : Math.round(a.seconds),
        describeWorst(a),
      ]),
    ])

  return (
    <div className="dc-stack">
      <div className="yc-toolbar">
        <button type="button" className="dc-btn" onClick={exportCsv} disabled={!shown.length}>
          ⤓ ส่งออกข้อมูล (CSV)
        </button>
        <button type="button" className="dc-btn yc-btn-primary" onClick={list.reload} disabled={list.fetching}>
          ↻ อัปเดตข้อมูล
        </button>
      </div>

      <div className="dc-statbar yc-tiles">
        <Tile label="การแจ้งเตือนทั้งหมด" value={shown.length} />
        {CATEGORIES.map((c) => (
          <Tile key={c} label={CATEGORY_TEXT[c]} value={count(c)} danger={c === 'fall'} />
        ))}
      </div>

      <div className="dc-card dc-pad">
        <div className="yc-filters">
          <label className="yc-field">
            <span className="dc-muted-12">ตั้งแต่</span>
            <input type="date" className="yc-input" value={start} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
          <label className="yc-field">
            <span className="dc-muted-12">ถึง</span>
            <input type="date" className="yc-input" value={end} min={start} max={today} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </label>
          <select className="yc-input" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="บุคคล">
            <option value="">ทุกคน</option>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="yc-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as WellCategory | '')}
            aria-label="หมวด"
          >
            <option value="">ทุกหมวด</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_TEXT[c]}</option>
            ))}
          </select>
          <span className="yc-push dc-muted-12">{shown.length} รายการ</span>
        </div>
        {list.error && <p className="yc-error">{list.error}</p>}
        {!list.loading && shown.length === 0 ? (
          <p className="dc-empty dc-empty-pad">ไม่มีการแจ้งเตือนในช่วงนี้</p>
        ) : (
          <SortTable rows={shown} columns={COLUMNS} rowKey={(a) => a.id} initialSort={{ id: 'started_at', desc: true }} />
        )}
      </div>
    </div>
  )
}
