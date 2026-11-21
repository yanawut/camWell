// วาดภาพสด + overlay, ผังพื้น และ heatmap — overlay พอร์ตมาจาก new-camwell/frontend/src/lib/draw/overlay.ts
// สีตาม room_analytics.py (COL) เพื่อให้หน้าตาเหมือนรัน YOLO ปกติ
import type { Box, Heat, ObjectClass, PersonState, Snapshot } from './types'

export const LAYERS = {
  boxes: 'กรอบคน',
  ids: 'ID',
  states: 'ท่าทาง',
  skeleton: 'โครงร่าง',
  objects: 'สิ่งของ',
  trails: 'เส้นทางเดิน',
  hud: 'แถบสรุปบนภาพ',
  stats: 'แผงสถิติ',
  heatmap: 'Heatmap',
  minimap: 'Floor plan',
  legend: 'Legend',
} as const
export type LayerKey = keyof typeof LAYERS
export type Layers = Record<LayerKey, boolean>
export const DEFAULT_LAYERS: Layers = {
  boxes: true,
  ids: true,
  states: true,
  skeleton: true,
  objects: true,
  trails: true,
  hud: true,
  stats: true,
  heatmap: true,
  minimap: true,
  legend: false,
}

export const COLORS: Record<PersonState | ObjectClass, string> = {
  sitting: 'rgb(110,220,120)',
  standing: 'rgb(90,200,240)',
  walking: 'rgb(255,170,60)',
  chair: 'rgb(230,120,220)',
  table: 'rgb(245,205,70)',
  monitor: 'rgb(120,140,255)',
  laptop: 'rgb(205,200,200)',
}
const TEAL = 'rgb(40,210,200)'
const FONT = '"IBM Plex Sans Thai Looped", "Leelawadee UI", sans-serif'
const PANEL_BG = '#0d121c'

