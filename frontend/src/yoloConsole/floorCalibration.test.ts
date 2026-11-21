import { describe, expect, it } from 'vitest'
import { nearestEdge, nearestVertex } from './floorCalibration'
import type { Point } from './types'

describe('picking on the frame', () => {
  const square: Point[] = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]

  it('finds the closest point', () => {
    expect(nearestVertex(square, [0.79, 0.21], 1).index).toBe(1)
  })

  it('finds the closest edge, including the one that closes the frame', () => {
    expect(nearestEdge(square, [0.5, 0.19], 1).index).toBe(0)
    expect(nearestEdge(square, [0.21, 0.5], 1).index).toBe(3)
  })

  it('measures vertical distance in picture widths', () => {
    expect(nearestEdge(square, [0.5, 0.16], 16 / 9).distance).toBeCloseTo(0.04 / (16 / 9), 5)
  })
})
