// แผง "วางมุมพื้นห้อง" "โซน" และแถบบันทึก — พอร์ตจาก FloorTab ของ ?yolo-console (คณิตศาสตร์ใช้โมดูลเดิมของคอนโซลตรง ๆ)
// กรอบพื้น = floor_area ?? floor_pts: 4 มุมของ floor_pts ตรึงระนาบพื้น ส่วนจุดที่เพิ่มบนเส้นกรอบขยายพื้นที่ออกไป
// ตารางโซนขึงเต็มกรอบนั้น (floorBox = FloorSettings.extents ฝั่ง backend)
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from 'react'
import { floorBox, frameOf, frameOnGrid, nearestEdge, nearestVertex, zoneOnPicture } from '../yoloConsole/floorCalibration'
import { homography, isConvexQuad, project } from '../yoloConsole/homography'
import type { FloorSettings, Point } from '../yoloConsole/types'
import { useLiveDraw, useYoloLive } from '../yoloConsole/useYoloLive'
import { yoloService } from '../yoloConsole/yoloService'
import {
  addZone,
  type Divider,
  dividers,
  GRID,
  moveDivider,
  moveZone,
  nearestSide,
  removeZone,
  sharePercent,
  type Side,
  split,
} from '../yoloConsole/zoneLayout'
import {
  canUndo,
  CORNERS,
  draftOf,
  floorEdit,
  floorValid,
  isDirty,
  nameTaken,
  renameZone,
  sizeValid,
  startFloorEdit,
} from './cameraFloorEdit'
import { Glyph, Phrases } from './marks'
import { errorText } from './errorText'

// สีบนภาพจากกล้อง: ข้อยกเว้นภาพสดของ DESIGN.md ต้องอ่านออกบนภาพใดก็ได้ จึงไม่ใช้หมึกของหน้า
const ON_PICTURE = {
  frame: 'rgb(40 210 200)',
  invalid: 'rgb(255 80 80)',
  invalidFill: 'rgb(255 60 60 / 0.2)',
  grid: 'rgb(255 255 0 / 0.45)',
  point: 'rgb(230 50 50)',
  ring: 'white',
  label: 'white',
  halo: 'rgb(0 0 0 / 0.7)',
}
const ZONE_COLORS = ['40 210 200', '255 170 60', '230 120 220', '120 220 110', '120 140 255']
const zoneColor = (i: number, alpha = 1) => `rgb(${ZONE_COLORS[i % ZONE_COLORS.length]} / ${alpha})`

// ระยะจับจุดและเส้นคิดเป็นสัดส่วนของความกว้างภาพเหมือนคอนโซล แต่ไม่น้อยกว่าขนาดปลายนิ้วบนจอ เมื่อภาพย่อเหลือความกว้างโทรศัพท์
const HANDLE_RADIUS = 0.03
const LINE_RADIUS = 0.012
const HANDLE_MIN_PX = 22
const LINE_MIN_PX = 12
const PLAN_MAX_HEIGHT_PX = 360
const HATCH = GRID / 55

const percent = (cells: number) => `${(cells / GRID) * 100}%`
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const samePlace = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1]
const toPoints = (pts: Point[]) => pts.map((p) => p.join(',')).join(' ')
const positive = (v: number) => (v > 0 ? v : 1)

/** จุดหนึ่งบนกรอบ — `corner` คือลำดับใน floor_pts หรือ -1 สำหรับจุดที่เพิ่มบนเส้น */
interface Handle {
  framePoint: number
  corner: number
}

/** `gesture` = การเปลี่ยนนี้เป็นส่วนหนึ่งของการลากเดียวกัน ย้อนกลับครั้งเดียวได้ทั้งการลาก */
type Change = (change: Partial<FloorSettings>, gesture?: boolean) => void

interface PanelProps {
  draft: FloorSettings
  change: Change
  endGesture: () => void
}

function UndoGlyph() {
  return (
    <Glyph size={18} className="yd-inline-glyph">
      <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Glyph>
  )
}