/** เส้นโครงร่างของ keypoint 17 จุดแบบ COCO (ลำดับเดียวกับ ultralytics) */
const COCO_EDGES: readonly [number, number][] = [
  [15, 13], [13, 11], [16, 14], [14, 12], [11, 12], [5, 11], [6, 12], [5, 6], [5, 7], [6, 8],
  [7, 9], [8, 10], [1, 2], [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
]
/** จุดที่มั่นใจต่ำกว่านี้ไม่วาด — ค่าเดียวกับที่ backend ใช้ตัดสินท่านั่ง (classify_posture kc=0.35) */
const KPT_MIN_CONF = 0.35

type Ctx = CanvasRenderingContext2D

function outline(ctx: Ctx, [x1, y1, x2, y2]: Box, color: string, lineWidth: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
}

/** ป้ายข้อความเหนือกรอบ (หรือในกรอบถ้าชิดขอบบนภาพ) */
function tag(ctx: Ctx, [x1, y1]: Box, color: string, text: string, fontPx: number) {
  ctx.strokeStyle = color
  ctx.font = `600 ${fontPx}px ${FONT}`
  const pad = Math.max(3, fontPx * 0.35)
  const w = ctx.measureText(text).width + pad * 2
  const h = fontPx + pad * 2
  let top = y1 - 4 - h
  if (top < 0) top = y1 + 4
  const left = Math.max(0, Math.min(x1, ctx.canvas.width - w - 2))
  ctx.beginPath()
  ctx.roundRect(left, top, w, h, pad)
  ctx.fillStyle = 'rgba(18,22,25,0.82)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#f5f5f5'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(text, left + pad, top + h / 2)
}

function drawObjects(ctx: Ctx, snap: Snapshot, fontPx: number) {
  const seen = snap.objects.filter((o) => o.seen).sort((a, b) => a.box[3] - b.box[3])
  for (const o of seen) {
    const color = COLORS[o.cls]
    outline(ctx, o.box, color, 1)
    if (o.cls === 'chair' && o.occupied) tag(ctx, o.box, color, `chair #${String(o.id).padStart(2, '0')} occupied`, fontPx * 0.85)
  }
}

function drawTrails(ctx: Ctx, snap: Snapshot, thick: number) {
  for (const p of snap.people) {
    ctx.fillStyle = COLORS[p.state]
    const n = p.trail.length
    if (n <= 2) continue
    for (let i = 0; i < n - 1; i += 2) {
      ctx.globalAlpha = 0.25 + (0.75 * i) / Math.max(1, n - 1)
      ctx.beginPath()
      ctx.arc(p.trail[i][0], p.trail[i][1], Math.max(1, thick), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

function drawSkeletons(ctx: Ctx, snap: Snapshot, thick: number) {
  ctx.lineCap = 'round'
  for (const p of snap.people) {
    const k = p.kpts
    if (!k || k.length !== 17) continue
    const color = COLORS[p.state]
    ctx.strokeStyle = color
    ctx.lineWidth = thick + 1.5
    ctx.beginPath()
    for (const [a, b] of COCO_EDGES) {
      if (k[a][2] < KPT_MIN_CONF || k[b][2] < KPT_MIN_CONF) continue
      ctx.moveTo(k[a][0], k[a][1])
      ctx.lineTo(k[b][0], k[b][1])
    }
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    for (const [x, y, c] of k) {
      if (c < KPT_MIN_CONF) continue
      ctx.beginPath()
      ctx.arc(x, y, thick + 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawPeople(ctx: Ctx, snap: Snapshot, fontPx: number, thick: number, layers: Layers) {
  for (const p of [...snap.people].sort((a, b) => a.box[3] - b.box[3])) {
    const color = COLORS[p.state]
    if (layers.boxes) {
      outline(ctx, p.box, color, thick + 1)
      const bw = p.box[2] - p.box[0]
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(p.ground[0], p.ground[1], Math.max(6, bw * 0.35), Math.max(3, bw * 0.1), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    const parts = [
      layers.ids ? `person #${String(p.id).padStart(2, '0')}` : null,
      layers.states ? p.state : null,
    ].filter((part): part is string => part !== null)
    if (parts.length) tag(ctx, p.box, color, `${parts.join(' ')} ${p.conf.toFixed(2)}`, fontPx)
  }
}

function drawHud(ctx: Ctx, snap: Snapshot) {
  const s = ctx.canvas.height / 1000
  const S = (v: number) => v * s
  const chip = (x: number, title: string, value: number, bg: string) => {
    const w = S(172)
    const h = S(60)
    ctx.beginPath()
    ctx.roundRect(x, S(30), w, h, S(9))
    ctx.fillStyle = bg
    ctx.fill()
    ctx.fillStyle = '#f5f5f5'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = `700 ${S(22)}px ${FONT}`
    ctx.fillText(title, x + S(14), S(60))
    ctx.textAlign = 'right'
    ctx.font = `700 ${S(36)}px ${FONT}`
    ctx.fillText(String(value), x + w - S(14), S(60))
  }
  chip(S(34), 'PEOPLE', snap.stats.people, 'rgba(40,120,190,0.92)')
  chip(S(34) + S(176), 'SEATED', snap.stats.sitting, 'rgba(40,130,60,0.92)')

  const minutes = String(Math.floor(snap.t / 60)).padStart(2, '0')
  const seconds = String(Math.floor(snap.t % 60)).padStart(2, '0')
  ctx.beginPath()
  ctx.roundRect(S(34) + S(92), S(92), S(160), S(44), S(7))
  ctx.fillStyle = 'rgba(20,26,30,0.88)'
  ctx.fill()
  ctx.fillStyle = '#f5f5f5'
  ctx.textAlign = 'center'
  ctx.font = `700 ${S(30)}px ${FONT}`
  ctx.fillText(`${minutes}:${seconds}`, S(34) + S(172), S(114))

  const barH = S(84)
  const barW = Math.min(ctx.canvas.width - S(68), S(1100))
  const x = S(34)
  const y = ctx.canvas.height - barH - S(28)
  ctx.beginPath()
  ctx.roundRect(x, y, barW, barH, S(13))
  ctx.fillStyle = 'rgba(20,26,30,0.88)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(70,90,90,1)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.strokeStyle = TEAL
  ctx.lineWidth = Math.max(1, S(2))
  ctx.beginPath()
  ctx.arc(x + S(46), y + barH / 2, S(18), 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = TEAL
  ctx.beginPath()
  ctx.arc(x + S(46), y + barH / 2, S(6), 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f5f5f5'
  ctx.font = `700 ${S(26)}px ${FONT}`
  ctx.fillText(snap.model, x + S(86), y + S(36))
  ctx.fillStyle = 'rgb(160,170,175)'
  ctx.font = `400 ${S(19)}px ${FONT}`
  ctx.fillText(
    snap.badge === 'SIM' ? 'Synthetic office scene - same analytics pipeline' : 'Real-Time Detection, Tracking & Analytics',
    x + S(86),
    y + S(66),
  )

  const cols: [string, string, string][] = [
    ['FPS', snap.fps.toFixed(1), TEAL],
    ['Mean conf', snap.stats.meanConf.toFixed(2), TEAL],
    ['Tracking ID', `Active (${snap.stats.activeIds})`, 'rgb(120,220,110)'],
  ]
  cols.forEach(([title, value, color], i) => {
    const cx = x + barW * 0.52 + i * barW * 0.16
    ctx.strokeStyle = 'rgba(70,90,90,1)'
    ctx.beginPath()
    ctx.moveTo(cx - S(15), y + S(15))
    ctx.lineTo(cx - S(15), y + barH - S(15))
    ctx.stroke()
    ctx.fillStyle = 'rgb(160,170,175)'
    ctx.font = `400 ${S(18)}px ${FONT}`
    ctx.fillText(title, cx, y + S(33))
    ctx.fillStyle = color
    ctx.font = `700 ${S(i < 2 ? 27 : 22)}px ${FONT}`
    ctx.fillText(value, cx, y + S(66))
  })
}

export function drawLiveFrame(ctx: Ctx, frame: CanvasImageSource, snap: Snapshot, layers: Layers) {
  const { canvas } = ctx
  const [w, h] = snap.size
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.drawImage(frame, 0, 0, w, h)
  const fontPx = Math.max(11, h / 62)
  const thick = Math.max(1, Math.round(h / 600))
  if (layers.objects) drawObjects(ctx, snap, fontPx)
  if (layers.trails) drawTrails(ctx, snap, thick)
  if (layers.skeleton) drawSkeletons(ctx, snap, thick)
  drawPeople(ctx, snap, fontPx, thick, layers)
  if (layers.hud) drawHud(ctx, snap)
}

/** ปรับขนาด canvas ให้ตรงกับขนาดที่แสดงจริง × devicePixelRatio แล้วคืน context ที่วาดด้วยหน่วย CSS pixel */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: Ctx; width: number; height: number } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { width, height } = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const pw = Math.max(1, Math.round(width * dpr))
  const ph = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, width, height }
}

/** ตำแหน่งพื้นห้อง (w × d เมตร) ในกรอบ width × height แบบคงสัดส่วน */
function floorFrame(w: number, d: number, width: number, height: number, pad = 12) {
  const scale = Math.max(0.0001, Math.min((width - pad * 2) / w, (height - pad * 2) / d))
  const ox = (width - w * scale) / 2
  const oy = (height - d * scale) / 2
  return { scale, X: (x: number) => ox + x * scale, Y: (y: number) => oy + y * scale }
}

export type PersonMarker = 'dot' | 'id'
export const PERSON_MARKERS: Record<PersonMarker, string> = { dot: 'จุด', id: 'ID' }

export function drawFloorPlan(
  ctx: Ctx,
  width: number,
  height: number,
  snap: Snapshot,
  view: { showObjects: boolean; marker: PersonMarker },
) {
  const { w, d, zones } = snap.floor
  const { scale, X, Y } = floorFrame(w, d, width, height)
  ctx.fillStyle = PANEL_BG
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let x = 1; x < w; x++) {
    ctx.beginPath()
    ctx.moveTo(X(x), Y(0))
    ctx.lineTo(X(x), Y(d))
    ctx.stroke()
  }
  for (let y = 1; y < d; y++) {
    ctx.beginPath()
    ctx.moveTo(X(0), Y(y))
    ctx.lineTo(X(w), Y(y))
    ctx.stroke()
  }

  ctx.font = `600 11px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (const [name, poly] of Object.entries(zones)) {
    ctx.strokeStyle = 'rgba(40,210,200,0.55)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(40,210,200,0.85)'
    ctx.fillText(name, X(Math.min(...poly.map((p) => p[0]))) + 5, Y(Math.min(...poly.map((p) => p[1]))) + 4)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.strokeRect(X(0), Y(0), w * scale, d * scale)

  if (view.showObjects) {
    for (const o of snap.objects) {
      const size = o.cls === 'table' ? 14 : 7
      ctx.strokeStyle = COLORS[o.cls]
      ctx.fillStyle = COLORS[o.cls]
      const [x, y] = [X(o.floor[0]), Y(o.floor[1])]
      if (o.cls === 'chair' && o.occupied) ctx.fillRect(x - size / 2, y - size / 2, size, size)
      else ctx.strokeRect(x - size / 2, y - size / 2, size, size)
    }
  }

  for (const p of snap.people) {
    const color = COLORS[p.state]
    ctx.fillStyle = color
    ctx.globalAlpha = 0.5
    for (const [x, y] of p.floorTrail) {
      ctx.beginPath()
      ctx.arc(X(x), Y(y), 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    const [x, y] = [X(p.floor[0]), Y(p.floor[1])]
    ctx.beginPath()
    ctx.arc(x, y, view.marker === 'id' ? 9 : 5, 0, Math.PI * 2)
    ctx.fill()
    if (view.marker === 'id') {
      ctx.fillStyle = '#0d121c'
      ctx.font = `700 10px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(p.id), x, y + 0.5)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
    }
  }
}

export function drawHeatmap(ctx: Ctx, width: number, height: number, floor: { w: number; d: number }, heat: Heat | null) {
  const { scale, X, Y } = floorFrame(floor.w, floor.d, width, height)
  ctx.fillStyle = PANEL_BG
  ctx.fillRect(0, 0, width, height)
  if (heat) {
    const cw = (floor.w * scale) / heat.w
    const ch = (floor.d * scale) / heat.h
    for (let j = 0; j < heat.h; j++) {
      for (let i = 0; i < heat.w; i++) {
        const v = heat.data[j * heat.w + i] / 255
        if (v <= 0.02) continue
        // น้ำเงิน → เขียวอมฟ้า → เหลือง → แดง ตามความหนาแน่น
        ctx.fillStyle = `hsl(${Math.round(220 - v * 220)} 90% 55% / ${0.25 + v * 0.75})`
        ctx.fillRect(X(0) + i * cw, Y(0) + j * ch, cw + 0.5, ch + 0.5)
      }
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.strokeRect(X(0), Y(0), floor.w * scale, floor.d * scale)
}
