import { useState, type Dispatch, type SetStateAction } from 'react'
import type { CameraStats } from '../components/CameraStage'
import type { RecorderState } from './DevConsole'
import { DATASET_LABELS, datasetRecorder } from '../services/datasetRecorder'
import type { CameraSlot } from '../types/cameraSource'
import type { PersonSummary } from '../types/person'
import type { PostureThresholds } from '../types/posture'
import type { PoseModelVariant } from '../hooks/usePoseLandmarker'

interface Props {
  cameraSlots: CameraSlot[]
  statsBySlot: Record<string, CameraStats>
  peopleBySlot: Record<string, PersonSummary[]>
  recorder: RecorderState
  recCameraId: string
  setRecorder: Dispatch<SetStateAction<RecorderState>>
  postureThresholds: PostureThresholds
  poseModel: PoseModelVariant
}

export default function RecorderPanel({
  cameraSlots,
  statsBySlot,
  peopleBySlot,
  recorder,
  recCameraId,
  setRecorder,
  postureThresholds,
  poseModel,
}: Props) {
  const [showSchema, setShowSchema] = useState(false)
  const { recording, label, sampleCount, datasetPoseModel } = recorder
  // datasetRecorder ทิ้ง sample ข้ามรุ่นอยู่แล้ว — UI กันไว้ก่อนเพื่อไม่ให้กดบันทึกแล้วได้ 0 sample แบบงงๆ
  const modelMismatch = sampleCount > 0 && datasetPoseModel !== null && datasetPoseModel !== poseModel
  const recSlot = cameraSlots.find((s) => s.id === recCameraId)
  const peopleInFrame = peopleBySlot[recCameraId]?.length ?? 0
  const recCameraBroken = !!statsBySlot[recCameraId]?.cameraError

  const toggleRecording = () => {
    if (recording) {
      datasetRecorder.stop()
      setRecorder((prev) => ({ ...prev, recording: false }))
      return
    }
    datasetRecorder.start(label, recCameraId)
    setRecorder((prev) => ({ ...prev, recording: true, cameraId: recCameraId }))
  }

  const clearDataset = () => {
    datasetRecorder.clear()
    setRecorder((prev) => ({ ...prev, sampleCount: 0, datasetPoseModel: null }))
  }

  const readyText =
    peopleInFrame === 1 ? 'พร้อม (1 คนในเฟรม)' : `ต้องมี 1 คนในเฟรม (ตอนนี้ ${peopleInFrame} คน)`
  const statusText = recording
    ? `● บันทึก ${label} จาก ${recSlot?.label ?? recCameraId} · ~12/วิ`
    : `samples · ${recSlot?.label ?? '—'} ${readyText}`
  const statusColor = recording ? 'var(--danger)' : peopleInFrame === 1 && !recCameraBroken ? 'var(--good)' : 'var(--warn)'

  const schema = `{
  "cameraId": "${recCameraId}",
  "label": "${label}",
  "timestamp": 1759674128000,
  "neckAngleDeg": 12.84,
  "torsoAngleDeg": 4.10,
  "shoulderTiltDeg": 1.92,
  "headHeightRatio": 0.71,
  "quality": "full_body",
  "landmarks": [{ "x", "y", "z", "visibility" } × 33],
  "worldLandmarks": [ … × 33 ],
  "frameWidth": 640,
  "frameHeight": 480,
  "minVisibility": ${postureThresholds.minVisibility}
}`

  return (
    <div className="dc-card dc-pad dc-recorder" style={{ borderColor: recording ? 'var(--danger)' : undefined }}>
      <div className="dc-card-head" style={{ marginBottom: 0 }}>
        <div className="dc-row" style={{ gap: 8 }}>
          <h2 className="dc-h2">Dataset Recorder</h2>
          <span className="dc-badge">DEV</span>
        </div>
        <a
          href="#"
          className="dc-link-12"
          onClick={(e) => {
            e.preventDefault()
            setShowSchema((v) => !v)
          }}
        >
          {showSchema ? 'ซ่อน schema' : 'ดู schema'}
        </a>
      </div>
      <span className="dc-muted-12" style={{ marginTop: -6 }}>
        เก็บเฉพาะตัวเลข landmark/feature ไม่เก็บภาพ · ต้องมีคนเดียวในเฟรม
      </span>
      {!import.meta.env.DEV && (
        <span className="dc-warn-note">build นี้ไม่ใช่ dev — CameraStage จะไม่เก็บ sample (ผูก import.meta.env.DEV ไว้)</span>
      )}

      <span className="dc-muted-12">
        โมเดล: <span className="dc-mono dc-text">{poseModel}</span>
        {datasetPoseModel && (
          <>
            {' '}
            · dataset ปัจจุบัน: <span className="dc-mono dc-text">{datasetPoseModel}</span>
          </>
        )}
      </span>
      {modelMismatch && (
        <span className="dc-warn-note">
          sample ที่เก็บอยู่มาจากโมเดล {datasetPoseModel} — Export แล้วล้างข้อมูลก่อน จึงจะเริ่มบันทึกด้วย {poseModel} ได้
          (ไม่ปน dataset ข้ามรุ่น)
        </span>
      )}

      <div className="dc-col" style={{ gap: 6 }}>
        <span className="dc-muted-12">กล้อง</span>
        <div className="dc-toggle-row">
          {cameraSlots.map((slot) => {
            const on = slot.id === recCameraId
            const broken = !!statsBySlot[slot.id]?.cameraError
            return (
              <button
                key={slot.id}
                type="button"
                className={`dc-toggle ${on ? 'on' : ''}`}
                disabled={broken || recording}
                style={{ opacity: broken || (recording && !on) ? 0.45 : 1 }}
                onClick={() => setRecorder((prev) => ({ ...prev, cameraId: slot.id }))}
              >
                {slot.label}
                {broken ? ' (ใช้ไม่ได้)' : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="dc-col" style={{ gap: 6 }}>
        <span className="dc-muted-12">Label</span>
        <div className="dc-toggle-row">
          {DATASET_LABELS.map((value) => {
            const on = value === label
            return (
              <button
                key={value}
                type="button"
                className={`dc-toggle dc-toggle-sm ${on ? 'on' : ''}`}
                disabled={recording}
                style={{ opacity: recording && !on ? 0.45 : 1 }}
                onClick={() => setRecorder((prev) => ({ ...prev, label: value }))}
              >
                {value}
              </button>
            )
          })}
        </div>
      </div>

      <div className="dc-rec-box">
        <div className="dc-col" style={{ minWidth: 0 }}>
          <span className="dc-rec-count">{sampleCount.toLocaleString()}</span>
          <span style={{ fontSize: 12, color: statusColor }}>{statusText}</span>
        </div>
        <button
          type="button"
          className="dc-rec-btn"
          style={{ background: recording ? 'var(--text)' : 'var(--danger)' }}
          disabled={!recording && (recCameraBroken || modelMismatch)}
          onClick={toggleRecording}
        >
          {recording ? '■ หยุดบันทึก' : '● เริ่มบันทึก'}
        </button>
      </div>

      <div className="dc-row" style={{ gap: 8 }}>
        <button
          type="button"
          className="dc-btn"
          style={{ flex: 1 }}
          disabled={sampleCount === 0}
          onClick={() => datasetRecorder.exportJson(postureThresholds)}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="dc-btn dc-btn-danger-text"
          style={{ flex: 1 }}
          disabled={recording || sampleCount === 0}
          onClick={clearDataset}
        >
          ล้างข้อมูล
        </button>
      </div>

      {showSchema && (
        <>
          <pre className="dc-pre">{schema}</pre>
          <span className="dc-muted" style={{ fontSize: 11 }}>
            meta: schemaVersion, exportedAt, poseModel, thresholdsAtExport · landmarks ต้องมี visibility ทุกจุด
          </span>
        </>
      )}
    </div>
  )
}
