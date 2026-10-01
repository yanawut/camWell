import { useCallback, useState } from 'react'
import CameraStage from './components/CameraStage'
import CameraSourceSelector from './components/CameraSourceSelector'
import SettingsPanel from './components/SettingsPanel'
import EventLog from './components/EventLog'
import EnrollmentPanel from './components/EnrollmentPanel'
import { DEFAULT_THRESHOLDS, type PostureThresholds } from './types/posture'
import { MAX_CAMERA_SLOTS, createCameraSlot, type CameraSlot, type CameraSource } from './types/cameraSource'
import {
  DEFAULT_BREAK_THRESHOLDS,
  DEFAULT_DISTANCE_THRESHOLDS,
  DEFAULT_FATIGUE_THRESHOLDS,
  type BreakThresholds,
  type DistanceThresholds,
  type FatigueThresholds,
} from './types/wellbeing'
import { DEFAULT_FALL_THRESHOLDS, type FallThresholds } from './types/fall'
import type { AlertEvent } from './types/alerts'
import type { EnrolledPerson } from './types/identity'
import type { PersonSummary } from './types/person'
import { consoleAlertReporter } from './services/alertReporter'
import { listEnrolledPeople, removePerson } from './services/faceEnrollment'
import './App.css'

const BASELINE_STORAGE_KEY = 'camwell:distance-baseline-px:v1'
const CAMERA_SLOTS_STORAGE_KEY = 'camwell:camera-slots:v1'

interface FallAlertItem {
  id: string
  message: string
}

