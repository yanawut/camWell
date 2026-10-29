import { describe, expect, it } from 'vitest'
import type { PostureFeatures } from '../types/posture'
import { computeBaseline, median, MIN_CALIBRATION_SAMPLES } from './postureCalibration'

const sample = (
  neckAngleDeg: number,
  torsoAngleDeg: number | null,
  shoulderTiltDeg: number,
  headHeightRatio: number | null,
): PostureFeatures => ({
  quality: torsoAngleDeg === null ? 'upper_body' : 'full_body',
  neckAngleDeg,
  torsoAngleDeg,
  shoulderTiltDeg,
  headHeightRatio,
})

describe('median', () => {
  it('uses the middle value and ignores an outlier', () => {
    expect(median([7, 7, 8, 7, 45])).toBe(7)
  })

  it('averages the two middle values for an even sample count', () => {
    expect(median([10, 2, 4, 8])).toBe(6)
  })

  it('returns null for no values', () => {
    expect(median([])).toBeNull()
  })
})

describe('computeBaseline', () => {
  it('requires at least the minimum number of calibration samples', () => {
    const samples = Array.from({ length: MIN_CALIBRATION_SAMPLES - 1 }, () => sample(5, null, 1, 0.6))
    expect(computeBaseline(samples, 1234)).toBeNull()
  })

  it('builds a median baseline while preserving optional torso/head values and timestamp', () => {
    const samples = Array.from({ length: MIN_CALIBRATION_SAMPLES }, (_, index) =>
      sample(
        index === MIN_CALIBRATION_SAMPLES - 1 ? 90 : 8,
        index % 3 === 0 ? null : 12,
        index === MIN_CALIBRATION_SAMPLES - 1 ? 60 : 2,
        index % 4 === 0 ? null : 0.62,
      ),
    )

    expect(computeBaseline(samples, 5678)).toEqual({
      neckAngleDeg: 8,
      torsoAngleDeg: 12,
      shoulderTiltDeg: 2,
      headHeightRatio: 0.62,
      createdAt: 5678,
    })
  })
})
