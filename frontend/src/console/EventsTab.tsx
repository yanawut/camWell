import { useState } from 'react'
import { downloadJson, formatDuration, formatMetrics, formatTime, splitPersonName } from './format'
import { ALERT_CATEGORY_LABELS_TH, ALERT_LABELS_TH, type AlertCategory, type AlertEvent } from '../types/alerts'
import type { CameraSlot } from '../types/cameraSource'

interface Props {
  events: AlertEvent[]
  cameraSlots: CameraSlot[]
}

const CATEGORY_STYLE: Record<AlertCategory, { bg: string; color: string }> = {
  posture: { bg: '#eff6ff', color: '#1d4ed8' },
  fatigue: { bg: '#fff7ed', color: '#c2410c' },
  distance: { bg: '#f0fdf4', color: '#15803d' },
  fall: { bg: '#fef2f2', color: '#b91c1c' },
}

const CATEGORIES = Object.keys(CATEGORY_STYLE) as AlertCategory[]

export default function EventsTab({ events, cameraSlots }: Props) {
  const [category, setCategory] = useState<AlertCategory | 'all'>('all')
  const [activeOnly, setActiveOnly] = useState(false)

  const sorted = [...events].sort((a, b) => b.startedAt - a.startedAt)
  const filtered = sorted.filter((e) => (category === 'all' || e.category === category) && (!activeOnly || !e.endedAt))
  const singleCameraLabel = cameraSlots.length === 1 ? cameraSlots[0].label : '—'

  const filters: [AlertCategory | 'all', string, number][] = [
    ['all', 'ทั้งหมด', events.length],
    ...CATEGORIES.map((c): [AlertCategory, string, number] => [
      c,
      ALERT_CATEGORY_LABELS_TH[c],
      events.filter((e) => e.category === c).length,
    ]),
  ]

  return (
    <div className="dc-card" style={{ overflow: 'hidden' }}>
      <div className="dc-table-toolbar">
        <div className="dc-toggle-row" style={{ gap: 6 }}>
          {filters.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={`dc-filter ${category === key ? 'on' : ''}`}
              onClick={() => setCategory(key)}
            >
              {label} <span className="dc-mono" style={{ opacity: 0.75 }}>{count}</span>
            </button>
          ))}
        </div>
        <div className="dc-row" style={{ gap: 12 }}>
          <label className="dc-check">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            เฉพาะที่ยัง active
          </label>
          <button type="button" className="dc-btn" disabled={filtered.length === 0} onClick={() => downloadJson('camwell-events', filtered)}>
            Export JSON
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="dc-table">
          <thead>
            <tr>
              <th>เวลาเริ่ม</th>
              <th>กล้อง</th>
              <th>บุคคล</th>
              <th>หมวด</th>
              <th>ประเภท</th>
              <th>ระยะเวลา</th>
              <th>metrics (ค่าแย่สุด)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const { camera, person } = splitPersonName(e.personName, singleCameraLabel)
              const active = !e.endedAt
              const style = { color: active ? 'var(--danger)' : undefined }
              return (
                <tr key={e.id}>
                  <td className="dc-mono" style={{ fontSize: 12 }}>{formatTime(e.startedAt)}</td>
                  <td>{camera}</td>
                  <td>{person}</td>
                  <td>
                    <span className="dc-cat" style={{ background: CATEGORY_STYLE[e.category].bg, color: CATEGORY_STYLE[e.category].color }}>
                      {ALERT_CATEGORY_LABELS_TH[e.category]}
                    </span>
                  </td>
                  <td style={{ ...style, fontWeight: active ? 600 : 400 }}>{ALERT_LABELS_TH[e.type]}</td>
                  <td style={{ ...style, whiteSpace: 'nowrap' }}>
                    {active ? 'กำลังดำเนินอยู่...' : formatDuration(e.startedAt, e.endedAt)}
                  </td>
                  <td className="dc-mono dc-muted" style={{ fontSize: 11 }}>{formatMetrics(e.metrics)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="dc-empty dc-empty-pad">ไม่มีเหตุการณ์ตามตัวกรองนี้</p>}
      <p className="dc-table-foot">
        เก็บในหน่วยความจำของเบราว์เซอร์เท่านั้น · ส่งออกผ่าน <code>consoleAlertReporter</code> — ยังไม่ได้ส่งไป backend
        (Phase 2: <code>createWebSocketAlertReporter()</code>)
      </p>
    </div>
  )
}
