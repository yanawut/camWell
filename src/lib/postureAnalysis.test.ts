import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLDS, type Point } from '../types/posture'
import { classifyPosture, extractPostureFeatures } from './postureAnalysis'

const FRAME = { width: 640, height: 480 }
const MIN_VIS = DEFAULT_THRESHOLDS.minVisibility

function makePose(points: Record<number, [number, number]>): Point[] {
  const landmarks: Point[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0,
  }))

  for (const [index, [x, y]] of Object.entries(points)) {
    landmarks[Number(index)] = { x, y, visibility: 0.99 }
  }

  return landmarks
}

const GOOD = makePose({
  7: [0.55, 0.3],
  8: [0.45, 0.3],
  11: [0.62, 0.5],
  12: [0.38, 0.5],
})

const LEAN = makePose({
  7: [0.55, 0.3],
  8: [0.45, 0.3],
  11: [0.62, 0.55],
  12: [0.38, 0.45],
})

function featuresOf(pose: Point[]) {
  const features = extractPostureFeatures(pose, FRAME, MIN_VIS)
  if (!features) throw new Error('expected posture features')
  return features
}

describe('extractPostureFeatures', () => {
  it('reports level shoulders as about 0 degrees when the left shoulder has the larger x coordinate', () => {
    expect(featuresOf(GOOD).shoulderTiltDeg).toBeCloseTo(0, 6)
  })

  it('computes neck angle in pixel space instead of normalized coordinate space', () => {
    const pose = makePose({
      7: [0.6, 0.4],
      8: [0.6, 0.4],
      11: [0.62, 0.5],
      12: [0.38, 0.5],
    })

    expect(featuresOf(pose).neckAngleDeg).toBeCloseTo(53.13, 2)
  })

  it('computes shoulder tilt in pixel space', () => {
    expect(featuresOf(LEAN).shoulderTiltDeg).toBeCloseTo(17.35, 2)
  })

  it('computes torso angle in pixel space', () => {
    const fullBody = makePose({
      7: [0.6, 0.3],
      8: [0.6, 0.3],
      11: [0.72, 0.5],
      12: [0.48, 0.5],
      23: [0.55, 0.7],
      24: [0.45, 0.7],
    })

    const features = featuresOf(fullBody)

    expect(features.quality).toBe('full_body')
    expect(features.torsoAngleDeg).toBeCloseTo(33.69, 2)
  })

  it('computes head height ratio from pixel head height divided by pixel shoulder width', () => {
    expect(featuresOf(GOOD).headHeightRatio).toBeCloseTo(0.625, 3)
  })

  it('analyzes an ears-and-shoulders-only pose as upper body without a torso angle', () => {
    const features = featuresOf(GOOD)

    expect(features.quality).toBe('upper_body')
    expect(features.torsoAngleDeg).toBeNull()
  })

  it('keeps head height ratio null when only one shoulder is visible', () => {
    const oneShoulder = makePose({
      7: [0.55, 0.3],
      8: [0.45, 0.3],
      11: [0.62, 0.5],
    })

    expect(featuresOf(oneShoulder).headHeightRatio).toBeNull()
  })

  it('returns null when the shoulder signal is missing', () => {
    const noShoulders = makePose({
      7: [0.55, 0.3],
      8: [0.45, 0.3],
    })

    expect(extractPostureFeatures(noShoulders, FRAME, MIN_VIS)).toBeNull()
  })

  it('returns null when the head signal is missing even if shoulders and hips are visible', () => {
    const noHead = makePose({
      11: [0.62, 0.5],
      12: [0.38, 0.5],
      23: [0.55, 0.7],
      24: [0.45, 0.7],
    })

    expect(extractPostureFeatures(noHead, FRAME, MIN_VIS)).toBeNull()
  })
})

describe('classifyPosture', () => {
  it('classifies a neutral upper-body pose as good', () => {
    expect(classifyPosture(featuresOf(GOOD), DEFAULT_THRESHOLDS, null)).toBe('good')
  })

  it('classifies sufficiently tilted shoulders as leaning', () => {
    expect(classifyPosture(featuresOf(LEAN), DEFAULT_THRESHOLDS, null)).toBe('leaning')
  })
})
