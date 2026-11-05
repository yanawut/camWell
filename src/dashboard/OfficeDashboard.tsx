import { useState, type ReactNode } from 'react'
import OfficeRoom from './OfficeRoom'
import { DEMO_ALERT_COUNTS, useDemoPeople } from './useDemoPeople'
import { useTodayAlertCounts } from './useTodayAlertCounts'
import type { CameraSlot } from '../types/cameraSource'
import type { PersonSummary } from '../types/person'
import { MAX_TRACKED_PEOPLE, type DetectionMode } from '../lib/multiPerson'
import AppNavigation from '../components/AppNavigation'
import './dashboard.css'

// Dashboard ห้องทำงาน (/?dashboard) — กล้องแต่ละตัว = ห้อง 1 ห้อง คนที่ตรวจพบในเฟรมโผล่เป็นตัวละครประจำที่นั่ง
// กล้องยังทำงานอยู่เบื้องหลัง (CameraStage ต้อง mount ไว้ตลอดถึงจะตรวจจับได้) แค่ซ่อนภาพไว้ เปิดดูได้จากปุ่มด้านบน

interface Props {
  cameraSlots: CameraSlot[]
  peopleBySlot: Record<string, PersonSummary[]>
  renderCameraStage: (slot: CameraSlot) => ReactNode
  detectionMode: DetectionMode
  onDetectionModeChange: (mode: DetectionMode) => void
  /** จำนวนเหตุการณ์แจ้งเตือนที่เกิดในหน้านี้ — เปลี่ยนเมื่อไหร่ดึงจำนวน "วันนี้" จาก backend ใหม่ทันที */
  alertEventCount: number
  fallAlerts: { id: string; message: string; cameraId?: string; cameraLabel?: string }[]
  onAcknowledgeFall: (id: string) => void
  breakMessage: string | null
  onDismissBreak: () => void
}

const NO_PEOPLE: PersonSummary[] = []
const IS_DEMO = new URLSearchParams(window.location.search).has('demo')

function roomPresentation(slot: CameraSlot, index: number): { title: string; variant: 'office' | 'meeting' } {
  const label = slot.label.trim()
  if (/main office|ห้องทำงานหลัก/i.test(label)) return { title: label, variant: 'office' }
  if (/meeting|ห้องประชุม/i.test(label)) return { title: label, variant: 'meeting' }
  if (/^กล้อง\s*1$/i.test(label)) return { title: 'ห้องทำงานหลัก (MAIN OFFICE)', variant: 'office' }
  if (/^กล้อง\s*2$/i.test(label)) return { title: 'ห้องประชุม A (MEETING ROOM A)', variant: 'meeting' }
  return {
    title: `ห้อง · ${label || `กล้อง ${index + 1}`}`,
    variant: /meeting|ประชุม/i.test(label) ? 'meeting' : 'office',
  }
}

