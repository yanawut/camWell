import { describe, expect, it } from 'vitest'
import type { Zone } from './types'
import { addZone, dividers, GRID, moveDivider, moveZone, nearestSide, removeZone, sharePercent } from './zoneLayout'

const WHOLE: Zone[] = [{ name: 'A', box: [0, 0, GRID, GRID] }]
const boxes = (zones: Zone[]) => Object.fromEntries(zones.map((z) => [z.name, z.box]))
const added = (...names: string[]) => names.reduce((zones, name) => addZone(zones, name)!, WHOLE)

function expectFilled(zones: Zone[]) {
  const cells = Array.from({ length: GRID * GRID }, () => 0)
  for (const { box: [x0, y0, x1, y1] } of zones) {
    expect(x0 < x1 && y0 < y1).toBe(true)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[y * GRID + x] += 1
  }
  expect(cells.every((c) => c === 1)).toBe(true)
}

describe('adding zones', () => {
  it('splits left and right, then top and bottom', () => {
    expect(boxes(added('B'))).toEqual({ A: [0, 0, 10, 20], B: [10, 0, 20, 20] })
    expect(boxes(added('B', 'C'))).toEqual({ A: [0, 0, 10, 20], B: [10, 0, 20, 10], C: [10, 10, 20, 20] })
  })

  it('halves the biggest zone, and the latest one on a tie', () => {
    expect(boxes(added('B', 'C', 'D')).A).toEqual([0, 0, 10, 10])
    expect(boxes(added('B', 'C', 'D', 'E'))).toMatchObject({ D: [0, 10, 5, 20], E: [5, 10, 10, 20] })
  })
})

describe('adjusting a divider', () => {
  const layout = added('B', 'C')
  const between = (a: string, b: string) => dividers(layout).find((d) => d.before.includes(a) && d.after.includes(b))!

  it('turns 50/50 into 70/30', () => {
    const line = between('B', 'C')
    expect(sharePercent(line, line.at)).toBe(50)
    const moved = moveDivider(layout, line, 14)
    expect(boxes(moved)).toMatchObject({ B: [10, 0, 20, 14], C: [10, 14, 20, 20] })
    expect(sharePercent(line, 14)).toBe(70)
  })

  it('moves one long line for everything that touches it', () => {
    const line = between('A', 'B')
    expect(line).toMatchObject({ axis: 'x', at: 10, from: 0, to: 20, before: ['A'], after: ['B', 'C'], min: 1, max: 19 })
    expect(boxes(moveDivider(layout, line, 6))).toEqual({ A: [0, 0, 6, 20], B: [6, 0, 20, 10], C: [6, 10, 20, 20] })
  })

  it('stops before a zone would vanish', () => {
    expect(boxes(moveDivider(layout, between('B', 'C'), 99)).C).toEqual([10, 19, 20, 20])
  })

  it('treats the two halves of a cross as separate lines', () => {
    const cross = added('B', 'C', 'D')
    expect(dividers(cross).filter((d) => d.axis === 'y' && d.at === 10)).toHaveLength(2)
  })
})

describe('moving a zone', () => {
  it('puts C under A and lets B take the whole right side', () => {
    const moved = moveZone(added('B', 'C'), 'C', 'A', 'bottom')!
    expect(boxes(moved)).toEqual({ A: [0, 0, 10, 10], B: [10, 0, 20, 20], C: [0, 10, 10, 20] })
  })

  it('can swap two neighbours', () => {
    expect(boxes(moveZone(added('B'), 'B', 'A', 'left')!)).toEqual({ A: [10, 0, 20, 20], B: [0, 0, 10, 20] })
  })

  it('keeps the order zones were added in', () => {
    expect(moveZone(added('B', 'C'), 'C', 'A', 'top')!.map((z) => z.name)).toEqual(['A', 'B', 'C'])
  })

  it('refuses a target one cell wide', () => {
    const line = dividers(added('B'))[0]
    const thin = moveDivider(added('B'), line, 1)
    const three = addZone(thin, 'C')!
    expect(moveZone(three, 'C', 'A', 'left')).toBeNull()
  })
})

describe('removing a zone', () => {
  it('gives its space to the zones beside it', () => {
    expect(boxes(removeZone(added('B', 'C'), 'C')!)).toEqual({ A: [0, 0, 10, 20], B: [10, 0, 20, 20] })
    expect(boxes(removeZone(added('B', 'C'), 'A')!)).toEqual({ B: [0, 0, 20, 10], C: [0, 10, 20, 20] })
  })

  it('refuses the last zone', () => {
    expect(removeZone(WHOLE, 'A')).toBeNull()
  })
})

it('picks the side of a zone closest to the pointer', () => {
  expect(nearestSide([0, 0, 10, 20], [1, 10])).toBe('left')
  expect(nearestSide([0, 0, 10, 20], [5, 19])).toBe('bottom')
})

it('stays a full, exact tiling through any sequence of edits', () => {
  let seed = 12345
  const random = (n: number) => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return Math.floor((seed / 2 ** 32) * n)
  }
  const sides = ['left', 'right', 'top', 'bottom'] as const
  let zones = WHOLE
  let next = 0
  for (let step = 0; step < 20000; step++) {
    const zone = zones[random(zones.length)].name
    const action = random(4)
    if (action === 0 && zones.length < 12) zones = addZone(zones, `Z${next++}`) ?? zones
    if (action === 1 && zones.length > 1) {
      const smaller = removeZone(zones, zone)
      expect(smaller, 'every zone can be removed').not.toBeNull()
      zones = smaller!
    }
    if (action === 2 && zones.length > 1) {
      const target = zones.filter((z) => z.name !== zone)[random(zones.length - 1)].name
      zones = moveZone(zones, zone, target, sides[random(4)]) ?? zones
    }
    if (action === 3) {
      const lines = dividers(zones)
      if (lines.length) zones = moveDivider(zones, lines[random(lines.length)], random(GRID))
    }
    expectFilled(zones)
  }
})
