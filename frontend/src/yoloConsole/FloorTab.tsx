// หน้า Floor & Zones — พอร์ตพฤติกรรมจากต้นแบบ Cam-Well-YoLo-ByteTrack/frontend/src/routes/SettingsPage.tsx
// กรอบพื้น = floor_area ?? floor_pts: 4 มุมของ floor_pts ตรึงระนาบพื้น ส่วนจุดที่เพิ่มบนเส้นกรอบขยายพื้นที่ออกไป
// ตารางโซนขึงเต็มกรอบนั้น (floorBox = FloorSettings.extents ฝั่ง backend)
import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { floorBox, frameOf, frameOnGrid, nearestEdge, nearestVertex, zoneOnPicture } from './floorCalibration'
import { homography, isConvexQuad, project } from './homography'
import { useLiveDraw, useYoloLive } from './useYoloLive'
import { yoloService } from './yoloService'
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
} from './zoneLayout'
import type { FloorSettings, Point } from './types'

const CORNERS = ['1 ไกล-ซ้าย', '2 ไกล-ขวา', '3 ใกล้-ขวา', '4 ใกล้-ซ้าย']
const ZONE_COLORS = ['40 210 200', '255 170 60', '230 120 220', '120 220 110', '120 140 255']
const HANDLE_RADIUS = 0.03 // ของความกว้างภาพ
const LINE_RADIUS = 0.012 // ของความกว้างภาพ
const PLAN_MAX_HEIGHT_PX = 360
const TEAL = 'rgb(40,210,200)'

const zoneColor = (i: number, alpha = 1) => `rgb(${ZONE_COLORS[i % ZONE_COLORS.length]} / ${alpha})`
const percent = (cells: number) => `${(cells / GRID) * 100}%`
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const samePlace = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1]
const sizeValid = (size: Point) => size.every((v) => v > 0 && v <= 200)
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const toPoints = (pts: Point[]) => pts.map((p) => p.join(',')).join(' ')

/** จุดหนึ่งบนกรอบ — `corner` คือลำดับใน floor_pts หรือ -1 สำหรับจุดที่เพิ่มบนเส้น */
interface Handle {
  framePoint: number
  corner: number
}

/** `gesture` = การเปลี่ยนนี้เป็นส่วนหนึ่งของการลากเดียวกัน ย้อนกลับครั้งเดียวได้ทั้งการลาก */
type Update = (change: Partial<FloorSettings>, gesture?: boolean) => void

interface CardProps {
  draft: FloorSettings
  update: Update
  endGesture: () => void
}

