import { describe, expect, it } from 'vitest'
import { computeDropRatio, pruneHistory, shouldAlertLeftFrame } from './fallDetection'

describe('computeDropRatio', () => {
  it('returns null when there is only one torso reading', () => {
    expect(computeDropRatio([{ t: 0, y: 0.4 }])).toBeNull()
  })

  it('reports a 0.30 downward drop from y=0.40 to y=0.70', () => {
    const history = [
      { t: 0, y: 0.4 },
      { t: 200, y: 0.5 },
      { t: 400, y: 0.7 },
    ]

    expect(computeDropRatio(history)).toBeCloseTo(0.3)
  })

  it('does not count upward movement as a drop', () => {
    const history = [
      { t: 0, y: 0.7 },
      { t: 400, y: 0.4 },
    ]

    expect(computeDropRatio(history)).toBe(0)
  })
})

describe('pruneHistory', () => {
  it('removes readings older than the configured time window', () => {
    const history = [
      { t: 0, y: 0.4 },
      { t: 500, y: 0.45 },
      { t: 900, y: 0.5 },
    ]

    expect(pruneHistory(history, 1000, 700)).toEqual([
      { t: 500, y: 0.45 },
      { t: 900, y: 0.5 },
    ])
  })
})

describe('shouldAlertLeftFrame', () => {
  it('alerts when the last sighting is exactly at the disappear grace boundary after a rapid drop', () => {
    expect(shouldAlertLeftFrame(3500, 1000, 2500)).toBe(true)
  })

  it('does not alert when the person remained visible beyond the disappear grace window', () => {
    expect(shouldAlertLeftFrame(3501, 1000, 2500)).toBe(false)
  })

  it('does not alert when no rapid drop was recorded before the person left frame', () => {
    expect(shouldAlertLeftFrame(3500, 0, 2500)).toBe(false)
  })
})
