import { useCallback, useState } from 'react'
import CameraStage from './components/CameraStage'
import SettingsPanel from './components/SettingsPanel'
import EventLog from './components/EventLog'
import EnrollmentPanel from './components/EnrollmentPanel'
import { DEFAULT_THRESHOLDS, type PostureThresholds } from './types/posture'
import {
  DEFAULT_BREAK_THRESHOLDS,
  DEFAULT_DISTANCE_THRESHOLDS,
  DEFAULT_FATIGUE_THRESHOLDS,
  type BreakThresholds,
  type DistanceThresholds,
  type FatigueThresholds,
} from './types/wellbeing'
import type { AlertEvent } from './types/alerts'
import type { EnrolledPerson, IdentityReading } from './types/identity'
import { consoleAlertReporter } from './services/alertReporter'
import { listEnrolledPeople, removePerson } from './services/faceEnrollment'
import './App.css'

const BASELINE_STORAGE_KEY = 'camwell:distance-baseline-px:v1'

export default function App() {
  const [postureThresholds, setPostureThresholds] = useState<PostureThresholds>(DEFAULT_THRESHOLDS)
  const [fatigueThresholds, setFatigueThresholds] = useState<FatigueThresholds>(DEFAULT_FATIGUE_THRESHOLDS)
  const [distanceThresholds, setDistanceThresholds] = useState<DistanceThresholds>(DEFAULT_DISTANCE_THRESHOLDS)
  const [breakThresholds, setBreakThresholds] = useState<BreakThresholds>(DEFAULT_BREAK_THRESHOLDS)
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
  const [identity, setIdentity] = useState<IdentityReading | null>(null)
  const [yawnCount, setYawnCount] = useState(0)

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

  const handleBreakDue = useCallback((continuousMinutes: number) => {
    setBreakMessage(`คุณนั่งต่อเนื่องมาแล้วประมาณ ${continuousMinutes} นาที ลองลุกไปยืดเส้นยืดสายสักครู่นะครับ`)
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
          <CameraStage
            postureThresholds={postureThresholds}
            fatigueThresholds={fatigueThresholds}
            distanceThresholds={distanceThresholds}
            breakThresholds={breakThresholds}
            soundEnabled={soundEnabled}
            faceFeaturesEnabled={faceFeaturesEnabled}
            enrolledPeople={enrolledPeople}
            baselineFaceWidthPx={baselineFaceWidthPx}
            onCalibrateDistance={handleCalibrateDistance}
            onAlertStart={handleAlertStart}
            onAlertEnd={handleAlertEnd}
            onBreakDue={handleBreakDue}
            onIdentityChange={setIdentity}
            onYawnCounted={setYawnCount}
            onPersonEnrolled={handlePersonEnrolled}
          />
          {faceFeaturesEnabled && (
            <p className="identity-line">
              {identity?.matchedPersonName
                ? `ระบุตัวตน: ${identity.matchedPersonName}`
                : identity?.matchedPersonId === 'unknown'
                  ? 'ระบุตัวตน: ไม่รู้จัก'
                  : 'ระบุตัวตน: -'}
              {' · '}หาวสะสม: {yawnCount} ครั้ง
            </p>
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
