import { describe, expect, it } from 'vitest'
import { nextCachedPoseResult } from './poseResultCache'

describe('nextCachedPoseResult', () => {
  it('keeps the latest pose result when an animation tick has no new pose result', () => {
    const latest = { frame: 1 }

    expect(nextCachedPoseResult(latest, null)).toBe(latest)
  })

  it('replaces the cached pose result when a new result arrives', () => {
    const previous = { frame: 1 }
    const next = { frame: 2 }

    expect(nextCachedPoseResult(previous, next)).toBe(next)
  })

  it('starts empty after the camera source changes', () => {
    expect(nextCachedPoseResult({ frame: 1 }, null, true)).toBeNull()
  })
})
