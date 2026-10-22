import { useEffect, useState } from 'react'
import { listPresence, type PresenceSession } from '../services/presence'

// บันทึกการเข้า-ออก — ดึงจาก camwell-backend เป็นระยะ (ข้อมูลรวมจากทุกเครื่อง/ทุกกล้องที่ต่อ backend ตัวเดียวกัน
// ไม่ใช่แค่กล้องในหน้านี้) ชื่อที่แสดงเป็นชื่อปัจจุบันของพนักงาน — เปลี่ยนชื่อ "คนที่ N" แล้วประวัติเก่าเปลี่ยนตาม

const REFRESH_INTERVAL_MS = 5000

function formatDateTime(epochMs: number) {
  return new Date(epochMs).toLocaleString('th-TH', { hour12: false, dateStyle: 'short', timeStyle: 'medium' })
}

function formatDuration(startedAt: number, endedAt: number | null) {
  const seconds = Math.max(0, Math.round(((endedAt ?? Date.now()) - startedAt) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h} ชม. ${m} นาที`
  return m > 0 ? `${m} นาที ${s} วิ` : `${s} วิ`
}

export default function AttendancePanel() {
  const [sessions, setSessions] = useState<PresenceSession[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      listPresence(50)
        .then((rows) => {
          if (cancelled) return
          setSessions(rows)
          setError(null)
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดบันทึกการเข้า-ออกไม่สำเร็จ')
        })
    }
    load()
    const timer = window.setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="panel event-log attendance-panel">
      <h2>บันทึกการเข้า-ออก</h2>
      <p className="panel-note">
        บันทึกเมื่อระบบระบุตัวตนคนหน้ากล้องได้ และปิดเมื่อคนนั้นหายไปจากเฟรมเกิน 4 วินาที — เก็บที่ camwell-backend
        (รวมทุกกล้อง/ทุกเครื่อง)
      </p>
      {error && <p className="panel-note panel-warning">{error}</p>}
      {sessions.length === 0 ? (
        <p className="empty-state">ยังไม่มีบันทึก</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>กล้อง</th>
              <th>เข้า</th>
              <th>ออก</th>
              <th>ระยะเวลา</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className={s.endedAt ? '' : 'row-present'}>
                <td>{s.personName}</td>
                <td>{s.cameraLabel}</td>
                <td>{formatDateTime(s.startedAt)}</td>
                <td>{s.endedAt ? formatDateTime(s.endedAt) : 'ยังอยู่'}</td>
                <td>{formatDuration(s.startedAt, s.endedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
