import { describe, expect, it } from 'vitest'
import { buildSkeletonSegments, POSE_CONNECTIONS } from './skeletonOverlay'
import type { Point } from '../types/posture'

function pose(overrides: Record<number, Partial<Point>> = {}): Point[] {
  return Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: i / 100, visibility: 0.9, ...overrides[i] }))
}

describe('buildSkeletonSegments', () => {
  it('draws every BlazePose connection when all landmarks are visible', () => {
    expect(buildSkeletonSegments(pose(), 0.5).bones).toHaveLength(POSE_CONNECTIONS.length)
  })

  it('skips bones touching a landmark below minVisibility (e.g. legs off-frame)', () => {
    const hidden = Object.fromEntries([25, 26, 27, 28, 29, 30, 31, 32].map((i) => [i, { visibility: 0.1 }]))
    const { bones } = buildSkeletonSegments(pose(hidden), 0.5)
    expect(bones.every(([a, b]) => a.visibility !== 0.1 && b.visibility !== 0.1)).toBe(true)
    expect(bones).toHaveLength(POSE_CONNECTIONS.length - 10)
  })

  it('neck goes from shoulder midpoint to ear midpoint — the same line used for neckAngleDeg', () => {
    const lm = pose({ 7: { x: 0.4, y: 0.2 }, 8: { x: 0.6, y: 0.2 }, 11: { x: 0.3, y: 0.5 }, 12: { x: 0.7, y: 0.5 } })
    const { neck } = buildSkeletonSegments(lm, 0.5)
    expect(neck?.[0]).toMatchObject({ x: 0.5, y: 0.5 })
    expect(neck?.[1]).toMatchObject({ x: 0.5, y: 0.2 })
  })

  it('neck falls back to the nose when both ears are hidden', () => {
    const lm = pose({ 0: { x: 0.45, y: 0.1 }, 7: { visibility: 0 }, 8: { visibility: 0 } })
    expect(buildSkeletonSegments(lm, 0.5).neck?.[1]).toMatchObject({ x: 0.45, y: 0.1 })
  })

  it('spine is null when both hips are hidden (upper-body only)', () => {
    const lm = pose({ 23: { visibility: 0.2 }, 24: { visibility: 0.2 } })
    const result = buildSkeletonSegments(lm, 0.5)
    expect(result.spine).toBeNull()
    expect(result.neck).not.toBeNull()
  })
})