export default function OfficeDashboard({
  cameraSlots,
  peopleBySlot,
  renderCameraStage,
  detectionMode,
  onDetectionModeChange,
  alertEventCount,
  fallAlerts,
  onAcknowledgeFall,
  breakMessage,
  onDismissBreak,
}: Props) {
  // CameraStage ยัง mount อยู่เสมอ แต่เปิดภาพสดเมื่อผู้ใช้เลือกดู
  const [showCameras, setShowCameras] = useState(false)
  const demoPeople = useDemoPeople(IS_DEMO, cameraSlots)
  const roomPeople = demoPeople ?? peopleBySlot
  const todayCounts = useTodayAlertCounts(!IS_DEMO, alertEventCount)
  // โหมดสาธิต: ตัวเลขจำลองคงที่ต่อคน (ไม่ดึงจาก backend)
  const alertCounts = IS_DEMO ? DEMO_ALERT_COUNTS : todayCounts
  const total = cameraSlots.reduce((sum, slot) => sum + (roomPeople[slot.id]?.length ?? 0), 0)
  const cameraIds = new Set(cameraSlots.map((slot) => slot.id))

  const scrollToRoom = (cameraId: string) => {
    document.getElementById(`room-${cameraId}`)?.scrollIntoView({ block: 'center' })
  }

  return (
    <>
      <AppNavigation active="dashboard" dashboardStats={{ people: total, cameras: cameraSlots.length }} />
      <main className="dash-shell">
      {fallAlerts.map((alert) => (
        <section className="dash-fall-banner" key={alert.id} role="alert">
        <span className="dash-fall-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.5 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm-2.4 4.1-2.6 1.3c-.4.2-.6.7-.4 1.1l1.2 2.5-3.3 1.9c-.4.2-.5.7-.3 1.1l1.5 2.6c.2.4.7.5 1.1.3l3.6-2.1 2.3 3.8c.2.4.7.5 1.1.3l2.6-1.5c.4-.2.5-.7.3-1.1l-2.6-4.3 1.8-3.1 1.7 1c.4.2.9.1 1.1-.3l.7-1.2c.2-.4.1-.9-.3-1.1l-3.3-1.9c-.6-.4-1.3-.3-1.8.2l-2.8 1.4-1.9-1.9c-.4-.4-1-.5-1.5-.2z" />
          </svg>
        </span>
          <div className="dash-fall-copy">
            <strong>พบเหตุการณ์ฉุกเฉิน: ตรวจพบการล้ม!</strong>
            <span>{alert.cameraLabel ?? 'กล้อง'} · {alert.message}</span>
          </div>
          <div className="dash-fall-actions">
            <button type="button" onClick={() => onAcknowledgeFall(alert.id)}>รับทราบเหตุการณ์</button>
            {alert.cameraId && cameraIds.has(alert.cameraId) && (
              <button type="button" className="dash-fall-location" onClick={() => alert.cameraId && scrollToRoom(alert.cameraId)}>
                ดูตำแหน่ง
              </button>
            )}
          </div>
        </section>
      ))}
      <header className="dash-header">
        <div className="dash-title-group">
          <h1>ห้องที่กำลังตรวจสอบ <span className="dash-live-pill">LIVE</span></h1>
        </div>
        <div className="dash-actions">
          <label className="dash-toggle">
            <input type="checkbox" checked={showCameras} onChange={(e) => setShowCameras(e.target.checked)} />
            แสดงภาพตัวอย่างกล้อง
          </label>
          <label className="dash-toggle" title={`ตรวจได้สูงสุด ${MAX_TRACKED_PEOPLE} คนต่อกล้อง (ใช้ทรัพยากรมากขึ้น)`}>
            <input
              type="checkbox"
              checked={detectionMode === 'multi'}
              onChange={(e) => onDetectionModeChange(e.target.checked ? 'multi' : 'workstation')}
            />
            โหมดตรวจจับหลายคน
          </label>
        </div>
      </header>

      {!IS_DEMO && detectionMode === 'workstation' && (
        <p className="dash-hint">
          โหมดปัจจุบันตรวจได้ 1 คนต่อกล้อง — ติ๊ก "ตรวจหลายคนต่อกล้อง" เพื่อให้แสดงได้สูงสุด {MAX_TRACKED_PEOPLE} คนต่อห้อง
        </p>
      )}

      <div className={`dash-workspace${showCameras && detectionMode === 'multi' ? ' is-split' : ''}`}>
      <section className="dash-rooms" aria-label="ห้องที่กำลังตรวจสอบ">
        {cameraSlots.map((slot, index) => {
          const room = roomPresentation(slot, index)
          const roomFallAlerts = fallAlerts.filter((alert) => alert.cameraId === slot.id)
          return (
            <div key={slot.id} className="dash-room-column">
              <OfficeRoom
                id={`room-${slot.id}`}
                title={room.title}
                variant={room.variant}
                people={roomPeople[slot.id] ?? NO_PEOPLE}
                hasFallAlert={roomFallAlerts.length > 0}
                fallAlertCount={roomFallAlerts.length}
                onOpenCamera={() => {
                  setShowCameras(true)
                  window.requestAnimationFrame(() => {
                    document.getElementById(`camera-feed-${slot.id}`)?.scrollIntoView({ block: 'center' })
                  })
                }}
                alertCounts={alertCounts}
              />
            </div>
          )
        })}
      </section>

      {/* ซ่อนด้วย hidden ไม่ใช่ unmount — CameraStage ต้องทำงานต่อเบื้องหลังเพื่ออัปเดตตัวละคร */}
      <section className="dash-live-cameras" aria-label="ภาพสดจากกล้อง" hidden={!showCameras}>
        {cameraSlots.map((slot) => (
          <article className="dash-camera" id={`camera-feed-${slot.id}`} key={slot.id}>
            {renderCameraStage(slot)}
          </article>
        ))}
      </section>
      </div>

      <section className="dash-notices" aria-label="การแจ้งเตือนและข้อมูลระบบ">
        {breakMessage && (
          <article className="dash-notice dash-notice-break">
            <span className="dash-notice-icon" aria-hidden="true">☕</span>
            <div><strong>การแจ้งเตือนเวลาพัก</strong><p>{breakMessage}</p></div>
            <button type="button" className="dash-notice-dismiss" onClick={onDismissBreak} aria-label="ปิดการแจ้งเตือนเวลาพัก">×</button>
          </article>
        )}
        {IS_DEMO ? (
          <article className="dash-notice dash-notice-demo">
            <span className="dash-notice-icon" aria-hidden="true">i</span>
            <div><strong>ระบบทำงานในโหมดตัวอย่าง (DEMO DATA)</strong><p>ข้อมูลที่เห็นเป็นข้อมูลจำลองเพื่อวัตถุประสงค์ในการนำเสนอ</p></div>
          </article>
        ) : (
          <article className="dash-notice dash-notice-privacy">
            <span className="dash-notice-icon" aria-hidden="true">✓</span>
            <div><strong>ประมวลผลวิดีโอในเครื่อง</strong><p>ระบบวิเคราะห์ภาพในเบราว์เซอร์นี้ โดยไม่ส่งภาพหรือวิดีโอออกจากเครื่อง</p></div>
          </article>
        )}
      </section>
      </main>
    </>
  )
}
