import { useMemo, useState, type ReactNode } from 'react'
import OfficeRoom from './OfficeRoom'
import { useDemoPeople } from './useDemoPeople'
import { useTodayAlertCounts } from './useTodayAlertCounts'
import type { CameraSlot } from '../types/cameraSource'
import type { PersonSummary } from '../types/person'
import { MAX_TRACKED_PEOPLE, type DetectionMode } from '../lib/multiPerson'
import './dashboard.css'

// Dashboard ห้องทำงาน (/?dashboard) — กล้องแต่ละตัว = ห้อง 1 ห้อง คนที่ตรวจพบในเฟรมโผล่เป็นตัวละคร pixel art
// กล้องยังทำงานอยู่เบื้องหลัง (CameraStage ต้อง mount ไว้ตลอดถึงจะตรวจจับได้) แค่ซ่อนภาพไว้ เปิดดูได้จากปุ่มด้านบน

interface Props {
  cameraSlots: CameraSlot[]
  peopleBySlot: Record<string, PersonSummary[]>
  renderCameraStage: (slot: CameraSlot) => ReactNode
  detectionMode: DetectionMode
  onDetectionModeChange: (mode: DetectionMode) => void
  /** จำนวนเหตุการณ์แจ้งเตือนที่เกิดในหน้านี้ — เปลี่ยนเมื่อไหร่ดึงจำนวน "วันนี้" จาก backend ใหม่ทันที */
  alertEventCount: number
}

const NO_PEOPLE: PersonSummary[] = []
const IS_DEMO = new URLSearchParams(window.location.search).has('demo')

export default function OfficeDashboard({
  cameraSlots,
  peopleBySlot,
  renderCameraStage,
  detectionMode,
  onDetectionModeChange,
  alertEventCount,
}: Props) {
  const [showCameras, setShowCameras] = useState(false)
  const demoPeople = useDemoPeople(IS_DEMO, cameraSlots)
  const roomPeople = demoPeople ?? peopleBySlot
  const todayCounts = useTodayAlertCounts(!IS_DEMO, alertEventCount)
  // โหมดสาธิต: ตัวเลขจำลองคงที่ต่อคน (ไม่ดึงจาก backend)
  const demoCounts = useMemo(() => {
    if (!demoPeople) return null
    const counts = new Map<string, number>()
    for (const people of Object.values(demoPeople)) {
      for (const p of people) if (p.employeeId) counts.set(p.employeeId, (p.label.length * 7) % 6)
    }
    return counts
  }, [demoPeople])
  const alertCounts = demoCounts ?? todayCounts
  const total = cameraSlots.reduce((sum, slot) => sum + (roomPeople[slot.id]?.length ?? 0), 0)

  return (
    <div className="dash-shell">
      <header className="dash-header">
        <div>
          <h1>Dashboard ห้องทำงาน</h1>
          <p>
            ตอนนี้มี <strong>{total}</strong> คนในห้องทั้งหมด · {cameraSlots.length} กล้อง — ตัวละครโผล่เมื่อพบคนในเฟรม
            และหายไปเมื่อออกจากเฟรมเกิน 4 วินาที
          </p>
        </div>
        <nav className="dash-actions">
          <label className="dash-toggle" title={`ตรวจได้สูงสุด ${MAX_TRACKED_PEOPLE} คนต่อกล้อง (ใช้ทรัพยากรมากขึ้น)`}>
            <input
              type="checkbox"
              checked={detectionMode === 'multi'}
              onChange={(e) => onDetectionModeChange(e.target.checked ? 'multi' : 'workstation')}
            />
            ตรวจหลายคนต่อกล้อง
          </label>
          <label className="dash-toggle">
            <input type="checkbox" checked={showCameras} onChange={(e) => setShowCameras(e.target.checked)} />
            แสดงภาพกล้อง
          </label>
          <a className="dash-link" href="?alerts">
            ผลการแจ้งเตือน
          </a>
          <a className="dash-link" href="./">
            ← หน้ากล้อง
          </a>
        </nav>
      </header>

      {IS_DEMO && (
        <p className="dash-hint">โหมดสาธิต — ตัวละครในห้องเป็นข้อมูลจำลอง ไม่ได้มาจากกล้อง (เอา &amp;demo ออกจาก URL เพื่อใช้ข้อมูลจริง)</p>
      )}
      {!IS_DEMO && detectionMode === 'workstation' && (
        <p className="dash-hint">
          โหมดปัจจุบันตรวจได้ 1 คนต่อกล้อง — ติ๊ก "ตรวจหลายคนต่อกล้อง" เพื่อให้แสดงได้สูงสุด {MAX_TRACKED_PEOPLE} คนต่อห้อง
        </p>
      )}

      <main className="dash-rooms">
        {cameraSlots.map((slot) => (
          <div key={slot.id} className="dash-room-column">
            <OfficeRoom
              title={`ห้อง · ${slot.label}`}
              people={roomPeople[slot.id] ?? NO_PEOPLE}
              alertCounts={alertCounts}
            />
            {/* ซ่อนด้วย hidden ไม่ใช่ unmount — CameraStage ต้องทำงานต่อเบื้องหลังเพื่ออัปเดตตัวละคร */}
            <div className="dash-camera" hidden={!showCameras}>
              {renderCameraStage(slot)}
            </div>
          </div>
        ))}
      </main>

      <footer className="dash-legend">
        <span>
          <span className="dash-bubble is-alert">!</span> ท่านั่งไม่ดี / นั่งใกล้จอเกินไป
        </span>
        <span>
          <span className="dash-bubble is-tired">Zz</span> ง่วง / เหนื่อยล้า
        </span>
        <span>
          <span className="dash-count has-alerts">3</span> จำนวนครั้งที่ถูกแจ้งเตือนวันนี้ (รวมทุกกล้อง)
        </span>
        <span>ตัวละครคนเดิมหน้าตาเหมือนเดิมทุกครั้ง (ผูกกับตัวตนที่ระบบจำได้)</span>
      </footer>
    </div>
  )
}
