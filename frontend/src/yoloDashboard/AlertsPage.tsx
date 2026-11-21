import { useMemo, useState } from 'react'
import { useRemote } from '../yoloConsole/store'
import { yoloService } from '../yoloConsole/yoloService'
import type { AlertList, AlertRecord } from '../yoloConsole/types'
import { addDays, CATEGORIES, CATEGORY_TEXT, describeWorst, downloadCsv, formatDateTime, isoDay } from '../yoloConsole/wellness'
import { Phrases } from './marks'
import { alertDuration, alertPerson, alertsCsv, alertView, type CategoryFilter } from './reportsFormat'
import { LedgerCell, PageHead, SortTable, type Column } from './ui'
import './yd-reports.css'

const COLUMNS: Column<AlertRecord>[] = [
  { id: 'started_at', header: 'เวลาเริ่ม', sort: (a) => a.started_at, cell: (a) => formatDateTime(a.started_at) },
  {
    id: 'person',
    header: 'บุคคล',
    sort: alertPerson,
    cell: (a) => <span className={a.name ? 'yd-reports-name' : undefined}>{alertPerson(a)}</span>,
  },
  { id: 'camera', header: 'กล้อง', sort: (a) => a.camera, cell: (a) => a.camera },
  { id: 'category', header: 'หมวด', sort: (a) => CATEGORY_TEXT[a.category], cell: (a) => CATEGORY_TEXT[a.category] },
  { id: 'text', header: 'ประเภท', sort: (a) => a.text, cell: (a) => a.text },
  { id: 'seconds', header: 'ระยะเวลา', sort: (a) => a.seconds ?? Number.POSITIVE_INFINITY, cell: alertDuration },
  { id: 'worst', header: 'ค่าที่แย่ที่สุด', cell: (a) => describeWorst(a) || '-' },
]

export default function AlertsPage() {
  const [today] = useState(() => isoDay(new Date()))
  const [start, setStart] = useState(() => addDays(today, -6))
  const [end, setEnd] = useState(today)
  const [person, setPerson] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('')
  const list = useRemote<AlertList>(`alerts:${start}:${end}`, () => yoloService.listAlerts(start, end), 15000)
  const view = useMemo(() => alertView(list.data?.alerts ?? [], person, category), [list.data, person, category])

  return (
    <>
      <PageHead
        title="ประวัติแจ้งเตือน"
        lead={<Phrases text="ตรวจสอบเหตุการณ์ย้อนหลัง กรองตามช่วงวันที่ บุคคล และหมวด" />}
      >
        <button
          type="button"
          className="yd-btn-line"
          disabled={!view.shown.length}
          onClick={() => downloadCsv(`alerts_${start}_${end}.csv`, alertsCsv(view.shown))}
        >
          ส่งออกข้อมูล (CSV)
        </button>
        <button type="button" className="yd-btn" onClick={list.reload} disabled={list.loading}>
          {list.loading ? 'กำลังโหลด...' : 'อัปเดตข้อมูล'}
        </button>
      </PageHead>

      <div className="yd-ledger">
        <LedgerCell value={view.total} label="การแจ้งเตือนทั้งหมด" />
        {CATEGORIES.map((c) => (
          <LedgerCell
            key={c}
            value={view.byCategory[c]}
            label={CATEGORY_TEXT[c]}
            alert={c === 'fall' && view.byCategory[c] > 0}
            pressed={category === c}
            onClick={() => setCategory(category === c ? '' : c)}
          />
        ))}
      </div>

      <section className="yd-panel" aria-label="รายการแจ้งเตือน">
        <div className="yd-toolbar">
          <label className="yd-field">
            ตั้งแต่
            <input
              type="date"
              className="yd-input"
              value={start}
              max={end}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
          </label>
          <label className="yd-field">
            ถึง
            <input
              type="date"
              className="yd-input"
              value={end}
              min={start}
              max={today}
              onChange={(e) => e.target.value && setEnd(e.target.value)}
            />
          </label>
          <label className="yd-field">
            บุคคล
            <select className="yd-input" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">ทุกคน</option>
              {view.people.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="yd-field">
            หมวด
            <select className="yd-input" value={category} onChange={(e) => setCategory(e.target.value as CategoryFilter)}>
              <option value="">ทุกหมวด</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_TEXT[c]}</option>
              ))}
            </select>
          </label>
          <span className="yd-toolbar-end yd-reports-count">{view.shown.length} รายการ</span>
        </div>
        {list.error && <p className="yd-error yd-reports-note">{list.error}</p>}
        {!list.loading && view.shown.length === 0 ? (
          <p className="yd-empty">ไม่มีการแจ้งเตือนในช่วงนี้</p>
        ) : (
          <SortTable
            rows={view.shown}
            columns={COLUMNS}
            rowKey={(a) => a.id}
            initialSort={{ id: 'started_at', desc: true }}
            rowClass={(a) => (a.category === 'fall' ? 'is-fall' : undefined)}
            caption="รายการแจ้งเตือน ใหม่สุดอยู่บน"
          />
        )}
      </section>
    </>
  )
}
