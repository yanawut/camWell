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
}

export function serializeDataset(
  samples: readonly DatasetSample[],
  opts: DatasetExportOptions,
): string {
  return JSON.stringify({
    meta: {
      schemaVersion: DATASET_SCHEMA_VERSION,
      exportedAt: opts.exportedAt,
      // Context only. The visibility threshold that actually affected each
      // sample's feature calculation is stored on sample.minVisibility.
      thresholdsAtExport: opts.thresholdsAtExport,
    },
    samples,
  })
}
