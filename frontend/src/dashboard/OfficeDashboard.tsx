import { useState, type ReactNode } from 'react'
import OfficeRoom from './OfficeRoom'
import { DEMO_ALERT_COUNTS, useDemoPeople } from './useDemoPeople'
import { useTodayAlertCounts } from './useTodayAlertCounts'
import type { CameraSlot } from '../types/cameraSource'
import type { PersonSummary } from '../types/person'
import { isMultiPersonMode, MAX_TRACKED_PEOPLE, type DetectionMode } from '../lib/multiPerson'
import AppNavigation from '../components/AppNavigation'
import { Glyph, LockGlyph, Mark, ZzMark } from '../envelope/marks'
import '../envelope/envelope.css'
import './dashboard.css'

// Dashboard ห้องทำงาน (/?dashboard) — กล้องแต่ละตัว = ห้อง 1 ห้อง วาดเป็นผังหมึกบนฉลาก พร้อมตารางคนในห้อง
// กล้องยังทำงานอยู่เบื้องหลัง (CameraStage ต้อง mount ไว้ตลอดถึงจะตรวจจับได้) แค่ซ่อนภาพไว้ เปิดดูได้จากช่องติ๊กด้านบน

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
const TODAY = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())

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

/** ช่องติ๊กแบบพิมพ์บนฉลาก — ข้างในเป็น checkbox จริง (กดด้วยคีย์บอร์ดได้ โปรแกรมอ่านหน้าจออ่านได้) */
function PrintedCheckbox({ checked, onChange, children, title }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className="dash-check" title={title}>
      <input className="rx-visually-hidden" type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Mark state={checked ? 'tick' : 'empty'} label="" />
      <span>{children}</span>
    </label>
  )
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
  const multi = isMultiPersonMode(detectionMode)

  const scrollToRoom = (cameraId: string) => {
    document.getElementById(`room-${cameraId}`)?.scrollIntoView({ block: 'center' })
  }

  return (
    <>
      <AppNavigation active="dashboard" />
      <main className="dash rx-tokens">
        <div className="dash-perf" aria-hidden="true" />
        <div className="dash-sheet">
          {fallAlerts.map((alert) => (
            <section className="dash-fall" key={alert.id} role="alert">
              <Glyph size={34}><path d="M12 4 2.8 19.5h18.4L12 4zM12 10v4.5M12 17.2v.01" /></Glyph>
              <div className="dash-fall-copy">
                <strong>ตรวจพบการล้ม</strong>
                <span>{alert.cameraLabel ?? 'กล้อง'} · {alert.message}</span>
              </div>
              <div className="dash-fall-actions">
                <button type="button" className="dash-fall-ack" onClick={() => onAcknowledgeFall(alert.id)}>
                  <span>รับทราบเหตุการณ์</span>
                </button>
                {alert.cameraId && cameraIds.has(alert.cameraId) && (
                  <button type="button" className="dash-fall-where" onClick={() => alert.cameraId && scrollToRoom(alert.cameraId)}>
                    ดูตำแหน่ง
                  </button>
                )}
              </div>
            </section>
          ))}

          <header className="dash-head">
            <div className="dash-head-title">
              <h1>ห้องที่กำลังตรวจสอบ</h1>
              <span className="dash-live"><span className="dash-live-dot" aria-hidden="true" />LIVE</span>
              {IS_DEMO && <span className="rx-sample">ตัวอย่างจำลอง</span>}
            </div>
            <div className="dash-tally">
              <p className="rx-field"><span>พบในห้อง</span><span className="rx-hand">{total} คน</span></p>
              <p className="rx-field"><span>กล้อง</span><span className="rx-hand">{cameraSlots.length} ตัว</span></p>
              <p className="rx-field"><span>วันที่</span><span className="rx-hand">{TODAY}</span></p>
            </div>
          </header>

          <div className="dash-controls">
            <div className="dash-checks">
              <PrintedCheckbox checked={showCameras} onChange={setShowCameras}>แสดงภาพตัวอย่างกล้อง</PrintedCheckbox>
              <PrintedCheckbox
                checked={multi}
                onChange={(checked) => onDetectionModeChange(checked ? 'multi' : 'workstation')}
                title={`ตรวจได้สูงสุด ${MAX_TRACKED_PEOPLE} คนต่อกล้อง (ใช้ทรัพยากรมากขึ้น)`}
              >
                โหมดตรวจจับหลายคน
              </PrintedCheckbox>
            </div>
            <p className="dash-legend" aria-label="ความหมายของเครื่องหมายบนผัง">
              <span><Mark state="ring" label="" small />เตือน (อาการค้างนาน)</span>
              <span><ZzMark />ความล้า</span>
              <span><span className="plan-count is-some">3</span>แจ้งเตือนวันนี้</span>
              <span><span className="plan-count is-many">12</span>เกิน 10 ครั้ง</span>
            </p>
          </div>

          {!IS_DEMO && detectionMode === 'workstation' && (
            <p className="dash-hint">
              <strong>หมายเหตุ:</strong> โหมดปัจจุบันตรวจได้ 1 คนต่อกล้อง ติ๊ก "โหมดตรวจจับหลายคน" เพื่อแสดงได้สูงสุด {MAX_TRACKED_PEOPLE} คนต่อห้อง
            </p>
          )}

          <div className={`dash-workspace${showCameras && multi ? ' is-split' : ''}`}>
            <section className="dash-rooms" aria-label="ห้องที่กำลังตรวจสอบ">
              {cameraSlots.map((slot, index) => {
                const room = roomPresentation(slot, index)
                const roomFallAlerts = fallAlerts.filter((alert) => alert.cameraId === slot.id)
                return (
                  <OfficeRoom
                    key={slot.id}
                    id={`room-${slot.id}`}
                    title={room.title}
                    variant={room.variant}
                    people={roomPeople[slot.id] ?? NO_PEOPLE}
                    fallMessages={roomFallAlerts.map((alert) => alert.message)}
                    onOpenCamera={() => {
                      setShowCameras(true)
                      window.requestAnimationFrame(() => {
                        document.getElementById(`camera-feed-${slot.id}`)?.scrollIntoView({ block: 'center' })
                      })
                    }}
                    alertCounts={alertCounts}
                  />
                )
              })}
            </section>

            {/* ซ่อนด้วย hidden ไม่ใช่ unmount — CameraStage ต้องทำงานต่อเบื้องหลังเพื่ออัปเดตคนบนผัง */}
            <section className="dash-live-cameras" aria-label="ภาพสดจากกล้อง" hidden={!showCameras}>
              {cameraSlots.map((slot) => (
                <article className="dash-camera" id={`camera-feed-${slot.id}`} key={slot.id}>
                  {renderCameraStage(slot)}
                </article>
              ))}
            </section>
          </div>

          <section className="dash-notes" aria-label="การแจ้งเตือนและข้อมูลระบบ">
            {breakMessage && (
              <article className="dash-break" role="status">
                <Glyph size={26}><circle cx="12" cy="13.5" r="7" /><path d="M12 10v3.5l2.5 2M10 3h4M12 3v3.5" /></Glyph>
                <div>
                  <strong>ถึงเวลาพัก</strong>
                  <p>{breakMessage}</p>
                </div>
                <button type="button" className="dash-break-dismiss" onClick={onDismissBreak} aria-label="ปิดการแจ้งเตือนเวลาพัก" title="ปิด">
                  <Glyph><path d="M6 6l12 12M18 6 6 18" /></Glyph>
                </button>
              </article>
            )}
            <aside className="rx-promise dash-promise" aria-label="ความเป็นส่วนตัว">
              <LockGlyph />
              <p><strong>ความเป็นส่วนตัว:</strong> ระบบวิเคราะห์ภาพในเบราว์เซอร์นี้ โดยไม่ส่งภาพหรือวิดีโอออกจากเครื่อง</p>
            </aside>
          </section>
        </div>
      </main>
    </>
  )
}
