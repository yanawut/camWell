import { describe, expect, it } from 'vitest'
import { homography, isConvexQuad, project } from './homography'
import type { Point } from './types'

const FLOOR: Point[] = [[0, 0], [8, 0], [8, 6], [0, 6]]
const IMAGE: Point[] = [[0.22, 0.42], [0.78, 0.42], [0.99, 0.98], [0.01, 0.98]]

describe('homography', () => {
  it('maps the four corners exactly', () => {
    const h = homography(FLOOR, IMAGE)!
    FLOOR.forEach((p, i) => {
      const [x, y] = project(h, p)
      expect(x).toBeCloseTo(IMAGE[i][0], 8)
      expect(y).toBeCloseTo(IMAGE[i][1], 8)
    })
  })

  it('agrees with cv2.getPerspectiveTransform on an interior point', () => {
    // floor (4, 3) under room_analytics.FloorMap(default_floor_pts(1, 1), (8, 6)).to_img
    const [x, y] = project(homography(FLOOR, IMAGE)!, [4, 3])
    expect(x).toBeCloseTo(0.5, 5)
    expect(y).toBeCloseTo(0.62363636, 5)
  })

  it('returns null for degenerate points', () => {
    expect(homography(FLOOR, [[0, 0], [0.5, 0], [1, 0], [0.2, 0]])).toBeNull()
  })
})

describe('isConvexQuad', () => {
  it('accepts a floor trapezoid in either winding', () => {
    expect(isConvexQuad(IMAGE)).toBe(true)
    expect(isConvexQuad([...IMAGE].reverse())).toBe(true)
  })

  it('rejects crossed and collinear quads', () => {
    expect(isConvexQuad([[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]])).toBe(false)
    expect(isConvexQuad([[0.1, 0.1], [0.5, 0.1], [0.9, 0.1], [0.2, 0.1]])).toBe(false)
  })
})
