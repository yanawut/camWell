import { useCallback, useEffect, useState } from 'react'
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
import { ALERT_CATEGORY_LABELS_TH, ALERT_LABELS_TH, type AlertEvent } from './types/alerts'
import type { EnrolledPerson } from './types/identity'
import type { PersonSummary } from './types/person'
import type { PoseModel } from './hooks/usePoseLandmarker'
import { consoleAlertReporter } from './services/alertReporter'
import { listEnrolledPeople, removePerson } from './services/faceEnrollment'
import './App.css'

const BASELINE_STORAGE_KEY = 'camwell:distance-baseline-px:v1'
const CAMERA_SLOTS_STORAGE_KEY = 'camwell:camera-slots:v1'

interface FallAlertItem {
  id: string
  message: string
}

function DailySummary({ events }: { events: AlertEvent[] }) {
  const totals = new Map<string, { count: number; durationMs: number }>()
  const people = new Map<string, { count: number; durationMs: number; riskScore: number }>()
  for (const event of events) {
    const durationMs = Math.max(0, (event.endedAt ?? Date.now()) - event.startedAt)
    const category = ALERT_CATEGORY_LABELS_TH[event.category]
    const person = event.personName ?? 'ไม่ลงทะเบียน'
    const categoryValue = totals.get(category) ?? { count: 0, durationMs: 0 }
    categoryValue.count += 1; categoryValue.durationMs += durationMs; totals.set(category, categoryValue)
    const personValue = people.get(person) ?? { count: 0, durationMs: 0, riskScore: 0 }
    personValue.count += 1; personValue.durationMs += durationMs; people.set(person, personValue)
    const minutes = durationMs / 60000
    const weight = event.category === 'posture' ? 2 : event.category === 'distance' ? 1.5 : event.category === 'fatigue' ? 1 : 3
    personValue.riskScore = Math.min(100, personValue.riskScore + weight * Math.max(1, minutes))
  }
  const formatDuration = (ms: number) => {
    const seconds = Math.round(ms / 1000)
    return `${Math.floor(seconds / 60)} นาที ${seconds % 60} วิ`
  }
  const riskLabel = (score: number) => score >= 20 ? 'สูง' : score >= 8 ? 'เฝ้าระวัง' : 'ต่ำ'
  const topType = events.reduce<string | null>((best, event) => {
    const count = events.filter((item) => item.type === event.type).length
    const bestCount = best ? events.filter((item) => item.type === best).length : 0
    return count > bestCount ? event.type : best
  }, null)
  return (
    <main className="daily-summary-page">
      <div className="summary-cards">
        <div className="panel"><h2>เหตุการณ์ทั้งหมด</h2><strong>{events.length}</strong><p className="panel-note">ใน session นี้</p></div>
        <div className="panel"><h2>เวลาที่อยู่ในท่าผิด</h2><strong>{formatDuration(events.reduce((sum, e) => sum + Math.max(0, (e.endedAt ?? Date.now()) - e.startedAt), 0))}</strong></div>
        <div className="panel"><h2>ปัญหาที่พบบ่อยที่สุด</h2><strong>{topType ? ALERT_LABELS_TH[topType as keyof typeof ALERT_LABELS_TH] : '-'}</strong></div>
      </div>
      <div className="panel"><h2>สรุปตามประเภท</h2>{[...totals].map(([name, value]) => <p key={name}>{name}: <strong>{value.count}</strong> ครั้ง · {formatDuration(value.durationMs)}</p>)}</div>
      <div className="panel">
        <h2>ประเมินความเสี่ยงรายคน</h2>
        <p className="panel-note">เป็นการคัดกรองจากพฤติกรรมการนั่ง ไม่ใช่การวินิจฉัย Office Syndrome</p>
        {[...people].map(([name, value]) => (
          <p key={name}>
            <strong>{name}</strong> — ความเสี่ยง: <strong>{riskLabel(value.riskScore)}</strong> ({Math.round(value.riskScore)}/100)
            · {value.count} เหตุการณ์ · {formatDuration(value.durationMs)}
          </p>
        ))}
        {people.size > 0 && <p className="panel-warning">หากมีอาการปวด ชา อ่อนแรง หรืออาการต่อเนื่อง ควรหยุดพักและปรึกษาแพทย์หรือผู้เชี่ยวชาญ</p>}
      </div>
      {events.length === 0 && <p className="empty-state">วันนี้ยังไม่มีเหตุการณ์แจ้งเตือน</p>}
    </main>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'detection' | 'reports' | 'daily'>('detection')
  const [postureThresholds, setPostureThresholds] = useState<PostureThresholds>(DEFAULT_THRESHOLDS)
  const [fatigueThresholds, setFatigueThresholds] = useState<FatigueThresholds>(DEFAULT_FATIGUE_THRESHOLDS)
  const [distanceThresholds, setDistanceThresholds] = useState<DistanceThresholds>(DEFAULT_DISTANCE_THRESHOLDS)
  const [breakThresholds, setBreakThresholds] = useState<BreakThresholds>(DEFAULT_BREAK_THRESHOLDS)
  const [fallThresholds, setFallThresholds] = useState<FallThresholds>(DEFAULT_FALL_THRESHOLDS)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [faceFeaturesEnabled, setFaceFeaturesEnabled] = useState(true)
  const [poseModel, setPoseModel] = useState<PoseModel>('lite')

  const [events, setEvents] = useState<AlertEvent[]>([])
  // (Phase 2) รายชื่อพนักงานที่ลงทะเบียนใบหน้าไว้ย้ายมาเก็บที่ camwell-backend แล้ว — ดึงมาตอน mount ด้วย
  // useEffect แทน lazy initializer เดิม (ตอนยังเก็บ localStorage อยู่ ดึงแบบ sync ได้เลยไม่ต้องรอ)
  const [enrolledPeople, setEnrolledPeople] = useState<EnrolledPerson[]>([])
  const [enrolledPeopleError, setEnrolledPeopleError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listEnrolledPeople()
      .then((people) => {
        if (!cancelled) setEnrolledPeople(people)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setEnrolledPeopleError(
          err instanceof Error ? err.message : 'โหลดรายชื่อพนักงานที่ลงทะเบียนไว้ไม่สำเร็จ',
        )
      })
    return () => {
      cancelled = true
    }
  }, [])
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
      .then(() => {
        setEnrolledPeople((prev) => prev.filter((p) => p.id !== id))
      })
      .catch((err: unknown) => {
        setEnrolledPeopleError(err instanceof Error ? err.message : 'ลบพนักงานไม่สำเร็จ')
      })
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Camwell — ระบบตรวจจับท่านั่งและความเหนื่อยล้าของพนักงาน</h1>
        <p>Phase 1 (MVP): ตรวจจับแบบ client-side ล้วน ด้วย MediaPipe Pose Landmarker + @vladmandic/face-api รันในเบราว์เซอร์</p>
      </header>

      <nav className="app-tabs" aria-label="เมนูหลัก">
        <button
          type="button"
          className={activeTab === 'detection' ? 'app-tab active' : 'app-tab'}
          onClick={() => setActiveTab('detection')}
        >
          ตรวจจับ
        </button>
        <button
          type="button"
          className={activeTab === 'reports' ? 'app-tab active' : 'app-tab'}
          onClick={() => setActiveTab('reports')}
        >
          รายงาน <span className="tab-count">{events.length}</span>
        </button>
        <button
          type="button"
          className={activeTab === 'daily' ? 'app-tab active' : 'app-tab'}
          onClick={() => setActiveTab('daily')}
        >
          สรุปผลของวัน
        </button>
      </nav>

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

      {activeTab === 'detection' ? (
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
                    poseModel={poseModel}
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
            poseModel={poseModel}
            onPoseModelChange={setPoseModel}
          />
          {faceFeaturesEnabled && enrolledPeopleError && <p className="panel-note panel-warning">{enrolledPeopleError}</p>}
          {faceFeaturesEnabled && <EnrollmentPanel people={enrolledPeople} onRemove={handleRemovePerson} />}
          <EventLog events={events} />
          </section>
        </main>
      ) : activeTab === 'reports' ? (
        <main className="reports-page">
          <div className="panel live-status-panel">
            <h2>สถานะการตรวจจับแบบเรียลไทม์</h2>
            {Object.values(peopleBySlot).flat().length === 0 ? (
              <p className="empty-state">ยังไม่พบคนในเฟรม</p>
            ) : (
              <ul className="people-list">
                {Object.values(peopleBySlot).flat().map((person) => (
                  <li key={person.trackId}>
                    <strong>{person.label}</strong> — {person.postureStatus}
                    {person.fatigueActive && ' · ⚠ เหนื่อยล้า/หาว'}
                    {person.distanceActive && ' · ⚠ ใกล้จอเกินไป'}
                  </li>
                ))}
              </ul>
            )}
            <p className="panel-note">สถานะนี้มาจากการตรวจจับล่าสุด ส่วนประวัติด้านล่างจะแสดงเมื่อปัญหาค้างเกินเวลาที่ตั้งไว้</p>
          </div>
          <div className="reports-summary panel">
            <h2>สรุปการแจ้งเตือน</h2>
            <p>เหตุการณ์ทั้งหมดที่เกิดขึ้นในเซสชันนี้: <strong>{events.length}</strong> รายการ</p>
            <p className="panel-note">ข้อมูลรายงานยังเก็บอยู่ในหน่วยความจำของเบราว์เซอร์ และจะหายเมื่อรีโหลดหน้าเว็บ</p>
          </div>
          <EventLog events={events} />
        </main>
      ) : (
        <DailySummary events={events} />
      )}

      <footer className="app-footer">
        <p>
          ระบบจดจำใบหน้า/ระบุตัวตนพนักงาน เชื่อมกับ backend (camwell-backend) + ฐานข้อมูล SQLite แล้ว ทำให้พนักงาน
          คนเดียวกันถูกจำได้ทุกเครื่อง/ทุกกล้องในออฟฟิศ — ส่วนการตรวจจับท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ/หกล้ม
          ยังเป็น local AI ในเบราว์เซอร์ล้วนเหมือนเดิม ขั้นต่อไป: ส่ง log เหตุการณ์แจ้งเตือนไปที่ backend ด้วย เพื่อทำ
          dashboard ของ HR/หัวหน้างาน และแจ้งเตือนผ่าน LINE Messaging API — ดู <code>src/services/alertReporter.ts</code>{' '}
          สำหรับสัญญาที่เตรียมไว้ให้เชื่อมต่อ
        </p>
        <p className="pdpa-note">
          ⚠️ ฟีเจอร์ face recognition เก็บข้อมูลชีวภาพ (biometric) ไว้ที่ backend/ฐานข้อมูลของระบบนี้เท่านั้น (ดู
          camwell-backend/README.md) การใช้งานจริงกับพนักงานต้องขอความยินยอมตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
          (PDPA) ก่อนเสมอ — โปรดปรึกษาฝ่ายกฎหมาย/HR ก่อนนำไปใช้งานจริง
        </p>
      </footer>
    </div>
  )
}
