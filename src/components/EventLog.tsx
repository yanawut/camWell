import type { AlertEvent } from '../types/alerts'
import { ALERT_CATEGORY_LABELS_TH, ALERT_LABELS_TH } from '../types/alerts'

interface Props {
  events: AlertEvent[]
}

function formatTime(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString('th-TH', { hour12: false })
}

function formatDuration(startedAt: number, endedAt?: number) {
  const end = endedAt ?? Date.now()
  const seconds = Math.max(0, Math.round((end - startedAt) / 1000))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} นาที ${s} วิ` : `${s} วิ`
}

function formatMetrics(metrics: Record<string, number>) {
  return Object.entries(metrics)
    .map(([key, value]) => `${key}: ${value.toFixed(2)}`)
    .join(', ')
}

export default function EventLog({ events }: Props) {
  const sorted = [...events].sort((a, b) => b.startedAt - a.startedAt)

  return (
    <div className="panel event-log">
      <h2>ประวัติการแจ้งเตือนวันนี้ ({events.length})</h2>
      <p className="panel-note">
        รายการนี้เก็บอยู่ในหน่วยความจำของเบราว์เซอร์เท่านั้น (Phase 1) — ใน Phase 2 จะถูกส่งไปเก็บที่ backend
        เพื่อรวมเป็น dashboard ของ HR/หัวหน้างาน
      </p>
      {sorted.length === 0 ? (
        <p className="empty-state">ยังไม่มีการแจ้งเตือน</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>เวลา</th>
              <th>หมวด</th>
              <th>ประเภท</th>
              <th>ระยะเวลา</th>
              <th>ค่าที่วัดได้</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className={e.endedAt ? '' : 'row-active'}>
                <td>{formatTime(e.startedAt)}</td>
                <td>{ALERT_CATEGORY_LABELS_TH[e.category]}</td>
                <td>
                  {ALERT_LABELS_TH[e.type]}
                  {e.personName && ` (${e.personName})`}
                </td>
                <td>{e.endedAt ? formatDuration(e.startedAt, e.endedAt) : 'กำลังดำเนินอยู่...'}</td>
                <td className="metrics-cell">{formatMetrics(e.metrics)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
