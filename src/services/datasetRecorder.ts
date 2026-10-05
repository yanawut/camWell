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
}

const samples: DatasetSample[] = []
let activeLabel: DatasetLabel | null = null
// null = รับ sample จากทุกกล้อง (พฤติกรรมเดิมของหน้าหลัก) — Dev Console ระบุกล้องเพื่อเก็บจากกล้องเดียว
let activeCameraId: string | null = null

export function buildDatasetJson(opts: DatasetExportOptions): string {
  return serializeDataset(samples, opts)
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
    samples.push({ ...sample, label: activeLabel })
  },

  count(): number {
    return samples.length
  },

  clear() {
    samples.length = 0
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
