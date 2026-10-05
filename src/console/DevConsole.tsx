import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { CameraStats } from '../components/CameraStage'
import MonitorTab from './MonitorTab'
import ThresholdsTab from './ThresholdsTab'
import EventsTab from './EventsTab'
import PeopleTab from './PeopleTab'
import { useBackendHealth } from './useBackendHealth'
import { datasetRecorder, type DatasetLabel } from '../services/datasetRecorder'
import { API_BASE_URL } from '../services/apiConfig'
import { DEFAULT_POSE_MODEL, POSE_MODELS, poseModelFileName, type PoseModelVariant } from '../hooks/usePoseLandmarker'
import { DEFAULT_SKELETON_MODE, SKELETON_MODES, type SkeletonMode } from '../lib/skeletonOverlay'
import { MAX_TRACKED_PEOPLE, maxPeopleFor, type DetectionMode } from '../lib/multiPerson'
import type { CameraSlot, CameraSource } from '../types/cameraSource'
import type { PersonSummary } from '../types/person'
import type { AlertEvent } from '../types/alerts'
import type { EnrolledPerson } from '../types/identity'
import type { PostureThresholds } from '../types/posture'
import type { BreakThresholds, DistanceThresholds, FatigueThresholds } from '../types/wellbeing'
import type { FallThresholds } from '../types/fall'
import './console.css'

export interface CameraStageExtras {
  onStats: (stats: CameraStats) => void
  overlay: ReactNode
  poseModel: PoseModelVariant
  skeletonMode: SkeletonMode
}

export interface DevConsoleProps {
  renderCameraStage: (slot: CameraSlot, extras: CameraStageExtras) => ReactNode
  cameraSlots: CameraSlot[]
  peopleBySlot: Record<string, PersonSummary[]>
  onAddCameraSlot: () => void
  onRemoveCameraSlot: (id: string) => void
  onCameraSlotSourceChange: (id: string, source: CameraSource) => void
  events: AlertEvent[]
  fallAlerts: { id: string; message: string }[]
  onAcknowledgeFall: (id: string) => void
  breakMessage: string | null
  onDismissBreak: () => void
  enrolledPeople: EnrolledPerson[]
  enrolledPeopleError: string | null
  onRemovePerson: (id: string) => void
  postureThresholds: PostureThresholds
  onPostureChange: (next: PostureThresholds) => void
  fatigueThresholds: FatigueThresholds
  onFatigueChange: (next: FatigueThresholds) => void
  distanceThresholds: DistanceThresholds
  onDistanceChange: (next: DistanceThresholds) => void
  breakThresholds: BreakThresholds
  onBreakChange: (next: BreakThresholds) => void
  fallThresholds: FallThresholds
  onFallChange: (next: FallThresholds) => void
  soundEnabled: boolean
  onSoundEnabledChange: (enabled: boolean) => void
  faceFeaturesEnabled: boolean
  onFaceFeaturesEnabledChange: (enabled: boolean) => void
  detectionMode: DetectionMode
  onDetectionModeChange: (mode: DetectionMode) => void
}

export interface RecorderState {
  showRecorder: boolean
  recording: boolean
  label: DatasetLabel
  cameraId: string
  sampleCount: number
  /** รุ่นโมเดลของ sample ที่เก็บอยู่ (null = ยังว่าง) — ใช้กันบันทึกปนข้ามรุ่น */
  datasetPoseModel: string | null
}

type Tab = 'monitor' | 'thresholds' | 'events' | 'people'

const TABS: Record<Tab, [string, string]> = {
  monitor: ['ภาพรวมระบบ', 'สถานะกล้อง โมเดล และ pipeline แบบเรียลไทม์'],
  thresholds: ['เกณฑ์การตรวจจับ', 'ค่า threshold ที่ใช้กับทุกกล้อง'],
  events: ['เหตุการณ์แจ้งเตือน', 'AlertEvent ทุกหมวดของวันนี้'],
  people: ['ข้อมูลใบหน้า', 'รายชื่อที่ลงทะเบียนใน camwell-backend'],
}

