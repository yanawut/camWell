import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS, type Point } from '../types/posture'
import { analyzePosture } from './postureAnalysis'

function makeLandmarks(
  leftShoulder: Point,
  rightShoulder: Point,
): Point[] {
  const landmarks = Array.from({ length: 25 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }))

  landmarks[7] = { x: 0.5, y: 0.2, visibility: 1 }
  landmarks[8] = { x: 0.5, y: 0.2, visibility: 1 }
  landmarks[11] = { ...leftShoulder, visibility: 1 }
  landmarks[12] = { ...rightShoulder, visibility: 1 }
  landmarks[23] = { x: 0.5, y: 0.7, visibility: 1 }
  landmarks[24] = { x: 0.5, y: 0.7, visibility: 1 }

  return landmarks
}

function makeUpperBodyLandmarks(): Point[] {
  const landmarks = makeLandmarks(
    { x: 0.62, y: 0.4 },
    { x: 0.38, y: 0.4 },
  )

  landmarks[23] = { x: 0.5, y: 0.7, visibility: 0 }
  landmarks[24] = { x: 0.5, y: 0.7, visibility: 0 }
  return landmarks
}

describe('analyzePosture shoulder tilt', () => {
  it('reports level shoulders as about 0 degrees when the left shoulder has the larger x coordinate', () => {
    const result = analyzePosture(
      makeLandmarks(
        { x: 0.62, y: 0.4 },
        { x: 0.38, y: 0.4 },
      ),
      DEFAULT_THRESHOLDS,
    )

    expect(result.shoulderTiltDeg).toBeCloseTo(0, 6)
    expect(result.quality).toBe('full_body')
    expect(result.issue).toBe('good')
  })

  it('keeps reversed-image shoulder tilt in the acute 0-90 degree range', () => {
    const result = analyzePosture(
      makeLandmarks(
        { x: 0.62, y: 0.45 },
        { x: 0.38, y: 0.35 },
      ),
      DEFAULT_THRESHOLDS,
    )

    expect(result.shoulderTiltDeg).toBeCloseTo(22.62, 1)
  })

  it('analyzes an ears-and-shoulders-only pose as upper body without a torso angle', () => {
    const result = analyzePosture(makeUpperBodyLandmarks(), DEFAULT_THRESHOLDS)

    expect(result.quality).toBe('upper_body')
    expect(result.torsoAngleDeg).toBeNull()
    expect(result.issue).toBe('good')
  })

  it('returns no_person when the head signal is missing even if shoulders and hips are visible', () => {
    const landmarks = makeLandmarks(
      { x: 0.62, y: 0.4 },
      { x: 0.38, y: 0.4 },
    )
    landmarks[7] = { x: 0.5, y: 0.2, visibility: 0 }
    landmarks[8] = { x: 0.5, y: 0.2, visibility: 0 }

    expect(analyzePosture(landmarks, DEFAULT_THRESHOLDS).issue).toBe('no_person')
  })
})
