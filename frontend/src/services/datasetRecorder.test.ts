import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS } from '../types/posture'
import {
  buildDatasetJson,
  datasetRecorder,
  type DatasetSampleInput,
} from './datasetRecorder'

const LANDMARKS: NormalizedLandmark[] = Array.from({ length: 33 }, (_, index) => ({
  x: index / 100,
  y: index / 200,
  z: index / 300,
  visibility: 0.6 + index / 1000,
}))

const WORLD_LANDMARKS: Landmark[] = Array.from({ length: 33 }, (_, index) => ({
  x: index / 10,
  y: index / 20,
  z: index / 30,
  visibility: 0.7 + index / 1000,
}))

const SAMPLE: DatasetSampleInput = {
  cameraId: 'cam-1',
  timestamp: 1_234,
  neckAngleDeg: 12.5,
  torsoAngleDeg: 8.25,
  shoulderTiltDeg: 2.75,
  headHeightRatio: 1.4,
  quality: 'full_body',
  landmarks: LANDMARKS,
  worldLandmarks: WORLD_LANDMARKS,
  frameWidth: 1280,
  frameHeight: 720,
  minVisibility: 0.65,
  poseModel: 'lite',
}

describe('datasetRecorder', () => {
  beforeEach(() => {
    datasetRecorder.stop()
    datasetRecorder.clear()
  })

  it('buildDatasetJson preserves raw sample fields, landmark visibility, and deterministic export metadata', () => {
    datasetRecorder.start('GOOD')
    datasetRecorder.add(SAMPLE)

    const exportedAt = 9_876_543
    const parsed = JSON.parse(
      buildDatasetJson({
        thresholdsAtExport: DEFAULT_THRESHOLDS,
        exportedAt,
      }),
    ) as {
      meta: {
        schemaVersion: unknown
        exportedAt: number
        thresholdsAtExport: typeof DEFAULT_THRESHOLDS
      }
      samples: Array<Record<string, unknown>>
    }

    expect(Array.isArray(parsed.meta)).toBe(false)
    expect(parsed.meta.schemaVersion).toBeDefined()
    expect(parsed.meta.exportedAt).toBe(exportedAt)
    expect((parsed.meta as Record<string, unknown>).poseModel).toBe('lite')
    expect(parsed.meta.thresholdsAtExport).toEqual(DEFAULT_THRESHOLDS)
    expect(parsed.samples).toHaveLength(1)

    const sample = parsed.samples[0]
    expect(sample).toMatchObject({
      cameraId: 'cam-1',
      label: 'GOOD',
      timestamp: 1_234,
      neckAngleDeg: 12.5,
      torsoAngleDeg: 8.25,
      shoulderTiltDeg: 2.75,
      headHeightRatio: 1.4,
      quality: 'full_body',
      frameWidth: 1280,
      frameHeight: 720,
      minVisibility: 0.65,
    })

    const landmarks = sample.landmarks as NormalizedLandmark[]
    const worldLandmarks = sample.worldLandmarks as Landmark[]
    expect(landmarks).toHaveLength(33)
    expect(worldLandmarks).toHaveLength(33)
    expect(landmarks.every((point) => point.visibility !== undefined)).toBe(true)
    expect(worldLandmarks.every((point) => point.visibility !== undefined)).toBe(true)
    expect(sample).not.toHaveProperty('poseModel')
    expect(sample).not.toHaveProperty('image')
    expect(sample).not.toHaveProperty('video')
  })

  it('records only while active and exposes start/stop/count/clear state', () => {
    datasetRecorder.add(SAMPLE)
    expect(datasetRecorder.count()).toBe(0)

    datasetRecorder.start('LEAN_LEFT')
    expect(datasetRecorder.isRecording()).toBe(true)
    datasetRecorder.add(SAMPLE)
    expect(datasetRecorder.count()).toBe(1)

    datasetRecorder.stop()
    expect(datasetRecorder.isRecording()).toBe(false)
    datasetRecorder.add(SAMPLE)
    expect(datasetRecorder.count()).toBe(1)

    datasetRecorder.clear()
    expect(datasetRecorder.count()).toBe(0)
  })

  it('records from every camera when start() has no cameraId', () => {
    datasetRecorder.start('GOOD')
    datasetRecorder.add(SAMPLE)
    datasetRecorder.add({ ...SAMPLE, cameraId: 'cam-2' })
    expect(datasetRecorder.count()).toBe(2)
  })

  it('records only the chosen camera when start() has a cameraId, and stop() clears the filter', () => {
    datasetRecorder.start('SLOUCH', 'cam-2')
    datasetRecorder.add(SAMPLE)
    datasetRecorder.add({ ...SAMPLE, cameraId: 'cam-2' })
    expect(datasetRecorder.count()).toBe(1)

    datasetRecorder.stop()
    datasetRecorder.start('GOOD')
    datasetRecorder.add(SAMPLE)
    expect(datasetRecorder.count()).toBe(2)
  })

  it('locks the dataset to the first sample pose model and rejects other models until clear()', () => {
    expect(datasetRecorder.poseModel()).toBeNull()
    datasetRecorder.start('GOOD')
    datasetRecorder.add(SAMPLE)
    datasetRecorder.add({ ...SAMPLE, poseModel: 'full' })
    expect(datasetRecorder.count()).toBe(1)
    expect(datasetRecorder.poseModel()).toBe('lite')

    datasetRecorder.clear()
    expect(datasetRecorder.poseModel()).toBeNull()
    datasetRecorder.add({ ...SAMPLE, poseModel: 'full' })
    expect(datasetRecorder.poseModel()).toBe('full')
    expect(JSON.parse(buildDatasetJson({ thresholdsAtExport: DEFAULT_THRESHOLDS, exportedAt: 1 })).meta.poseModel).toBe('full')
  })
})