export default function App() {
  const [postureThresholds, setPostureThresholds] = useState<PostureThresholds>(DEFAULT_THRESHOLDS)
  const [fatigueThresholds, setFatigueThresholds] = useState<FatigueThresholds>(DEFAULT_FATIGUE_THRESHOLDS)
  const [distanceThresholds, setDistanceThresholds] = useState<DistanceThresholds>(DEFAULT_DISTANCE_THRESHOLDS)
  const [breakThresholds, setBreakThresholds] = useState<BreakThresholds>(DEFAULT_BREAK_THRESHOLDS)
  const [fallThresholds, setFallThresholds] = useState<FallThresholds>(DEFAULT_FALL_THRESHOLDS)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [faceFeaturesEnabled, setFaceFeaturesEnabled] = useState(true)

  const [events, setEvents] = useState<AlertEvent[]>([])
  // อ่านค่าเริ่มต้นจาก localStorage ตอน init state โดยตรง (lazy initializer) แทนการใช้ useEffect+setState
  // ซึ่งจะทำให้เกิด render ซ้ำโดยไม่จำเป็น
  const [enrolledPeople, setEnrolledPeople] = useState<EnrolledPerson[]>(() => listEnrolledPeople())
  const [baselineFaceWidthPx, setBaselineFaceWidthPx] = useState<number | null>(() => {
    const saved = localStorage.getItem(BASELINE_STORAGE_KEY)
    return saved ? Number(saved) : null
  })
  const [breakMessage, setBreakMessage] = useState<string | null>(null)
  const [fallAlerts, setFallAlerts] = useState<FallAlertItem[]>([])
  // รายชื่อ "ใครอยู่บ้าง" แยกเก็บตามกล้อง (slotId) — แต่ละ CameraStage ตรวจจับคนอิสระจากกัน จึงรายงานแยกกัน
  const [peopleBySlot, setPeopleBySlot] = useState<Record<string, PersonSummary[]>>({})
  // ต่อกล้องได้พร้อมกันหลายตัว (grid) — อ่านค่าเริ่มต้นจาก localStorage ตอน init state โดยตรงเช่นเดียวกับ state อื่นๆ
  const [cameraSlots, setCameraSlots] = useState<CameraSlot[]>(() => {
    try {
      const saved = localStorage.getItem(CAMERA_SLOTS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as CameraSlot[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, MAX_CAMERA_SLOTS)
      }
    } catch {
      // ค่าที่เก็บไว้เสีย/อ่านไม่ออก — ใช้ค่าเริ่มต้นกล้องเดียวด้านล่างแทน
    }
    return [createCameraSlot('cam-1', 'กล้อง 1')]
  })
  const multiCameraMode = cameraSlots.length > 1

  const persistCameraSlots = useCallback((slots: CameraSlot[]) => {
    localStorage.setItem(CAMERA_SLOTS_STORAGE_KEY, JSON.stringify(slots))
  }, [])

  const handleCameraSlotSourceChange = useCallback(
    (id: string, source: CameraSource) => {
      setCameraSlots((prev) => {
        const next = prev.map((slot) => (slot.id === id ? { ...slot, source } : slot))
        persistCameraSlots(next)
        return next
      })
    },
    [persistCameraSlots],
  )

  const handleAddCameraSlot = useCallback(() => {
    setCameraSlots((prev) => {
      if (prev.length >= MAX_CAMERA_SLOTS) return prev
      const nextIndex = prev.length + 1
      const next = [...prev, createCameraSlot(`cam-${nextIndex}-${Date.now()}`, `กล้อง ${nextIndex}`)]
      persistCameraSlots(next)
      return next
    })
  }, [persistCameraSlots])

  const handleRemoveCameraSlot = useCallback(
    (id: string) => {
      setCameraSlots((prev) => {
        if (prev.length <= 1) return prev
        const next = prev.filter((slot) => slot.id !== id)
        persistCameraSlots(next)
        return next
      })
      setPeopleBySlot((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
    [persistCameraSlots],
  )

  const handlePeopleUpdate = useCallback((slotId: string, summaries: PersonSummary[]) => {
    setPeopleBySlot((prev) => ({ ...prev, [slotId]: summaries }))
  }, [])

  const handleAlertStart = useCallback((event: AlertEvent) => {
    setEvents((prev) => [...prev, event])
    consoleAlertReporter.reportStart(event)
  }, [])

  const handleAlertEnd = useCallback((event: AlertEvent) => {
    setEvents((prev) => prev.map((e) => (e.id === event.id ? event : e)))
    consoleAlertReporter.reportEnd(event)
  }, [])

  const handleCalibrateDistance = useCallback((widthPx: number) => {
    setBaselineFaceWidthPx(widthPx)
    localStorage.setItem(BASELINE_STORAGE_KEY, String(widthPx))
  }, [])

  const handleBreakDue = useCallback((personLabel: string, continuousMinutes: number) => {
    setBreakMessage(`${personLabel} นั่งต่อเนื่องมาแล้วประมาณ ${continuousMinutes} นาที ลองลุกไปยืดเส้นยืดสายสักครู่นะครับ`)
  }, [])

  const handleFallDetected = useCallback((event: AlertEvent) => {
    const personLabel = event.personName ?? 'พนักงาน'
    const message =
      event.type === 'fall_suspected_left_frame'
        ? `สงสัยว่า ${personLabel} หกล้ม/ตกจากเก้าอี้ แล้วหายไปจากมุมกล้องกะทันหัน — กรุณาตรวจสอบด่วน!`
        : `ตรวจพบว่า ${personLabel} อาจหกล้มหรือตกจากเก้าอี้ — กรุณาตรวจสอบด่วน!`
    setFallAlerts((prev) => [...prev, { id: event.id, message }])
  }, [])

  const handleAcknowledgeFall = useCallback((id: string) => {
    setFallAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handlePersonEnrolled = useCallback((person: EnrolledPerson) => {
    setEnrolledPeople((prev) => [...prev, person])
  }, [])

  const handleRemovePerson = useCallback((id: string) => {
    removePerson(id)
    setEnrolledPeople((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Camwell — ระบบตรวจจับท่านั่งและความเหนื่อยล้าของพนักงาน</h1>
        <p>Phase 1 (MVP): ตรวจจับแบบ client-side ล้วน ด้วย MediaPipe Pose Landmarker + @vladmandic/face-api รันในเบราว์เซอร์</p>
      </header>

      {fallAlerts.map((alert) => (
        <div key={alert.id} className="fall-alert-banner">
          <span>🚨 {alert.message}</span>
          <button type="button" onClick={() => handleAcknowledgeFall(alert.id)}>
            รับทราบ
          </button>
        </div>
      ))}

      {breakMessage && (
        <div className="break-banner">
          <span>🧘 {breakMessage}</span>
          <button type="button" onClick={() => setBreakMessage(null)}>
            รับทราบ
          </button>
        </div>
      )}

      <main className="app-grid">
        <section className="camera-column">
          <div className="camera-grid">
            {cameraSlots.map((slot) => {
              const people = peopleBySlot[slot.id] ?? []
              return (
                <div key={slot.id} className="camera-cell">
                  <CameraSourceSelector
                    value={slot.source}
                    onChange={(source) => handleCameraSlotSourceChange(slot.id, source)}
                    title={multiCameraMode ? slot.label : 'แหล่งภาพกล้อง'}
                    headerExtra={
                      cameraSlots.length > 1 ? (
                        <button type="button" className="link-button" onClick={() => handleRemoveCameraSlot(slot.id)}>
                          ลบกล้องนี้
                        </button>
                      ) : undefined
                    }
                  />
                  <CameraStage
                    postureThresholds={postureThresholds}
                    fatigueThresholds={fatigueThresholds}
                    distanceThresholds={distanceThresholds}
                    breakThresholds={breakThresholds}
                    fallThresholds={fallThresholds}
                    soundEnabled={soundEnabled}
                    faceFeaturesEnabled={faceFeaturesEnabled}
                    enrolledPeople={enrolledPeople}
                    baselineFaceWidthPx={baselineFaceWidthPx}
                    cameraSource={slot.source}
                    cameraId={slot.id}
                    cameraLabel={slot.label}
                    multiCameraMode={multiCameraMode}
                    onCalibrateDistance={handleCalibrateDistance}
                    onAlertStart={handleAlertStart}
                    onAlertEnd={handleAlertEnd}
                    onBreakDue={handleBreakDue}
                    onFallDetected={handleFallDetected}
                    onPeopleUpdate={(summaries) => handlePeopleUpdate(slot.id, summaries)}
                    onPersonEnrolled={handlePersonEnrolled}
                  />
                  {faceFeaturesEnabled && people.length > 0 && (
                    <ul className="people-list">
                      {people.map((person) => (
                        <li key={person.trackId}>
                          <strong>{person.label}</strong> — {person.postureStatus}
                          {person.fatigueActive && ' · ⚠ ความเหนื่อยล้า/หาว'}
                          {person.distanceActive && ' · ⚠ นั่งใกล้จอเกินไป'}
                          {person.yawnCount > 0 && ` · หาวสะสม ${person.yawnCount} ครั้ง`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {faceFeaturesEnabled && people.length === 0 && <p className="identity-line">ยังไม่พบคนในเฟรม</p>}
                </div>
              )
            })}
          </div>
          {cameraSlots.length < MAX_CAMERA_SLOTS && (
            <button type="button" className="secondary-button" onClick={handleAddCameraSlot}>
              + เพิ่มกล้อง (สูงสุด {MAX_CAMERA_SLOTS} ตัวพร้อมกัน)
            </button>
          )}
        </section>

        <section className="side-column">
          <SettingsPanel
            postureThresholds={postureThresholds}
            onPostureChange={setPostureThresholds}
            fatigueThresholds={fatigueThresholds}
            onFatigueChange={setFatigueThresholds}
            distanceThresholds={distanceThresholds}
            onDistanceChange={setDistanceThresholds}
            breakThresholds={breakThresholds}
            onBreakChange={setBreakThresholds}
            fallThresholds={fallThresholds}
            onFallChange={setFallThresholds}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={setSoundEnabled}
            faceFeaturesEnabled={faceFeaturesEnabled}
            onFaceFeaturesEnabledChange={setFaceFeaturesEnabled}
          />
          {faceFeaturesEnabled && <EnrollmentPanel people={enrolledPeople} onRemove={handleRemovePerson} />}
          <EventLog events={events} />
        </section>
      </main>

      <footer className="app-footer">
        <p>
          ขั้นต่อไป (Phase 2): เชื่อมกับ backend เพื่อรวม dashboard ของ HR/หัวหน้างาน เก็บ log ลงฐานข้อมูล
          และแจ้งเตือนผ่าน LINE Messaging API — ดู <code>src/services/alertReporter.ts</code> สำหรับสัญญาที่เตรียมไว้ให้เชื่อมต่อ
        </p>
        <p className="pdpa-note">
          ⚠️ ฟีเจอร์ face recognition เก็บข้อมูลชีวภาพ (biometric) ไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น แต่การใช้งานจริงกับพนักงาน
          ต้องขอความยินยอมตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ก่อนเสมอ — โปรดปรึกษาฝ่ายกฎหมาย/HR ก่อนนำไปใช้งานจริง
        </p>
      </footer>
    </div>
  )
}
