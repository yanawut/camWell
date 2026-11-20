import { beforeEach, describe, expect, it } from 'vitest'
import type { PostureBaseline } from '../types/posture'
import {
  clearPostureBaseline,
  loadPostureBaseline,
  savePostureBaseline,
} from '../services/postureBaselineStore'

const memory = new Map<string, string>()

const fakeLocalStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem(key) {
    return memory.get(key) ?? null
  },
  setItem(key, value) {
    memory.set(key, value)
  },
  removeItem(key) {
    memory.delete(key)
  },
}

const baseline: PostureBaseline = {
  neckAngleDeg: 8,
  torsoAngleDeg: null,
  shoulderTiltDeg: 2,
  headHeightRatio: 0.62,
  createdAt: 1000,
}

beforeEach(() => {
  memory.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fakeLocalStorage,
  })
})

describe('postureBaselineStore', () => {
  it('stores baselines under separate per-camera keys', () => {
    savePostureBaseline('cam-1', baseline)

    expect(loadPostureBaseline('cam-1')).toEqual(baseline)
    expect(loadPostureBaseline('cam-2')).toBeNull()
    expect(memory.has('camwell:posture-baseline:v1:cam-1')).toBe(true)
  })

  it('clears only the selected camera baseline', () => {
    savePostureBaseline('cam-1', baseline)
    savePostureBaseline('cam-2', { ...baseline, neckAngleDeg: 12 })

    clearPostureBaseline('cam-1')

    expect(loadPostureBaseline('cam-1')).toBeNull()
    expect(loadPostureBaseline('cam-2')?.neckAngleDeg).toBe(12)
  })

  it('treats malformed stored JSON as uncalibrated instead of throwing', () => {
    memory.set('camwell:posture-baseline:v1:cam-1', '{bad json')

    expect(loadPostureBaseline('cam-1')).toBeNull()
  })
})