function CalibrationPanel({ draft, change, endGesture }: PanelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<Handle | null>(null)
  const clipId = useId()
  const W = useYoloLive((s) => s.snapshot?.size[0] ?? 1280)
  const H = useYoloLive((s) => s.snapshot?.size[1] ?? 720)

  useLiveDraw(canvasRef, (canvas, live) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (live.frame) ctx.drawImage(live.frame, 0, 0, canvas.width, canvas.height)
  })

  const frame = frameOf(draft)
  const px = ([x, y]: Point): Point => [x * W, y * H]
  const [fw, fd] = draft.floor_size_m
  const quadValid = isConvexQuad(draft.floor_pts)
  const toImage = quadValid && sizeValid(draft.floor_size_m) ? homography([[0, 0], [fw, 0], [fw, fd], [0, fd]], draft.floor_pts) : null
  const box = toImage ? floorBox(draft) : null
  const zones = box ? draft.zones.map((zone) => zoneOnPicture(draft, zone, box)) : []
  const gridPath = toImage
    ? [
        ...Array.from({ length: Math.max(0, Math.ceil(fw) - 1) }, (_, i): [Point, Point] => [[i + 1, 0], [i + 1, fd]]),
        ...Array.from({ length: Math.max(0, Math.ceil(fd) - 1) }, (_, i): [Point, Point] => [[0, i + 1], [fw, i + 1]]),
      ]
        .map(([a, b]) => `M${px(project(toImage, a)).join(' ')}L${px(project(toImage, b)).join(' ')}`)
        .join('')
    : ''

  const pointIn = (rect: DOMRect, e: ReactPointerEvent): Point => [
    clamp01((e.clientX - rect.left) / rect.width),
    clamp01((e.clientY - rect.top) / rect.height),
  ]
  const moved = ({ framePoint, corner }: Handle, p: Point) => ({
    floor_pts: draft.floor_pts.map((q, i) => (i === corner ? p : q)),
    floor_area: draft.floor_area?.map((q, i) => (i === framePoint ? p : q)) ?? null,
  })
  const setCorner = (corner: number, p: Point) =>
    change(moved({ corner, framePoint: frame.findIndex((q) => samePlace(q, draft.floor_pts[corner])) }, p))

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const p = pointIn(rect, e)
    const aspect = W / H
    const point = nearestVertex(frame, p, aspect)
    const line = nearestEdge(frame, p, aspect)
    if (point.distance < Math.max(HANDLE_RADIUS, HANDLE_MIN_PX / rect.width)) {
      dragging.current = { framePoint: point.index, corner: draft.floor_pts.findIndex((q) => samePlace(q, frame[point.index])) }
    } else if (line.distance < Math.max(LINE_RADIUS, LINE_MIN_PX / rect.width)) {
      const at = line.index + 1
      change({ floor_area: [...frame.slice(0, at), p, ...frame.slice(at)] }, true)
      dragging.current = { framePoint: at, corner: -1 }
    } else return
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerUp = () => {
    dragging.current = null
    endGesture()
  }

  return (
    <section className="yd-panel" aria-labelledby="yd-cam-floor-title">
      <div className="yd-panel-head">
        <h2 id="yd-cam-floor-title">วางมุมพื้นห้อง (Calibrate พื้น)</h2>
      </div>
      <div className="yd-panel-body">
        <p className="yd-fine">
          <Phrases text="ลากจุดแดงทั้ง 4 ไปที่มุมของสี่เหลี่ยมบนพื้นจริง เส้นเหลืองคือตาราง 1 เมตร ใช้ตรวจว่าเส้นขนานกับแนวพื้นหรือไม่ คลิกหรือแตะบนเส้นกรอบเพื่อเพิ่มจุดลาก" />
        </p>
        <div className="yd-cam-stage" style={{ aspectRatio: `${W} / ${H}` }}>
          <canvas ref={canvasRef} width={W} height={H} aria-hidden="true" />
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <clipPath id={clipId}>
                <polygon points={toPoints(frame.map(px))} />
              </clipPath>
            </defs>
            {!quadValid && <polygon points={toPoints(frame.map(px))} fill={ON_PICTURE.invalidFill} />}
            {toImage && (
              <>
                <g clipPath={`url(#${clipId})`}>
                  {zones.map(
                    (zone, i) =>
                      zone && (
                        <polygon
                          key={draft.zones[i].name}
                          points={toPoints(zone.outline.map(px))}
                          fill={zoneColor(i, 0.18)}
                          stroke={zoneColor(i)}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      ),
                  )}
                </g>
                <path d={gridPath} stroke={ON_PICTURE.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
              </>
            )}
            <polygon
              points={toPoints(frame.map(px))}
              fill="none"
              stroke={quadValid ? ON_PICTURE.frame : ON_PICTURE.invalid}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* จุดและป้ายวาดเป็นพิกเซลจอ (ตำแหน่งเป็น % ของภาพ) จึงอ่านออกเท่ากันทั้งจอใหญ่และโทรศัพท์ */}
          <svg
            ref={svgRef}
            className="yd-cam-stage-input"
            role="img"
            aria-label="ภาพจากกล้องพร้อมจุดลากของกรอบพื้น"
            onPointerDown={onPointerDown}
            onPointerMove={(e) => {
              if (dragging.current) change(moved(dragging.current, pointIn(svgRef.current!.getBoundingClientRect(), e)), true)
            }}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {zones.map(
              (zone, i) =>
                zone && (
                  <text
                    key={draft.zones[i].name}
                    x={`${zone.centre[0] * 100}%`}
                    y={`${zone.centre[1] * 100}%`}
                    className="yd-cam-picture-text is-zone"
                    fill={zoneColor(i)}
                    stroke={ON_PICTURE.halo}
                  >
                    {draft.zones[i].name}
                  </text>
                ),
            )}
            {frame.map(([x, y], i) => (
              <circle key={i} cx={`${x * 100}%`} cy={`${y * 100}%`} r={7} fill={ON_PICTURE.point} stroke={ON_PICTURE.ring} strokeWidth={2} />
            ))}
            {draft.floor_pts.map(([x, y], i) => {
              const right = x > 0.5
              const top = y < 0.1
              const at = {
                x: `${x * 100}%`,
                y: `${y * 100}%`,
                dx: right ? -12 : 12,
                dy: top ? 22 : -10,
                textAnchor: right ? ('end' as const) : ('start' as const),
                fill: ON_PICTURE.label,
                stroke: ON_PICTURE.halo,
              }
              // ภาพแคบ (โทรศัพท์) ป้ายเต็มชนกัน จึงเหลือแค่เลขมุม ซึ่งตรงกับเลขหน้าชื่อช่องตัวเลขด้านล่าง
              return (
                <g key={i}>
                  <text {...at} className="yd-cam-picture-text is-corner is-long">{CORNERS[i]}</text>
                  <text {...at} className="yd-cam-picture-text is-corner is-short">{i + 1}</text>
                </g>
              )
            })}
          </svg>
        </div>
        {!quadValid && (
          <p className="yd-error" role="alert">
            จุดทั้ง 4 ต้องเป็นสี่เหลี่ยมที่ไม่ไขว้กัน เรียงตามลำดับ ไกล-ซ้าย, ไกล-ขวา, ใกล้-ขวา, ใกล้-ซ้าย
          </p>
        )}
        <div className="yd-cam-corners">
          {draft.floor_pts.map((p, i) => (
            <fieldset key={i} className="yd-cam-corner">
              <legend>{CORNERS[i]} (% ของภาพ)</legend>
              {(['แนวนอน', 'แนวตั้ง'] as const).map((axis, a) => (
                <label key={axis} className="yd-cam-field">
                  <span>{axis}</span>
                  <input
                    type="number"
                    className="yd-input"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Number((p[a] * 100).toFixed(1))}
                    onChange={(e) => {
                      const v = clamp01(Number(e.target.value) / 100)
                      setCorner(i, a === 0 ? [v, p[1]] : [p[0], v])
                    }}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="yd-cam-size">
          {(['กว้าง ซ้าย-ขวา (เมตร)', 'ลึก ไกล-ใกล้ (เมตร)'] as const).map((text, a) => (
            <label key={text} className="yd-cam-field">
              <span>{text}</span>
              <input
                type="number"
                className="yd-input"
                min={0.5}
                max={200}
                step={0.5}
                value={draft.floor_size_m[a]}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  change({ floor_size_m: a === 0 ? [v, draft.floor_size_m[1]] : [draft.floor_size_m[0], v] })
                }}
              />
            </label>
          ))}
        </div>
        {!sizeValid(draft.floor_size_m) && <p className="yd-error">ขนาดพื้นต้องมากกว่า 0 และไม่เกิน 200 เมตร</p>}
      </div>
    </section>
  )
}

type PlanGesture = { kind: 'divider'; divider: Divider; at: number } | { kind: 'zone'; name: string }

function ZonesPanel({ draft, change, endGesture }: PanelProps) {
  const plan = useRef<HTMLDivElement>(null)
  const gesture = useRef<PlanGesture | null>(null)
  const hatchId = useId()
  const [drop, setDrop] = useState<{ target: string; side: Side } | null>(null)
  const [activeLine, setActiveLine] = useState<{ divider: Divider; at: number } | null>(null)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ from: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const duplicate = nameTaken(draft.zones, trimmed)
  const newName = renaming?.text.trim() ?? ''
  const renameTaken = renaming !== null && nameTaken(draft.zones, newName, renaming.from)
  const valid = floorValid(draft)
  const box = valid ? floorBox(draft) : { x0: 0, y0: 0, x1: positive(draft.floor_size_m[0]), y1: positive(draft.floor_size_m[1]) }
  const ratio = (box.x1 - box.x0) / (box.y1 - box.y0)
  // ผังวาดด้วยหน่วยกว้างยาวเท่ากัน (x คูณ ratio) ลายแรเงาจึงไม่บิดตามสัดส่วนห้อง
  const onPlan = ([x, y]: Point): Point => [x * ratio, y]
  const frame = valid ? frameOnGrid(draft, box).map(onPlan) : []
  const lines = dividers(draft.zones)
  const target = drop && draft.zones.find((z) => z.name === drop.target)
  const dropBox = target && drop ? split(target.box, drop.side)?.placed : null
  const cellArea = ((box.x1 - box.x0) / GRID) * ((box.y1 - box.y0) / GRID)

  const startDrag = (e: ReactPointerEvent, next: PlanGesture) => {
    plan.current!.setPointerCapture(e.pointerId)
    gesture.current = next
    setError(null)
    if (next.kind === 'divider') setActiveLine({ divider: next.divider, at: next.at })
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const current = gesture.current
    if (!current) return
    const rect = plan.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * GRID
    const y = ((e.clientY - rect.top) / rect.height) * GRID
    if (current.kind === 'divider') {
      const { divider } = current
      const at = Math.min(divider.max, Math.max(divider.min, Math.round(divider.axis === 'x' ? x : y)))
      if (at === current.at) return
      current.at = at
      setActiveLine({ divider, at })
      change({ zones: moveDivider(draft.zones, divider, at) }, true)
    } else {
      const over = draft.zones.find((z) => x >= z.box[0] && x < z.box[2] && y >= z.box[1] && y < z.box[3])
      setDrop(over && over.name !== current.name ? { target: over.name, side: nearestSide(over.box, [x, y]) } : null)
    }
  }
  const finishDrag = (commit: boolean) => {
    const current = gesture.current
    if (commit && current?.kind === 'zone' && drop) {
      const zones = moveZone(draft.zones, current.name, drop.target, drop.side)
      if (zones) change({ zones })
      else setError(`โซน ${drop.target} แคบเกินไป แบ่งต่อไม่ได้`)
    }
    gesture.current = null
    setDrop(null)
    setActiveLine(null)
    endGesture()
  }

  const onDividerKey = (e: KeyboardEvent, divider: Divider) => {
    const keys: Record<string, number> = divider.axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 }
    const step = keys[e.key]
    if (!step) return
    e.preventDefault()
    change({ zones: moveDivider(draft.zones, divider, divider.at + step) })
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    const zones = addZone(draft.zones, trimmed)
    if (!zones) {
      setError('โซนที่ใหญ่ที่สุดแคบเกินไป แบ่งเพิ่มไม่ได้')
      return
    }
    setError(null)
    change({ zones })
    setName('')
  }

  const rename = (e: FormEvent) => {
    e.preventDefault()
    if (!renaming || !newName || renameTaken) return
    if (newName !== renaming.from) change({ zones: renameZone(draft.zones, renaming.from, newName) })
    setRenaming(null)
  }

  return (
    <section className="yd-panel yd-cam-zones" aria-labelledby="yd-cam-zones-title">
      <div className="yd-panel-head">
        <h2 id="yd-cam-zones-title">โซน</h2>
      </div>
      <div className="yd-panel-body">
        <p className="yd-fine">
          <Phrases text="โซนแบ่งเต็มพื้นเสมอ ลากเส้นแบ่งเพื่อปรับสัดส่วน ลากโซนไปวางบนอีกโซนเพื่อย้าย ส่วนที่แรเงาอยู่นอกกรอบพื้น" />
        </p>
        <div className="yd-cam-zones-body">
          <div
            ref={plan}
            className="yd-cam-plan"
            style={{ width: `min(100%, calc(${PLAN_MAX_HEIGHT_PX}px * ${ratio}))`, aspectRatio: String(ratio) }}
            onPointerMove={onPointerMove}
            onPointerUp={() => finishDrag(true)}
            onPointerCancel={() => finishDrag(false)}
          >
            <svg aria-hidden="true" className="yd-cam-plan-svg" viewBox={`0 0 ${GRID * ratio} ${GRID}`} preserveAspectRatio="none">
              <defs>
                <pattern id={hatchId} patternUnits="userSpaceOnUse" width={HATCH} height={HATCH} patternTransform="rotate(45)">
                  <line x1={0} y1={0} x2={0} y2={HATCH} stroke="currentColor" strokeWidth={HATCH / 4} />
                </pattern>
              </defs>
              <g className="yd-cam-plan-grid">
                {Array.from({ length: GRID - 1 }, (_, i) => i + 1).map((i) => (
                  <g key={i} className={i % 2 ? 'is-minor' : undefined}>
                    <line x1={i * ratio} y1={0} x2={i * ratio} y2={GRID} vectorEffect="non-scaling-stroke" />
                    <line x1={0} y1={i} x2={GRID * ratio} y2={i} vectorEffect="non-scaling-stroke" />
                  </g>
                ))}
              </g>
              {frame.length >= 3 && (
                <>
                  <path
                    d={`M0 0H${GRID * ratio}V${GRID}H0Z M${frame.map((p) => p.join(' ')).join('L')}Z`}
                    fill={`url(#${hatchId})`}
                    fillRule="evenodd"
                  />
                  <polygon
                    points={toPoints(frame)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
            {draft.zones.map((zone) => {
              const [x0, y0, x1, y1] = zone.box
              return (
                <div
                  key={zone.name}
                  className="yd-cam-plan-zone"
                  style={{ left: percent(x0), top: percent(y0), width: percent(x1 - x0), height: percent(y1 - y0) }}
                  onPointerDown={(e) => startDrag(e, { kind: 'zone', name: zone.name })}
                >
                  <span>{zone.name}</span>
                </div>
              )
            })}
            {dropBox && (
              <div
                className="yd-cam-plan-drop"
                style={{
                  left: percent(dropBox[0]),
                  top: percent(dropBox[1]),
                  width: percent(dropBox[2] - dropBox[0]),
                  height: percent(dropBox[3] - dropBox[1]),
                }}
              />
            )}
            {lines.map((line) => {
              const vertical = line.axis === 'x'
              return (
                <div
                  key={`${line.axis}:${line.before.join()}:${line.after.join()}`}
                  role="separator"
                  tabIndex={0}
                  aria-orientation={vertical ? 'vertical' : 'horizontal'}
                  aria-label={`เส้นแบ่ง ${line.before.join(', ')} กับ ${line.after.join(', ')}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sharePercent(line, line.at)}
                  className={`yd-cam-plan-divider ${vertical ? 'is-vertical' : 'is-horizontal'}`}
                  style={
                    vertical
                      ? { left: percent(line.at), top: percent(line.from), height: percent(line.to - line.from) }
                      : { top: percent(line.at), left: percent(line.from), width: percent(line.to - line.from) }
                  }
                  onPointerDown={(e) => startDrag(e, { kind: 'divider', divider: line, at: line.at })}
                  onKeyDown={(e) => onDividerKey(e, line)}
                />
              )
            })}
            {activeLine && (
              <span
                className="yd-cam-plan-share"
                style={
                  activeLine.divider.axis === 'x'
                    ? { left: percent(activeLine.at), top: percent((activeLine.divider.from + activeLine.divider.to) / 2) }
                    : { top: percent(activeLine.at), left: percent((activeLine.divider.from + activeLine.divider.to) / 2) }
                }
              >
                {sharePercent(activeLine.divider, activeLine.at)} / {100 - sharePercent(activeLine.divider, activeLine.at)}
              </span>
            )}
          </div>

          <div className="yd-cam-zones-side">
            <form className="yd-cam-add" onSubmit={add}>
              <label className="yd-cam-field">
                <span>ชื่อโซน</span>
                <input className="yd-input" value={name} placeholder="เช่น โต๊ะทำงาน" onChange={(e) => setName(e.target.value)} />
              </label>
              <button type="submit" className="yd-btn-line" disabled={!trimmed || duplicate}>
                + เพิ่มโซน
              </button>
            </form>
            {duplicate && <p className="yd-error">มีโซนชื่อนี้แล้ว</p>}
            {error && <p className="yd-error">{error}</p>}

            <ul className="yd-cam-zone-list">
              {draft.zones.map(({ name: zoneName, box: [x0, y0, x1, y1] }) => (
                <li key={zoneName}>
                  {renaming?.from === zoneName ? (
                    <form className="yd-cam-rename" onSubmit={rename}>
                      <label className="yd-cam-field">
                        <span>ชื่อใหม่ของโซน {zoneName}</span>
                        <input
                          className="yd-input"
                          value={renaming.text}
                          autoFocus
                          onChange={(e) => setRenaming({ from: zoneName, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setRenaming(null)
                          }}
                        />
                      </label>
                      <button type="submit" className="yd-btn is-small" disabled={!newName || renameTaken}>
                        ตกลง
                      </button>
                      <button type="button" className="yd-btn-line is-small" onClick={() => setRenaming(null)}>
                        ยกเลิก
                      </button>
                      {renameTaken && <p className="yd-error">มีโซนชื่อนี้แล้ว</p>}
                    </form>
                  ) : (
                    <>
                      <span className="yd-cam-zone-name">{zoneName}</span>
                      <span className="yd-cam-zone-area">{((x1 - x0) * (y1 - y0) * cellArea).toFixed(1)} ม²</span>
                      <button
                        type="button"
                        className="yd-btn-line is-small"
                        aria-label={`เปลี่ยนชื่อโซน ${zoneName}`}
                        onClick={() => setRenaming({ from: zoneName, text: zoneName })}
                      >
                        เปลี่ยนชื่อ
                      </button>
                      <button
                        type="button"
                        className="yd-btn-line is-small"
                        aria-label={`ลบโซน ${zoneName}`}
                        disabled={draft.zones.length === 1}
                        onClick={() => {
                          const zones = removeZone(draft.zones, zoneName)
                          if (zones) change({ zones })
                        }}
                      >
                        ลบ
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function FloorEditor({ saved, defaults }: { saved: FloorSettings; defaults: FloorSettings }) {
  const [state, dispatch] = useReducer(floorEdit, saved, startFloorEdit)
  const draft = draftOf(state)
  const change: Change = (next, gesture = false) => dispatch({ type: 'change', change: next, gesture })
  const endGesture = () => dispatch({ type: 'endGesture' })
  const dirty = isDirty(state)
  const valid = floorValid(draft)
  const { saving, message } = state

  const save = async () => {
    dispatch({ type: 'save' })
    try {
      dispatch({ type: 'saved', settings: await yoloService.putSettings(draft) })
    } catch (err) {
      dispatch({ type: 'saveFailed', text: errorText(err) })
    }
  }

  return (
    <>
      <CalibrationPanel draft={draft} change={change} endGesture={endGesture} />
      <ZonesPanel draft={draft} change={change} endGesture={endGesture} />
      <div className="yd-cam-savebar" role="group" aria-label="บันทึกพื้นและโซน">
        <button type="button" className="yd-btn" disabled={!dirty || saving || !valid} onClick={() => void save()}>
          บันทึก
        </button>
        <button type="button" className="yd-btn-line" disabled={!dirty || saving} onClick={() => dispatch({ type: 'discard' })}>
          ยกเลิกการแก้ไข
        </button>
        <button type="button" className="yd-btn-line" disabled={!canUndo(state) || saving} onClick={() => dispatch({ type: 'undo' })}>
          <UndoGlyph />
          ย้อนกลับ
        </button>
        <button
          type="button"
          className="yd-btn-line"
          disabled={saving}
          onClick={() => change({ floor_pts: defaults.floor_pts, floor_area: null })}
        >
          รีเซ็ตกรอบ
        </button>
        <p className="yd-cam-bar-note" role="status">
          {dirty && !message && <span>ยังไม่ได้บันทึก</span>}
          {message && <span className={message.ok ? 'yd-cam-ok' : 'yd-error'}>{message.text}</span>}
          {dirty && !valid && <span className="yd-error">กรอบพื้นหรือขนาดพื้นยังไม่ถูกต้อง จึงบันทึกไม่ได้</span>}
        </p>
      </div>
    </>
  )
}

type FloorLoad = { kind: 'loading' } | { kind: 'failed'; error: string } | { kind: 'ready'; saved: FloorSettings; defaults: FloorSettings }

/** โหลดพื้นและโซนที่บันทึกไว้กับค่าเริ่มต้นจาก yolo-backend แล้วเปิดตัวแก้ */
export default function CameraFloor() {
  const [load, setLoad] = useState<FloorLoad>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([yoloService.getSettings(), yoloService.getDefaultSettings()])
      .then(([saved, defaults]) => alive && setLoad({ kind: 'ready', saved, defaults }))
      .catch((err: unknown) => alive && setLoad({ kind: 'failed', error: errorText(err) }))
    return () => {
      alive = false
    }
  }, [attempt])

  if (load.kind === 'ready') return <FloorEditor saved={load.saved} defaults={load.defaults} />
  return (
    <section className="yd-panel" aria-label="พื้นและโซน">
      <div className="yd-panel-body">
        {load.kind === 'loading' ? (
          <p className="yd-empty">กำลังโหลดการตั้งค่า...</p>
        ) : (
          <>
            <p className="yd-error">{load.error}</p>
            <button
              type="button"
              className="yd-btn-line yd-cam-retry"
              onClick={() => {
                setLoad({ kind: 'loading' })
                setAttempt((n) => n + 1)
              }}
            >
              ลองใหม่
            </button>
          </>
        )}
      </div>
    </section>
  )
}
