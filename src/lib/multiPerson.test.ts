import { describe, expect, it } from 'vitest'
import { limitPeopleForMode, maxPeopleFor } from './multiPerson'

describe('maxPeopleFor', () => {
  it('uses one person for workstation mode', () => {
    expect(maxPeopleFor('workstation')).toBe(1)
  })

  it('uses four people for multi mode', () => {
    expect(maxPeopleFor('multi')).toBe(4)
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
})