function CalibrationCard({ draft, update, endGesture }: CardProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<Handle | null>(null)
  const clipId = useId()
  const hasFrame = useYoloLive((s) => s.frame !== null)
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
  const unit = H / 720
  const [fw, fd] = draft.floor_size_m
  const valid = isConvexQuad(draft.floor_pts)
  const toImage = valid && sizeValid(draft.floor_size_m) ? homography([[0, 0], [fw, 0], [fw, fd], [0, fd]], draft.floor_pts) : null
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

  const pointAt = (e: ReactPointerEvent): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]
  }
  const moved = ({ framePoint, corner }: Handle, p: Point) => ({
    floor_pts: draft.floor_pts.map((q, i) => (i === corner ? p : q)),
    floor_area: draft.floor_area?.map((q, i) => (i === framePoint ? p : q)) ?? null,
  })
  const setCorner = (corner: number, p: Point) =>
    update(moved({ corner, framePoint: frame.findIndex((q) => samePlace(q, draft.floor_pts[corner])) }, p))

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = pointAt(e)
    const aspect = W / H
    const point = nearestVertex(frame, p, aspect)
    const line = nearestEdge(frame, p, aspect)
    if (point.distance < HANDLE_RADIUS) {
      dragging.current = { framePoint: point.index, corner: draft.floor_pts.findIndex((q) => samePlace(q, frame[point.index])) }
    } else if (line.distance < LINE_RADIUS) {
      const at = line.index + 1
      update({ floor_area: [...frame.slice(0, at), p, ...frame.slice(at)] }, true)
      dragging.current = { framePoint: at, corner: -1 }
    } else return
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerUp = () => {
    dragging.current = null
    endGesture()
  }

  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head dc-col yc-stack-head">
        <h2 className="dc-h2">Calibrate พื้น</h2>
        <span className="dc-muted-12">
          ลากจุดแดงทั้ง 4 ไปที่มุมของสี่เหลี่ยมบนพื้นจริง เส้นเหลืองคือตาราง 1 เมตร ใช้ตรวจว่าเส้นขนานกับแนวพื้นหรือไม่ ·
          คลิกบนเส้นกรอบเพื่อเพิ่มจุดลาก
        </span>
      </div>
      {!hasFrame && <p className="dc-muted-12 yc-note">ยังไม่มีภาพ — เปิดแหล่งภาพจากหน้า Live ก่อน จึงจะเห็นพื้นจริงตอนลากจุด</p>}
      <div className="yc-stage yc-calib" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} aria-hidden="true" />
        <svg
          ref={svgRef}
          className="yc-calib-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="ภาพจากกล้องพร้อมจุดลากของกรอบพื้น"
          onPointerDown={onPointerDown}
          onPointerMove={(e) => {
            if (dragging.current) update(moved(dragging.current, pointAt(e)), true)
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <clipPath id={clipId}>
              <polygon points={toPoints(frame.map(px))} />
            </clipPath>
          </defs>
          {!valid && <polygon points={toPoints(frame.map(px))} fill="rgba(255,60,60,0.2)" />}
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
                        strokeWidth={2 * unit}
                      />
                    ),
                )}
              </g>
              <path d={gridPath} stroke="rgba(255,255,0,0.45)" strokeWidth={unit} fill="none" />
              {zones.map(
                (zone, i) =>
                  zone && (
                    <text
                      key={draft.zones[i].name}
                      x={px(zone.centre)[0]}
                      y={px(zone.centre)[1]}
                      className="yc-calib-zone"
                      fill={zoneColor(i)}
                      fontSize={16 * unit}
                    >
                      {draft.zones[i].name}
                    </text>
                  ),
              )}
            </>
          )}
          <polygon points={toPoints(frame.map(px))} fill="none" stroke={valid ? TEAL : 'rgb(255,80,80)'} strokeWidth={2 * unit} />
          {frame.map((p, i) => {
            const [x, y] = px(p)
            return <circle key={i} cx={x} cy={y} r={9 * unit} className="yc-calib-point" strokeWidth={2 * unit} />
          })}
          {draft.floor_pts.map((p, i) => {
            const [x, y] = px(p)
            const right = x > W - 170 * unit
            return (
              <text
                key={i}
                x={x + (right ? -14 : 14) * unit}
                y={y - 12 * unit}
                textAnchor={right ? 'end' : 'start'}
                fontSize={18 * unit}
                className="yc-calib-corner"
              >
                {CORNERS[i]}
              </text>
            )
          })}
        </svg>
      </div>
      {!valid && (
        <p className="yc-error" role="alert">
          จุดทั้ง 4 ต้องเป็นสี่เหลี่ยมที่ไม่ไขว้กัน เรียงตามลำดับ ไกล-ซ้าย, ไกล-ขวา, ใกล้-ขวา, ใกล้-ซ้าย
        </p>
      )}
      <div className="yc-corner-grid">
        {draft.floor_pts.map((p, i) => (
          <fieldset key={i} className="yc-corner">
            <legend className="dc-muted-12">{CORNERS[i]} (% ของภาพ)</legend>
            {(['x', 'y'] as const).map((axis, a) => (
              <input
                key={axis}
                type="number"
                className="yc-input"
                min={0}
                max={100}
                step={0.1}
                aria-label={`${CORNERS[i]} ${axis}`}
                value={Number((p[a] * 100).toFixed(1))}
                onChange={(e) => {
                  const v = clamp01(Number(e.target.value) / 100)
                  setCorner(i, a === 0 ? [v, p[1]] : [p[0], v])
                }}
              />
            ))}
          </fieldset>
        ))}
      </div>
      <div className="yc-row">
        {(['กว้าง ซ้าย-ขวา (เมตร)', 'ลึก ไกล-ใกล้ (เมตร)'] as const).map((text, a) => (
          <label key={text} className="yc-field">
            <span className="dc-muted-12">{text}</span>
            <input
              type="number"
              className="yc-input yc-narrow"
              min={0.5}
              max={200}
              step={0.5}
              value={draft.floor_size_m[a]}
              onChange={(e) => {
                const v = Number(e.target.value)
                update({ floor_size_m: a === 0 ? [v, draft.floor_size_m[1]] : [draft.floor_size_m[0], v] })
              }}
            />
          </label>
        ))}
      </div>
      {!sizeValid(draft.floor_size_m) && <p className="yc-error">ขนาดพื้นต้องมากกว่า 0 และไม่เกิน 200 เมตร</p>}
    </div>
  )
}

type PlanGesture = { kind: 'divider'; divider: Divider; at: number } | { kind: 'zone'; name: string }

