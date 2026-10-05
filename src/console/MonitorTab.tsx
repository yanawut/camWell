import { useState, type Dispatch, type SetStateAction } from 'react'
import type { CameraStats } from '../components/CameraStage'
import CameraSourceSelector from '../components/CameraSourceSelector'
import RecorderPanel from './RecorderPanel'
import type { DevConsoleProps, RecorderState } from './DevConsole'
import { formatDuration, formatTime, splitPersonName } from './format'
import { loadPostureBaseline } from '../services/postureBaselineStore'
import { POSE_INTERVAL_MS } from '../lib/poseThrottle'
import { maxPeopleFor } from '../lib/multiPerson'
import { MAX_CAMERA_SLOTS, type CameraSlot } from '../types/cameraSource'
import { ALERT_LABELS_TH } from '../types/alerts'
import type { PostureFeatures } from '../types/posture'

interface Props extends DevConsoleProps {
  hidden: boolean
  statsBySlot: Record<string, CameraStats>
  onStats: (slotId: string, stats: CameraStats) => void
  recorder: RecorderState
  setRecorder: Dispatch<SetStateAction<RecorderState>>
  onGoEvents: () => void
}

function sourceText(slot: CameraSlot) {
  const { source } = slot
  if (source.kind === 'ip-mjpeg') return `ip-mjpeg · ${source.ipUrl || 'ยังไม่ได้ตั้ง URL'}`
  return `local · ${source.deviceId ? source.deviceId.slice(0, 12) : 'ค่าเริ่มต้นของเบราว์เซอร์'}`
}

