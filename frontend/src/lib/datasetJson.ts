import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { PoseQuality, PostureThresholds } from '../types/posture'

export const DATASET_SCHEMA_VERSION = 1

export interface DatasetSample {
  cameraId: string
  label: string
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

export interface DatasetExportOptions {
  thresholdsAtExport: PostureThresholds
  exportedAt: number
  /** รุ่น Pose Landmarker ที่ใช้เก็บทุก sample ในไฟล์นี้ (เช่น 'lite') — null เมื่อยังไม่มี sample */
  poseModel?: string | null
}

export function serializeDataset(
  samples: readonly DatasetSample[],
  opts: DatasetExportOptions,
): string {
  return JSON.stringify({
    meta: {
      schemaVersion: DATASET_SCHEMA_VERSION,
      exportedAt: opts.exportedAt,
      // ทั้งไฟล์มาจากโมเดลรุ่นเดียวเสมอ (datasetRecorder ไม่รับ sample ข้ามรุ่น)
      poseModel: opts.poseModel ?? null,
      // Context only. The visibility threshold that actually affected each
      // sample's feature calculation is stored on sample.minVisibility.
      thresholdsAtExport: opts.thresholdsAtExport,
    },
    samples,
  })
}
