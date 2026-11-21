import { homography, project } from './homography'
import type { FloorSettings, Point, Zone } from './types'
import { GRID } from './zoneLayout'

interface Nearest {
  index: number
  distance: number
}

/** Distances are in picture widths, so a handle is as easy to grab vertically as horizontally. */
export function nearestVertex(pts: Point[], p: Point, aspect: number): Nearest {
  let best: Nearest = { index: -1, distance: Infinity }
  pts.forEach((q, index) => {
    const distance = Math.hypot(q[0] - p[0], (q[1] - p[1]) / aspect)
    if (distance < best.distance) best = { index, distance }
  })
  return best
}

/** The closest polygon edge; edge i runs from point i to the point after it. */
export function nearestEdge(pts: Point[], p: Point, aspect: number): Nearest {
  let best: Nearest = { index: -1, distance: Infinity }
  const px = p[0]
  const py = p[1] / aspect
  pts.forEach((a, index) => {
    const b = pts[(index + 1) % pts.length]
    const ax = a[0]
    const ay = a[1] / aspect
    const dx = b[0] - ax
    const dy = b[1] / aspect - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
    const distance = Math.hypot(px - ax - t * dx, py - ay - t * dy)
    if (distance < best.distance) best = { index, distance }
  })
  return best
}

export interface FloorBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const frameOf = (settings: FloorSettings): Point[] => settings.floor_area ?? settings.floor_pts

const rectangle = ({ floor_size_m: [W, D] }: FloorSettings): Point[] => [[0, 0], [W, 0], [W, D], [0, D]]
const depth = (h: number[], [x, y]: Point) => h[6] * x + h[7] * y + h[8]

/** Maps a normalised picture point onto the floor, or null when it is above the horizon and so not on the floor. */
function imageToFloor(settings: FloorSettings, p: Point): Point | null {
  const h = homography(settings.floor_pts, rectangle(settings))
  if (!h) return null
  const inside = settings.floor_pts.reduce((sum, q) => sum + depth(h, q), 0)
  return depth(h, p) * inside > 0 ? project(h, p) : null
}

const frameOnFloor = (settings: FloorSettings) =>
  frameOf(settings).map((p) => imageToFloor(settings, p)).filter((p) => p !== null)

/** The rectangle the zone grid is stretched over, in the reference rectangle's metres. Same as FloorSettings.extents. */
export function floorBox(settings: FloorSettings): FloorBox {
  const points = [...rectangle(settings), ...frameOnFloor(settings)]
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

export function frameOnGrid(settings: FloorSettings, box: FloorBox): Point[] {
  return frameOnFloor(settings).map(([x, y]): Point => [
    ((x - box.x0) / (box.x1 - box.x0)) * GRID,
    ((y - box.y0) / (box.y1 - box.y0)) * GRID,
  ])
}

/** A zone on the picture, normalised. Null while the frame being dragged puts it behind the camera. */
export function zoneOnPicture(settings: FloorSettings, zone: Zone, box: FloorBox) {
  const toImage = homography(rectangle(settings), settings.floor_pts)
  if (!toImage) return null
  const floor = (cx: number, cy: number): Point => [
    box.x0 + (cx / GRID) * (box.x1 - box.x0),
    box.y0 + (cy / GRID) * (box.y1 - box.y0),
  ]
  const [a, b, c, d] = zone.box
  const corners = [floor(a, b), floor(c, b), floor(c, d), floor(a, d)]
  const inside = rectangle(settings).reduce((sum, p) => sum + depth(toImage, p), 0)
  if (corners.some((p) => depth(toImage, p) * inside <= 0)) return null
  return { outline: corners.map((p) => project(toImage, p)), centre: project(toImage, floor((a + c) / 2, (b + d) / 2)) }
}