function featureCells(f: PostureFeatures | null): [string, string][] {
  const deg = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}°`)
  return [
    ['neckAngleDeg', deg(f?.neckAngleDeg)],
    ['torsoAngleDeg', deg(f?.torsoAngleDeg)],
    ['shoulderTiltDeg', deg(f?.shoulderTiltDeg)],
    ['headHeightRatio', f?.headHeightRatio == null ? '—' : f.headHeightRatio.toFixed(2)],
  ]
}

function formatBaselineDate(epochMs: number) {
  return new Date(epochMs).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MonitorTab(props: Props) {
  const {
    hidden,
    cameraSlots,
    peopleBySlot,
    statsBySlot,
    events,
    detectionMode,
    faceFeaturesEnabled,
    recorder,
  } = props
  const [sourceOpen, setSourceOpen] = useState<Record<string, boolean>>({})

  const maxPeople = maxPeopleFor(detectionMode)
  const readyMs = cameraSlots
    .map((slot) => statsBySlot[slot.id])
    .filter((s) => s && s.poseStatus === 'ready' && !s.cameraError && s.inferenceMs > 0)
    .map((s) => s.inferenceMs)
  const avgMs = readyMs.length > 0 ? readyMs.reduce((a, b) => a + b, 0) / readyMs.length : null
  const trackedTotal = cameraSlots.reduce((sum, slot) => sum + (peopleBySlot[slot.id]?.length ?? 0), 0)
  const activeEvents = events.filter((e) => !e.endedAt).length
  const recent = [...events].sort((a, b) => b.startedAt - a.startedAt).slice(0, 4)
  const singleCameraLabel = cameraSlots.length === 1 ? cameraSlots[0].label : '—'
  const firstFaceStatus = statsBySlot[cameraSlots[0]?.id]?.faceStatus
  const recCameraId = cameraSlots.some((s) => s.id === recorder.cameraId) ? recorder.cameraId : cameraSlots[0]?.id

  return (
    <div className="dc-stack" hidden={hidden}>
      <div className="dc-statbar">
        <div className="dc-stat">
          <span className="dc-muted-12">Pose inference (EMA)</span>
          <span className="dc-stat-value">
            {avgMs === null ? '—' : avgMs.toFixed(1)}
            <span className="dc-stat-unit"> ms</span>
          </span>
          <span className="dc-muted-12">
            จำกัด {Math.round(1000 / POSE_INTERVAL_MS)} fps · ช่วง {Math.round(POSE_INTERVAL_MS)} ms/รอบ
          </span>
        </div>
        <div className="dc-stat">
          <span className="dc-muted-12">Face detection</span>
          <span className="dc-stat-value">{faceFeaturesEnabled ? (firstFaceStatus ?? '—') : 'ปิด'}</span>
          <span className="dc-muted-12">
            {faceFeaturesEnabled ? 'fatigue · distance · identity' : 'ไม่รัน face-api'}
          </span>
        </div>
        <div className="dc-stat">
          <span className="dc-muted-12">คนที่กำลังติดตาม</span>
          <span className="dc-stat-value">
            {trackedTotal} / {maxPeople * cameraSlots.length}
          </span>
          <span className="dc-muted-12">
            {detectionMode === 'multi' ? 'Multi-person' : 'Workstation'} · {cameraSlots.length} กล้อง
          </span>
        </div>
        <div className="dc-stat">
          <span className="dc-muted-12">แจ้งเตือนที่ยัง active</span>
          <span className="dc-stat-value" style={{ color: activeEvents > 0 ? 'var(--danger)' : undefined }}>
            {activeEvents}
          </span>
          <span className="dc-muted-12">จาก {events.length} เหตุการณ์วันนี้</span>
        </div>
      </div>

      <div className="dc-monitor-row">
        <div className="dc-cams-col">
          <div className="dc-cams-grid">
            {cameraSlots.map((slot) => {
              const stats = statsBySlot[slot.id]
              const people = peopleBySlot[slot.id] ?? []
              const hasError = !!stats?.cameraError || stats?.poseStatus === 'error'
              const dot = hasError ? 'var(--danger)' : stats?.poseStatus === 'ready' ? 'var(--good)' : 'var(--warn)'
              const isRec = recorder.recording && slot.id === recCameraId
              const baseline = loadPostureBaseline(slot.id)

              const overlay = (
                <div className="dc-cam-overlay">
                  <div className="dc-chips">
                    <span className="dc-chip">{stats?.delegate ?? '—'}</span>
                    <span className="dc-chip">
                      {stats?.cameraError ? 'หยุดประมวลผล' : stats?.inferenceMs ? `~${Math.round(stats.inferenceMs)} ms` : '— ms'}
                    </span>
                    <span className="dc-chip">
                      {stats?.cameraError ? '—' : people.length} / {maxPeople} คน
                    </span>
                    {isRec && (
                      <span className="dc-chip dc-chip-rec">
                        ● REC {recorder.label} · {recorder.sampleCount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {isRec && (
                    <div className="dc-features">
                      {featureCells(stats?.rawFeatures ?? null).map(([key, value]) => (
                        <div key={key} className="dc-feature">
                          <span className="dc-feature-key">{key}</span>
                          <span className="dc-feature-value">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )

              return (
                <div key={slot.id} className={`dc-card dc-cam ${isRec ? 'recording' : ''}`}>
                  <div className="dc-cam-head">
                    <div className="dc-row" style={{ gap: 10, minWidth: 0 }}>
                      <span className="dc-dot dc-dot-8" style={{ background: dot }} />
                      <strong style={{ fontSize: 15 }}>{slot.label}</strong>
                      <span className="dc-tag">{sourceText(slot)}</span>
                    </div>
                    <div className="dc-row" style={{ gap: 10 }}>
                      {cameraSlots.length > 1 && !isRec && (
                        <button type="button" className="dc-link-danger" onClick={() => props.onRemoveCameraSlot(slot.id)}>
                          ลบกล้องนี้
                        </button>
                      )}
                      <span className="dc-mono-11 dc-muted">{slot.id}</span>
                    </div>
                  </div>
                  <div className="dc-cam-body">
                    {props.renderCameraStage(slot, {
                      onStats: (s) => props.onStats(slot.id, s),
                      overlay,
                    })}
                    <div className="dc-cam-info">
                      <span className="dc-muted">Posture baseline</span>
                      <span style={{ color: baseline ? 'var(--good)' : 'var(--warn)' }}>
                        {baseline ? `Calibrate แล้ว · ${formatBaselineDate(baseline.createdAt)}` : 'ยังไม่ Calibrate'}
                      </span>
                      <span className="dc-muted">Storage key</span>
                      <span className="dc-mono-11" style={{ overflowWrap: 'anywhere' }}>
                        camwell:posture-baseline:v1:{slot.id}
                      </span>
                      <span className="dc-muted">ในเฟรม</span>
                      <span>{people.length > 0 ? people.map((p) => `${p.label} — ${p.postureStatus}`).join(' · ') : '—'}</span>
                    </div>
                    <button
                      type="button"
                      className="dc-btn"
                      onClick={() => setSourceOpen((prev) => ({ ...prev, [slot.id]: !prev[slot.id] }))}
                    >
                      {sourceOpen[slot.id] ? 'ซ่อนการตั้งค่าแหล่งภาพ' : 'เปลี่ยนแหล่งภาพ'}
                    </button>
                    {sourceOpen[slot.id] && (
                      <CameraSourceSelector
                        value={slot.source}
                        onChange={(source) => props.onCameraSlotSourceChange(slot.id, source)}
                        title={`แหล่งภาพ · ${slot.label}`}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {cameraSlots.length < MAX_CAMERA_SLOTS && (
            <button type="button" className="dc-add-cam" onClick={props.onAddCameraSlot}>
              + เพิ่มกล้อง (สูงสุด {MAX_CAMERA_SLOTS} ตัวพร้อมกัน — แต่ละตัวรันโมเดลแยกชุด)
            </button>
          )}
        </div>

        <div className="dc-side-col">
          {(recorder.showRecorder || recorder.recording) && (
            <RecorderPanel
              cameraSlots={cameraSlots}
              statsBySlot={statsBySlot}
              peopleBySlot={peopleBySlot}
              recorder={recorder}
              recCameraId={recCameraId}
              setRecorder={props.setRecorder}
              postureThresholds={props.postureThresholds}
            />
          )}
          <div className="dc-card dc-pad">
            <div className="dc-card-head">
              <h2 className="dc-h2">แจ้งเตือนล่าสุด</h2>
              <a
                href="#"
                className="dc-link-12"
                onClick={(e) => {
                  e.preventDefault()
                  props.onGoEvents()
                }}
              >
                ดูทั้งหมด
              </a>
            </div>
            {recent.length === 0 ? (
              <p className="dc-empty">ยังไม่มีการแจ้งเตือน</p>
            ) : (
              <div className="dc-recent">
                {recent.map((e) => {
                  const { person } = splitPersonName(e.personName, singleCameraLabel)
                  const active = !e.endedAt
                  return (
                    <div key={e.id} className="dc-recent-item">
                      <span className="dc-mono dc-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                        {formatTime(e.startedAt)}
                      </span>
                      <div className="dc-col" style={{ minWidth: 0 }}>
                        <span style={{ color: active ? 'var(--danger)' : undefined, fontWeight: active ? 600 : 400 }}>
                          {ALERT_LABELS_TH[e.type]}
                        </span>
                        <span className="dc-muted-12">
                          {person} · {active ? 'กำลังดำเนินอยู่...' : formatDuration(e.startedAt, e.endedAt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
