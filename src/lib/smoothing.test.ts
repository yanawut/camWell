import { describe, expect, it } from 'vitest'
import type { PostureFeatures } from '../types/posture'
import { ema, smoothFeatures } from './smoothing'

describe('ema', () => {
  it('uses the current value when there is no previous value', () => {
    expect(ema(null, 12, 0.3)).toBe(12)
  })

  it('blends the current value with the previous value using alpha', () => {
    expect(ema(10, 20, 0.3)).toBeCloseTo(13)
  })
})

describe('smoothFeatures', () => {
  it('returns the current features unchanged for the first sample', () => {
    const current: PostureFeatures = {
      quality: 'upper_body',
      neckAngleDeg: 20,
      torsoAngleDeg: null,
      shoulderTiltDeg: 4,
      headHeightRatio: 0.5,
    }

    expect(smoothFeatures(null, current, 0.3)).toEqual(current)
  })

  it('smooths numeric features while preserving current null measurements and quality', () => {
    const previous: PostureFeatures = {
      quality: 'full_body',
      neckAngleDeg: 10,
      torsoAngleDeg: 8,
      shoulderTiltDeg: 10,
      headHeightRatio: 0.6,
    }
    const current: PostureFeatures = {
      quality: 'upper_body',
      neckAngleDeg: 20,
      torsoAngleDeg: null,
      shoulderTiltDeg: 30,
      headHeightRatio: 0.4,
    }

    expect(smoothFeatures(previous, current, 0.3)).toEqual({
      quality: 'upper_body',
      neckAngleDeg: 13,
      torsoAngleDeg: null,
      shoulderTiltDeg: 16,
      headHeightRatio: 0.54,
    })
  })
})
