import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { serializeDataset, type DatasetExportOptions, type DatasetSample } from '../lib/datasetJson'
import type { PoseQuality, PostureThresholds } from '../types/posture'

export const DATASET_LABELS = [
  'GOOD',
  'FORWARD_HEAD',
  'SLOUCH',
  'LEAN_LEFT',
  'LEAN_RIGHT',
] as const

export type DatasetLabel = (typeof DATASET_LABELS)[number]

export interface DatasetSampleInput {
  cameraId: string
  timestamp: number
  neckAngleDeg: number
  torsoAngleDeg: number | null
  shoulderTiltDeg: number
  headHeightRatio: number | null
  quality: PoseQuality
  landmarks: NormalizedLandmark[]
  worldLandmarks: Landmark[]
  frameWidth: number
  frameHeight: number
  minVisibility: number
  /** รุ่น Pose Landmarker ที่ให้ landmark ชุดนี้ — ใช้กัน dataset ปนข้ามรุ่น (ไม่ถูกเก็บลงแต่ละ sample แต่ไปอยู่ใน meta) */
  poseModel: string
}

const samples: DatasetSample[] = []
let activeLabel: DatasetLabel | null = null
// null = รับ sample จากทุกกล้อง (พฤติกรรมเดิมของหน้าหลัก) — Dev Console ระบุกล้องเพื่อเก็บจากกล้องเดียว
let activeCameraId: string | null = null
// รุ่นโมเดลของ sample ชุดปัจจุบัน — ล็อกตาม sample แรก ปลดเมื่อ clear()
let datasetPoseModel: string | null = null

export function buildDatasetJson(opts: Omit<DatasetExportOptions, 'poseModel'>): string {
  return serializeDataset(samples, { ...opts, poseModel: datasetPoseModel })
}

export const datasetRecorder = {
  start(label: DatasetLabel, cameraId?: string) {
    activeLabel = label
    activeCameraId = cameraId ?? null
  },

  stop() {
    activeLabel = null
    activeCameraId = null
  },

  isRecording(): boolean {
    return activeLabel !== null
  },

  add(sample: DatasetSampleInput) {
    if (activeLabel === null) return
    if (activeCameraId !== null && sample.cameraId !== activeCameraId) return
    // ไม่ปน dataset ข้ามรุ่นโมเดล — landmark จากคนละรุ่นมีความคลาดเคลื่อนต่างกัน
    if (datasetPoseModel !== null && sample.poseModel !== datasetPoseModel) return
    datasetPoseModel = sample.poseModel
    const { poseModel: _poseModel, ...rest } = sample
    samples.push({ ...rest, label: activeLabel })
  },

  count(): number {
    return samples.length
  },

  /** รุ่นโมเดลของ sample ที่เก็บอยู่ (null = ยังว่าง) */
  poseModel(): string | null {
    return datasetPoseModel
  },

  clear() {
    samples.length = 0
    datasetPoseModel = null
  },

  exportJson(thresholds: PostureThresholds) {
    const exportedAt = Date.now()
    const blob = new Blob([
      buildDatasetJson({
        thresholdsAtExport: thresholds,
        exportedAt,
      }),
    ], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `camwell-dataset-${new Date(exportedAt).toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  },
}

export type { DatasetSample }