const STATUS_COLOR = { ok: 'var(--good)', warn: 'var(--warn)', error: 'var(--danger)', off: 'var(--text-muted)' }

function statusColor(status: 'ready' | 'loading' | 'error') {
  return status === 'ready' ? STATUS_COLOR.ok : status === 'error' ? STATUS_COLOR.error : STATUS_COLOR.warn
}

/** รวมสถานะจากทุกกล้อง: มี error ตัวไหน = error, ยังโหลดอยู่ตัวไหน = loading */
function aggregateStatus(values: ('ready' | 'loading' | 'error')[]): 'ready' | 'loading' | 'error' {
  if (values.includes('error')) return 'error'
  if (values.length === 0 || values.includes('loading')) return 'loading'
  return 'ready'
}

export default function DevConsole(props: DevConsoleProps) {
  const {
    cameraSlots,
    events,
    enrolledPeople,
    soundEnabled,
    onSoundEnabledChange,
    faceFeaturesEnabled,
    onFaceFeaturesEnabledChange,
    detectionMode,
    onDetectionModeChange,
  } = props

  const [tab, setTab] = useState<Tab>('monitor')
  const [poseModel, setPoseModel] = useState<PoseModelVariant>(DEFAULT_POSE_MODEL)
  const [skeletonMode, setSkeletonMode] = useState<SkeletonMode>(DEFAULT_SKELETON_MODE)
  const [statsBySlot, setStatsBySlot] = useState<Record<string, CameraStats>>({})
  const [recorder, setRecorder] = useState<RecorderState>({
    showRecorder: false,
    recording: false,
    label: 'GOOD',
    cameraId: cameraSlots[0]?.id ?? '',
    sampleCount: datasetRecorder.count(),
    datasetPoseModel: datasetRecorder.poseModel(),
  })
  const health = useBackendHealth()

  const handleStats = useCallback((slotId: string, stats: CameraStats) => {
    setStatsBySlot((prev) => ({ ...prev, [slotId]: stats }))
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const count = datasetRecorder.count()
      const model = datasetRecorder.poseModel()
      setRecorder((prev) =>
        prev.sampleCount === count && prev.datasetPoseModel === model
          ? prev
          : { ...prev, sampleCount: count, datasetPoseModel: model },
      )
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  const activeStats = cameraSlots.map((slot) => statsBySlot[slot.id]).filter((s): s is CameraStats => !!s)
  const poseStatus = aggregateStatus(activeStats.map((s) => s.poseStatus))
  const faceStatus = aggregateStatus(activeStats.map((s) => s.faceStatus))
  const delegates = [...new Set(activeStats.map((s) => s.delegate).filter(Boolean))].join('/') || '—'

  const services: { name: string; detail: string; status: string; color: string }[] = [
    {
      name: 'Pose Landmarker',
      detail: `${poseModelFileName(poseModel)} · numPoses ${maxPeopleFor(detectionMode)} · ${delegates}`,
      status: poseStatus,
      color: statusColor(poseStatus),
    },
    ...cameraSlots.flatMap((slot) => {
      const err = statsBySlot[slot.id]?.cameraError
      return err ? [{ name: `${slot.label} · source`, detail: err, status: 'error', color: STATUS_COLOR.error }] : []
    }),
    {
      name: 'face-api',
      detail: 'TinyFaceDetector · Landmark68 · Recognition',
      status: faceFeaturesEnabled ? faceStatus : 'ปิดอยู่',
      color: faceFeaturesEnabled ? statusColor(faceStatus) : STATUS_COLOR.off,
    },
    {
      name: 'camwell-backend',
      detail: `${API_BASE_URL.replace(/^https?:\/\//, '')} · /api/employees`,
      status: health === null ? 'checking' : health === 'offline' ? 'offline' : health === 200 ? 'online' : `HTTP ${health}`,
      color: health === null ? STATUS_COLOR.off : health === 200 ? STATUS_COLOR.ok : STATUS_COLOR.error,
    },
    { name: 'Alert reporter', detail: 'consoleAlertReporter (local เท่านั้น)', status: 'Phase 1', color: STATUS_COLOR.warn },
  ]

  const nav: [Tab, string, string][] = [
    ['monitor', 'ภาพรวมระบบ', recorder.recording ? '● REC' : `${cameraSlots.length} cam`],
    ['thresholds', 'เกณฑ์การตรวจจับ', ''],
    ['events', 'เหตุการณ์', String(events.length)],
    ['people', 'ข้อมูลใบหน้า', String(enrolledPeople.length)],
  ]

  const healthOk = health === 200

  return (
    <div className="dc-root">
      <aside className="dc-aside">
        <div className="dc-brand">
          <div className="dc-row">
            <strong className="dc-brand-name">Camwell</strong>
            <span className="dc-badge">DEV</span>
          </div>
          <span className="dc-muted-12">คอนโซลผู้ดูแลระบบ</span>
        </div>
        <nav className="dc-nav">
          {nav.map(([id, label, badge]) => (
            <button
              key={id}
              type="button"
              className={`dc-nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span>{label}</span>
              <span className="dc-mono-11 dc-muted">{badge}</span>
            </button>
          ))}
        </nav>
        <div className="dc-services">
          <span className="dc-section-label">สถานะโมเดลและบริการ</span>
          {services.map((s) => (
            <div key={s.name} className="dc-service">
              <span className="dc-dot" style={{ background: s.color, marginTop: 6 }} />
              <div className="dc-service-body">
                <span className="dc-service-head">
                  <span className="dc-w500">{s.name}</span>
                  <span style={{ color: s.color, whiteSpace: 'nowrap' }}>{s.status}</span>
                </span>
                <span className="dc-service-detail">{s.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="dc-aside-footer">
          <div className="dc-kv">
            <span>Pose model</span>
            <span className="dc-mono dc-text">{poseModelFileName(poseModel)}</span>
          </div>
          <div className="dc-kv">
            <span>API_BASE_URL</span>
            <span className="dc-mono dc-text">{API_BASE_URL}</span>
          </div>
        </div>
      </aside>

      <div className="dc-main-col">
        <header className="dc-header">
          <div className="dc-col">
            <h1 className="dc-title">{TABS[tab][0]}</h1>
            <span className="dc-muted-12">{TABS[tab][1]}</span>
          </div>
          <div className="dc-header-controls">
            <div className="dc-row dc-muted-12" style={{ gap: 6 }}>
              <span>โหมด</span>
              <div className="dc-segment">
                <button
                  type="button"
                  className={detectionMode === 'workstation' ? 'active' : ''}
                  onClick={() => onDetectionModeChange('workstation')}
                >
                  Workstation · 1 คน
                </button>
                <button
                  type="button"
                  className={detectionMode === 'multi' ? 'active' : ''}
                  onClick={() => onDetectionModeChange('multi')}
                >
                  Multi · สูงสุด {MAX_TRACKED_PEOPLE}
                </button>
              </div>
            </div>
            <div
              className="dc-row dc-muted-12"
              style={{ gap: 6 }}
              title={
                recorder.recording
                  ? 'หยุดบันทึก dataset ก่อนจึงจะเปลี่ยนรุ่นได้'
                  : 'เปลี่ยนรุ่นแล้วโมเดลโหลดใหม่ทุกกล้อง — ควร Calibrate ท่านั่งใหม่เพราะมุมที่วัดได้ต่างกันเล็กน้อย'
              }
            >
              <span>Pose</span>
              <div className="dc-segment">
                {POSE_MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={poseModel === m ? 'active' : ''}
                    disabled={recorder.recording}
                    onClick={() => setPoseModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="dc-row dc-muted-12"
              style={{ gap: 6 }}
              title="basic = โครงร่างเดิม · full = ครบทั้งตัว + เส้นคอ/กระดูกสันหลัง (สีเหลือง) ที่ใช้วัดมุมจริง"
            >
              <span>Skeleton</span>
              <div className="dc-segment">
                {SKELETON_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={skeletonMode === m ? 'active' : ''}
                    onClick={() => setSkeletonMode(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <label className="dc-check">
              <input type="checkbox" checked={soundEnabled} onChange={(e) => onSoundEnabledChange(e.target.checked)} />
              เสียงแจ้งเตือน
            </label>
            <label className="dc-check">
              <input
                type="checkbox"
                checked={faceFeaturesEnabled}
                onChange={(e) => onFaceFeaturesEnabledChange(e.target.checked)}
              />
              ฟีเจอร์ใบหน้า
            </label>
            <label
              className="dc-check dc-check-divider"
              title={recorder.recording ? 'หยุดบันทึกก่อนจึงจะซ่อนได้' : 'แสดงแผงเก็บ dataset ในหน้าภาพรวม'}
            >
              <input
                type="checkbox"
                checked={recorder.showRecorder || recorder.recording}
                disabled={recorder.recording}
                onChange={(e) => {
                  const show = e.target.checked
                  setRecorder((prev) => ({ ...prev, showRecorder: show }))
                  if (show) setTab('monitor')
                }}
              />
              Dataset Recorder
              <span className="dc-badge dc-badge-sm">DEV</span>
            </label>
            <div className="dc-pill">
              <span className="dc-dot dc-dot-8" style={{ background: health === null ? STATUS_COLOR.off : healthOk ? STATUS_COLOR.ok : STATUS_COLOR.error }} />
              <span>backend</span>
              <span className="dc-mono dc-muted">
                {health === null ? '…' : health === 'offline' ? 'offline' : `/health ${health}`}
              </span>
            </div>
          </div>
        </header>

        <div className="dc-body">
        <main className="dc-main">
          {props.fallAlerts.map((alert) => (
            <div key={alert.id} className="fall-alert-banner">
              <span>🚨 {alert.message}</span>
              <button type="button" onClick={() => props.onAcknowledgeFall(alert.id)}>
                รับทราบ
              </button>
            </div>
          ))}
          {props.breakMessage && (
            <div className="break-banner">
              <span>🧘 {props.breakMessage}</span>
              <button type="button" onClick={props.onDismissBreak}>
                รับทราบ
              </button>
            </div>
          )}

          {/* MonitorTab ถูก render ไว้ตลอด (ซ่อนด้วย hidden) — CameraStage ต้องไม่ unmount ตอนสลับแท็บ */}
          <MonitorTab
            {...props}
            hidden={tab !== 'monitor'}
            poseModel={poseModel}
            skeletonMode={skeletonMode}
            statsBySlot={statsBySlot}
            onStats={handleStats}
            recorder={recorder}
            setRecorder={setRecorder}
            onGoEvents={() => setTab('events')}
          />
          {tab === 'thresholds' && <ThresholdsTab {...props} />}
          {tab === 'events' && <EventsTab events={events} cameraSlots={cameraSlots} />}
          {tab === 'people' && (
            <PeopleTab
              people={enrolledPeople}
              error={props.enrolledPeopleError}
              onRemove={props.onRemovePerson}
            />
          )}
        </main>
        {/* จอกว้าง (≥1700px): แสดงเกณฑ์การตรวจจับข้างหน้าภาพรวม ใช้พื้นที่ที่ว่างอยู่ — จอเล็กกว่านี้ CSS ซ่อนไว้ */}
        {tab === 'monitor' && (
          <aside className="dc-wide-thresholds">
            <ThresholdsTab {...props} />
          </aside>
        )}
        </div>
      </div>
    </div>
  )
}
