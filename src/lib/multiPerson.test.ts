import { describe, expect, it } from 'vitest'
import {
  formatMaxPeople,
  isDetectionMode,
  landmarkerNumPosesFor,
  limitPeopleForMode,
  maxPeopleFor,
  MEDIAPIPE_MAX_POSES,
} from './multiPerson'

describe('maxPeopleFor', () => {
  it('uses one person for workstation mode', () => {
    expect(maxPeopleFor('workstation')).toBe(1)
  })

  it('uses four people for multi mode', () => {
    expect(maxPeopleFor('multi')).toBe(4)
  })

  it('has no limit in unlimited mode', () => {
    expect(maxPeopleFor('unlimited')).toBe(Infinity)
  })
})

describe('landmarkerNumPosesFor', () => {
  it('caps unlimited mode to a finite MediaPipe numPoses', () => {
    expect(landmarkerNumPosesFor('unlimited')).toBe(MEDIAPIPE_MAX_POSES)
    expect(landmarkerNumPosesFor('multi')).toBe(4)
  })
})

describe('formatMaxPeople', () => {
  it('shows finite limits as numbers and Infinity as unlimited', () => {
    expect(formatMaxPeople(4)).toBe('4')
    expect(formatMaxPeople(Infinity)).toBe('ไม่จำกัด')
  })
})

describe('isDetectionMode', () => {
  it('accepts known modes only', () => {
    expect(isDetectionMode('unlimited')).toBe(true)
    expect(isDetectionMode('everyone')).toBe(false)
  })
})

describe('limitPeopleForMode', () => {
  it('keeps only the largest detection in workstation mode without mutating the input', () => {
    const detections = [
      { id: 'small', width: 20 },
      { id: 'largest', width: 80 },
      { id: 'medium', width: 50 },
    ]

    const limited = limitPeopleForMode(detections, 'workstation', (item) => item.width)

    expect(limited.map((item) => item.id)).toEqual(['largest'])
    expect(detections.map((item) => item.id)).toEqual(['small', 'largest', 'medium'])
  })

  it('keeps at most the four largest detections in multi mode', () => {
    const detections = [
      { id: 'a', width: 10 },
      { id: 'b', width: 50 },
      { id: 'c', width: 30 },
      { id: 'd', width: 40 },
      { id: 'e', width: 20 },
    ]

    const limited = limitPeopleForMode(detections, 'multi', (item) => item.width)

    expect(limited.map((item) => item.id)).toEqual(['b', 'd', 'c', 'e'])
  })

  it('keeps every detection in unlimited mode', () => {
    const detections = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, width: i }))

    expect(limitPeopleForMode(detections, 'unlimited', (item) => item.width)).toHaveLength(30)
  })
})