function ZonesCard({ draft, update, endGesture }: CardProps) {
  const plan = useRef<HTMLDivElement>(null)
  const gesture = useRef<PlanGesture | null>(null)
  const [drop, setDrop] = useState<{ target: string; side: Side } | null>(null)
  const [activeLine, setActiveLine] = useState<{ divider: Divider; at: number } | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const duplicate = draft.zones.some((z) => z.name === trimmed)
  const valid = isConvexQuad(draft.floor_pts) && sizeValid(draft.floor_size_m)
  const box = valid ? floorBox(draft) : { x0: 0, y0: 0, x1: draft.floor_size_m[0] || 1, y1: draft.floor_size_m[1] || 1 }
  const ratio = (box.x1 - box.x0) / (box.y1 - box.y0)
  const frame = valid ? frameOnGrid(draft, box) : []
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
      update({ zones: moveDivider(draft.zones, divider, at) }, true)
    } else {
      const over = draft.zones.find((z) => x >= z.box[0] && x < z.box[2] && y >= z.box[1] && y < z.box[3])
      setDrop(over && over.name !== current.name ? { target: over.name, side: nearestSide(over.box, [x, y]) } : null)
    }
  }
  const finishDrag = (commit: boolean) => {
    const current = gesture.current
    if (commit && current?.kind === 'zone' && drop) {
      const zones = moveZone(draft.zones, current.name, drop.target, drop.side)
      if (zones) update({ zones })
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
    update({ zones: moveDivider(draft.zones, divider, divider.at + step) })
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    const zones = addZone(draft.zones, trimmed)
    if (!zones) {
      setError('โซนที่ใหญ่ที่สุดแคบเกินไป แบ่งเพิ่มไม่ได้')
      return
    }
    setError(null)
    update({ zones })
    setName('')
  }

  return (
    <div className="dc-card dc-pad yc-zones-card">
      <div className="dc-card-head dc-col yc-stack-head">
        <h2 className="dc-h2">โซน</h2>
        <span className="dc-muted-12">
          โซนแบ่งเต็มพื้นเสมอ ลากเส้นแบ่งเพื่อปรับสัดส่วน ลากโซนไปวางบนอีกโซนเพื่อย้าย ส่วนมืดอยู่นอกกรอบ
        </span>
      </div>
      <div className="yc-zones-body">
        <div
          ref={plan}
          className="yc-plan"
          style={{ width: `min(100%, calc(${PLAN_MAX_HEIGHT_PX}px * ${ratio}))`, aspectRatio: String(ratio) }}
          onPointerMove={onPointerMove}
          onPointerUp={() => finishDrag(true)}
          onPointerCancel={() => finishDrag(false)}
        >
          {draft.zones.map((zone, i) => {
            const [x0, y0, x1, y1] = zone.box
            return (
              <div
                key={zone.name}
                className="yc-plan-zone"
                style={{
                  left: percent(x0),
                  top: percent(y0),
                  width: percent(x1 - x0),
                  height: percent(y1 - y0),
                  background: zoneColor(i, 0.25),
                  color: zoneColor(i),
                }}
                onPointerDown={(e) => startDrag(e, { kind: 'zone', name: zone.name })}
              >
                {zone.name}
              </div>
            )
          })}
          <svg aria-hidden className="yc-plan-svg" viewBox={`0 0 ${GRID} ${GRID}`} preserveAspectRatio="none">
            {Array.from({ length: GRID - 1 }, (_, i) => i + 1).map((i) => (
              <g key={i} stroke="currentColor" strokeOpacity={i % 2 ? 0.08 : 0.2}>
                <line x1={i} y1={0} x2={i} y2={GRID} vectorEffect="non-scaling-stroke" />
                <line x1={0} y1={i} x2={GRID} y2={i} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {frame.length >= 3 && (
              <>
                <path
                  d={`M0 0H${GRID}V${GRID}H0Z M${frame.map((p) => p.join(' ')).join('L')}Z`}
                  fill="rgb(0 0 0 / 0.6)"
                  fillRule="evenodd"
                />
                <polygon points={toPoints(frame)} fill="none" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
          {dropBox && (
            <div
              className="yc-plan-drop"
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
                className={`yc-plan-divider ${vertical ? 'is-vertical' : 'is-horizontal'}`}
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
              className="yc-plan-share"
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

        <div className="yc-zones-side">
          <form className="yc-row" onSubmit={add}>
            <label className="yc-label" htmlFor="yc-zone-name">ชื่อโซน</label>
            <input
              id="yc-zone-name"
              className="yc-input yc-grow"
              value={name}
              placeholder="เช่น โต๊ะทำงาน"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="dc-btn" disabled={!trimmed || duplicate}>
              + เพิ่มโซน
            </button>
          </form>
          {duplicate && <p className="yc-error">มีโซนชื่อนี้แล้ว</p>}
          {error && <p className="yc-error">{error}</p>}

          <ul className="yc-zone-list">
            {draft.zones.map(({ name: zoneName, box: [x0, y0, x1, y1] }, i) => (
              <li key={zoneName}>
                <i className="yc-zone-dot" style={{ background: zoneColor(i) }} />
                <span className="dc-w500">{zoneName}</span>
                <span className="dc-muted-12">{((x1 - x0) * (y1 - y0) * cellArea).toFixed(1)} ม²</span>
                <button
                  type="button"
                  className="dc-link-danger yc-zone-remove"
                  aria-label={`ลบโซน ${zoneName}`}
                  disabled={draft.zones.length === 1}
                  onClick={() => {
                    const zones = removeZone(draft.zones, zoneName)
                    if (zones) update({ zones })
                  }}
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function FloorTab() {
  const [saved, setSaved] = useState<FloorSettings | null>(null)
  const [defaults, setDefaults] = useState<FloorSettings | null>(null)
  const [edited, setEdited] = useState<FloorSettings | null>(null)
  const [history, setHistory] = useState<FloorSettings[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const inGesture = useRef(false)
  const kind = useYoloLive((s) => s.status.source?.kind)

  useEffect(() => {
    let alive = true
    Promise.all([yoloService.getSettings(), yoloService.getDefaultSettings()])
      .then(([current, base]) => {
        if (!alive) return
        setSaved(current)
        setDefaults(base)
      })
      .catch((err: unknown) => alive && setLoadError(errorText(err)))
    return () => {
      alive = false
    }
  }, [attempt])

  const draft = edited ?? saved
  if (!draft) {
    return (
      <div className="dc-card dc-empty-pad">
        <p className="dc-empty">{loadError ?? 'กำลังโหลดการตั้งค่า...'}</p>
        {loadError && (
          <button
            type="button"
            className="dc-btn yc-note"
            onClick={() => {
              setLoadError(null)
              setAttempt((n) => n + 1)
            }}
          >
            ลองใหม่
          </button>
        )}
      </div>
    )
  }

  const update: Update = (change, gesture = false) => {
    if (!inGesture.current) setHistory((h) => [...h, draft])
    inGesture.current = gesture
    setEdited({ ...draft, ...change })
    setMessage(null)
  }
  const endGesture = () => {
    inGesture.current = false
  }
  const dirty = edited !== null
  const valid = isConvexQuad(draft.floor_pts) && sizeValid(draft.floor_size_m)

  const save = async () => {
    setSaving(true)
    try {
      const result = await yoloService.putSettings(draft)
      setSaved(result)
      setEdited(null)
      setHistory([])
      setMessage({ ok: true, text: 'บันทึกแล้ว มีผลกับแหล่งภาพที่เปิดอยู่ทันที' })
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dc-stack">
      {kind === 'sim' && (
        <p className="dc-warn-note" role="status">
          Simulator ใช้พื้นและโซนของตัวเอง การตั้งค่าในหน้านี้มีผลกับวิดีโอ รูปภาพ กล้อง และ go2rtc เท่านั้น
        </p>
      )}
      <div className="yc-floor-grid">
        <CalibrationCard draft={draft} update={update} endGesture={endGesture} />
        <ZonesCard draft={draft} update={update} endGesture={endGesture} />
      </div>
      <div className="dc-card dc-pad yc-savebar">
        <button type="button" className="dc-btn yc-btn-primary" disabled={!dirty || saving || !valid} onClick={() => void save()}>
          บันทึก
        </button>
        <button
          type="button"
          className="dc-btn"
          disabled={!dirty || saving}
          onClick={() => {
            setEdited(null)
            setHistory([])
            setMessage(null)
          }}
        >
          ยกเลิกการแก้ไข
        </button>
        <button
          type="button"
          className="dc-btn"
          disabled={!history.length || saving}
          onClick={() => {
            setEdited(history[history.length - 1])
            setHistory((h) => h.slice(0, -1))
          }}
        >
          ↶ ย้อนกลับ
        </button>
        <button
          type="button"
          className="dc-btn"
          disabled={!defaults || saving}
          onClick={() => defaults && update({ floor_pts: defaults.floor_pts, floor_area: null })}
        >
          รีเซ็ตกรอบ
        </button>
        {dirty && !message && <span className="dc-muted-12">ยังไม่ได้บันทึก</span>}
        {message && <span className={message.ok ? 'yc-ok' : 'yc-error'}>{message.text}</span>}
      </div>
    </div>
  )
}
