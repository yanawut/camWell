import type { Zone, ZoneBox } from './types'

/** Same grid as backend/app/settings.py. Zones are rectangles on it that always fill it exactly. */
export const GRID = 20

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** A line between zones that moves as one. `min` and `max` are as far as it can go. */
export interface Divider {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
  before: string[]
  after: string[]
  min: number
  max: number
}

/**
 * The zones as repeated straight cuts, worked out from their boxes alone. Removing a zone gives its
 * space to the other side of the cut that made it, which keeps every layout cuttable: a free choice
 * of neighbour can produce a pinwheel, where no neighbour can fill the hole.
 */
interface Cut {
  along: 0 | 1
  at: number
  across: [number, number]
  before: Layout
  after: Layout
}
type Layout = Zone | Cut

const isCut = (node: Layout): node is Cut => 'along' in node
const leaves = (node: Layout): Zone[] => (isCut(node) ? [...leaves(node.before), ...leaves(node.after)] : [node])

function layoutOf(zones: Zone[]): Layout {
  if (zones.length === 1) return zones[0]
  for (const along of [0, 1] as const) {
    for (const at of new Set(zones.map((z) => z.box[along]))) {
      const before = zones.filter((z) => z.box[along + 2] <= at)
      const after = zones.filter((z) => z.box[along] >= at)
      if (before.length && after.length && before.length + after.length === zones.length) {
        const other = along === 0 ? 1 : 0
        const across: [number, number] = [
          Math.min(...zones.map((z) => z.box[other])),
          Math.max(...zones.map((z) => z.box[other + 2])),
        ]
        return { along, at, across, before: layoutOf(before), after: layoutOf(after) }
      }
    }
  }
  throw new Error('zones cannot be cut: the backend refuses such a layout')
}

const beforeLine = (cut: Cut) => leaves(cut.before).filter((z) => z.box[cut.along + 2] === cut.at)
const afterLine = (cut: Cut) => leaves(cut.after).filter((z) => z.box[cut.along] === cut.at)

const area = ({ box: [x0, y0, x1, y1] }: Zone) => (x1 - x0) * (y1 - y0)
const withEdge = (zone: Zone, edge: number, value: number): Zone => ({
  ...zone,
  box: zone.box.map((v, i) => (i === edge ? value : v)) as ZoneBox,
})

/** Halves a box along the axis of `side`. `placed` is the part on that side, null when it is one cell wide. */
export function split([x0, y0, x1, y1]: ZoneBox, side: Side): { kept: ZoneBox; placed: ZoneBox } | null {
  if (side === 'left' || side === 'right') {
    if (x1 - x0 < 2) return null
    const cut = x0 + Math.floor((x1 - x0) / 2)
    const left: ZoneBox = [x0, y0, cut, y1]
    const right: ZoneBox = [cut, y0, x1, y1]
    return side === 'left' ? { placed: left, kept: right } : { placed: right, kept: left }
  }
  if (y1 - y0 < 2) return null
  const cut = y0 + Math.floor((y1 - y0) / 2)
  const top: ZoneBox = [x0, y0, x1, cut]
  const bottom: ZoneBox = [x0, cut, x1, y1]
  return side === 'top' ? { placed: top, kept: bottom } : { placed: bottom, kept: top }
}

/** The biggest zone gives up half, along its longer side. On a tie, the most recently added zone does. */
export function addZone(zones: Zone[], name: string): Zone[] | null {
  const biggest = Math.max(...zones.map(area))
  const zone = zones.findLast((z) => area(z) === biggest)!
  const [x0, y0, x1, y1] = zone.box
  const parts = split(zone.box, x1 - x0 >= y1 - y0 ? 'right' : 'bottom')
  if (!parts) return null
  return [...zones.map((z) => (z === zone ? { ...z, box: parts.kept } : z)), { name, box: parts.placed }]
}

/** The other side of the cut grows over the removed zone. Null when it is the last zone. */
export function removeZone(zones: Zone[], name: string): Zone[] | null {
  if (zones.length === 1) return null
  const hole = zones.find((z) => z.name === name)!
  const rest = zones.filter((z) => z !== hole)
  let node = layoutOf(zones) as Cut
  for (;;) {
    if (node.before === hole || node.after === hole) break
    node = (leaves(node.before).includes(hole) ? node.before : node.after) as Cut
  }
  const growing = node.before === hole ? afterLine(node) : beforeLine(node)
  const edge = node.before === hole ? node.along : node.along + 2
  return rest.map((z) => (growing.includes(z) ? withEdge(z, edge, hole.box[edge]) : z))
}

/** Takes a zone out, then halves the target with it on the given side. Null when the target cannot be halved. */
export function moveZone(zones: Zone[], name: string, target: string, side: Side): Zone[] | null {
  const rest = removeZone(zones, name)
  const parts = rest && split(rest.find((z) => z.name === target)!.box, side)
  if (!rest || !parts) return null
  return zones.map((z) => {
    if (z.name === name) return { ...z, box: parts.placed }
    if (z.name === target) return { ...z, box: parts.kept }
    return rest.find((r) => r.name === z.name)!
  })
}

export function dividers(zones: Zone[]): Divider[] {
  const walk = (node: Layout): Divider[] => {
    if (!isCut(node)) return []
    const before = beforeLine(node)
    const after = afterLine(node)
    const line: Divider = {
      axis: node.along === 0 ? 'x' : 'y',
      at: node.at,
      from: node.across[0],
      to: node.across[1],
      before: before.map((z) => z.name),
      after: after.map((z) => z.name),
      min: Math.max(...before.map((z) => z.box[node.along])) + 1,
      max: Math.min(...after.map((z) => z.box[node.along + 2])) - 1,
    }
    return [line, ...walk(node.before), ...walk(node.after)]
  }
  return walk(layoutOf(zones))
}

export function moveDivider(zones: Zone[], divider: Divider, at: number): Zone[] {
  const along = divider.axis === 'x' ? 0 : 1
  const value = Math.min(divider.max, Math.max(divider.min, at))
  return zones.map((z) => {
    if (divider.before.includes(z.name)) return withEdge(z, along + 2, value)
    if (divider.after.includes(z.name)) return withEdge(z, along, value)
    return z
  })
}

/** The share of the first side when the divider stands at `at`, from 0 to 100. */
export function sharePercent(divider: Divider, at: number): number {
  const low = divider.min - 1
  const high = divider.max + 1
  return Math.round(((at - low) / (high - low)) * 100)
}

/** The side of a zone closest to a grid position. */
export function nearestSide([x0, y0, x1, y1]: ZoneBox, [x, y]: [number, number]): Side {
  const u = (x - x0) / (x1 - x0)
  const v = (y - y0) / (y1 - y0)
  const distances: [Side, number][] = [['left', u], ['right', 1 - u], ['top', v], ['bottom', 1 - v]]
  return distances.reduce((best, d) => (d[1] < best[1] ? d : best))[0]
}
