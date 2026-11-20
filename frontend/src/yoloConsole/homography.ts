import type { Point } from './types'

export type Homography = number[] // 3x3, row major

/** Perspective transform taking 4 src points to 4 dst points, or null when the points are degenerate. */
export function homography(src: Point[], dst: Point[]): Homography | null {
  const rows: number[][] = []
  src.forEach(([x, y], i) => {
    const [u, v] = dst[i]
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  })
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r
    if (Math.abs(rows[pivot][col]) < 1e-9) return null
    ;[rows[col], rows[pivot]] = [rows[pivot], rows[col]]
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const factor = rows[r][col] / rows[col][col]
      for (let c = col; c < 9; c++) rows[r][c] -= factor * rows[col][c]
    }
  }
  return [...rows.map((row, i) => row[8] / row[i]), 1]
}

export function project(h: Homography, [x, y]: Point): Point {
  const w = h[6] * x + h[7] * y + h[8]
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}

/** Same rule the backend enforces: the 4 floor points must form a convex quad, in order. */
export function isConvexQuad(pts: Point[]) {
  const cross = pts.map((a, i) => {
    const b = pts[(i + 1) % 4]
    const c = pts[(i + 2) % 4]
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
  })
  return cross.every((v) => v > 1e-6) || cross.every((v) => v < -1e-6)
}
