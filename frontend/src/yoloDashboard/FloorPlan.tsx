import { useMemo, type CSSProperties } from 'react'
import { PERSON_MARKERS, type PersonMarker } from '../yoloConsole/drawLive'
import type { FloorPlan as Floor, Heat, LiveObject } from '../yoloConsole/types'
import { useYoloLive } from '../yoloConsole/useYoloLive'
import { ZzMark } from './marks'
import { countLevel, hasFatigue, isAlerting, personWhat, todayCountOf, type RoomPerson } from './roomPeople'
import { PrintedCheckbox, Segment } from './ui'
import { usePersistentState } from './usePersistentState'

// ผังพื้นห้องจริงเป็นเมตรจาก yolo-backend (ชุดเดียวกับการ์ด Floor plan ของ console) วาดเป็นลายเส้นหมึกแบบผังของ /?dashboard

/** ด้านที่ยาวกว่าของพื้นห้องยาวเท่านี้ในหน่วยผัง — ขนาดเส้นและเครื่องหมายคนจึงเท่ากับผังของ /?dashboard ทุกขนาดห้อง */
const PLAN = 400
/** ขอบรอบพื้นห้อง ให้วงแดงของคนที่ยืนชิดผนังไม่ถูกตัด */
const PAD = 18
const EMPTY_FLOOR = { w: 8, d: 6 }
const GRID_STEPS_M = [1, 2, 5, 10, 25, 50]
const TAG_GAP = 16

interface PlanView {
  objects: boolean
  marker: PersonMarker
  heat: boolean
}

const VIEW_KEY = 'camwell:yolo-dashboard:plan-view:v1'
const DEFAULT_VIEW: PlanView = { objects: true, marker: 'dot', heat: false }
const MARKER_OPTIONS = Object.entries(PERSON_MARKERS) as [PersonMarker, string][]

const isPlanView = (value: unknown): value is PlanView => {
  const v = value as Partial<PlanView> | null
  return typeof v?.objects === 'boolean' && typeof v.heat === 'boolean' && typeof v.marker === 'string' && Object.hasOwn(PERSON_MARKERS, v.marker)
}

interface Frame {
  unit: number
  width: number
  height: number
  x: (m: number) => number
  y: (m: number) => number
}

function planFrame(w: number, d: number): Frame {
  const unit = PLAN / Math.max(w, d)
  return { unit, width: w * unit + PAD * 2, height: d * unit + PAD * 2, x: (m) => PAD + m * unit, y: (m) => PAD + m * unit }
}

function Grid({ w, d, frame }: { w: number; d: number; frame: Frame }) {
  const step = GRID_STEPS_M.find((s) => s * frame.unit >= 12) ?? 50
  const lines = []
  for (let m = step; m < w; m += step) lines.push(<line key={`x${m}`} x1={frame.x(m)} y1={frame.y(0)} x2={frame.x(m)} y2={frame.y(d)} />)
  for (let m = step; m < d; m += step) lines.push(<line key={`y${m}`} x1={frame.x(0)} y1={frame.y(m)} x2={frame.x(w)} y2={frame.y(m)} />)
  return <g className="yd-plan-grid">{lines}</g>
}

/** ความหนาแน่น: ช่องหมึกโปร่ง ยิ่งมีคนอยู่นานยิ่งเข้ม */
function HeatCells({ heat, w, d, frame }: { heat: Heat; w: number; d: number; frame: Frame }) {
  const cw = (w * frame.unit) / heat.w
  const ch = (d * frame.unit) / heat.h
  const cells = []
  for (let j = 0; j < heat.h; j++) {
    for (let i = 0; i < heat.w; i++) {
      const v = heat.data[j * heat.w + i] / 255
      if (v <= 0.02) continue
      cells.push(
        <rect key={j * heat.w + i} x={frame.x(0) + i * cw} y={frame.y(0) + j * ch} width={cw + 0.4} height={ch + 0.4} fillOpacity={(0.06 + v * 0.5).toFixed(2)} />,
      )
    }
  }
  return <g className="yd-overview-heat">{cells}</g>
}

function Zones({ floor, frame }: { floor: Floor; frame: Frame }) {
  return (
    <g>
      {Object.entries(floor.zones).map(([name, poly]) => (
        <polygon key={name} className="yd-overview-zone" points={poly.map(([x, y]) => `${frame.x(x)},${frame.y(y)}`).join(' ')} />
      ))}
    </g>
  )
}

/** ชื่อโซนที่มุมซ้ายบนของโซน เป็น HTML ขนาดคงที่ — ตัวอักษรใน SVG เล็กจนอ่านไม่ออกเมื่อผังถูกย่อบนจอแคบ */
function ZoneNames({ floor, frame }: { floor: Floor; frame: Frame }) {
  return Object.entries(floor.zones).map(([name, poly]) => (
    <span
      key={name}
      className="yd-overview-zone-name"
      style={{
        left: `${(frame.x(Math.min(...poly.map((p) => p[0]))) / frame.width) * 100}%`,
        top: `${(frame.y(Math.min(...poly.map((p) => p[1]))) / frame.height) * 100}%`,
      }}
    >
      {name}
    </span>
  ))
}

function ObjectMark({ object: o, frame }: { object: LiveObject; frame: Frame }) {
  const cx = frame.x(o.floor[0])
  const cy = frame.y(o.floor[1])
  if (o.cls === 'chair') return <rect className={`yd-plan-chair${o.occupied ? ' yd-overview-chair is-occupied' : ''}`} x={cx - 10} y={cy - 10} width="20" height="20" />
  if (o.cls === 'table') return <rect className="yd-plan-desk" x={cx - 22} y={cy - 14} width="44" height="28" />
  if (o.cls === 'monitor') return <rect className="yd-plan-screen" x={cx - 14} y={cy - 2.5} width="28" height="5" />
  return (
    <g>
      <rect className="yd-plan-keys" x={cx - 11} y={cy - 7} width="22" height="14" />
      <rect className="yd-plan-screen" x={cx - 11} y={cy - 7} width="22" height="3" />
    </g>
  )
}

/** วงปากกาแดงรอบคนที่มีการเตือนค้าง — เส้นเดียวกับ OfficeRoom ของ /?dashboard */
function Ring() {
  return (
    <path
      className="yd-plan-ring"
      pathLength={1}
      transform="translate(-22 -22) scale(1.1)"
      d="M22.5 4.2c8.6.6 14.2 6.4 13.4 14.6-.8 8.6-8.4 15.4-17.2 14.8C10 33 4.6 27 5.4 19.2 6.2 10.8 12.6 4.4 21 3.9c1.6 0 3 .3 4.4.8"
    />
  )
}

function PersonMark({ person, marker }: { person: RoomPerson; marker: PersonMarker }) {
  return (
    <>
      {marker === 'id' ? (
        <>
          <circle className="yd-overview-id" r="11" />
          <text className="yd-overview-id-text" y="0.5">{person.id}</text>
        </>
      ) : (
        <>
          <ellipse className="yd-plan-shoulders" cy="2.5" rx="13" ry="7.5" />
          <circle className="yd-plan-head" cy="-1" r="6.5" />
        </>
      )}
      {isAlerting(person) && <Ring />}
    </>
  )
}

/** ป้ายชื่อชิดขอบไหนก็ไม่ล้นผัง: ใกล้ผนังซ้าย/ขวาเลื่อนป้ายเข้าด้านใน ใกล้ผนังล่างย้ายป้ายขึ้นไปเหนือคน */
function tagPlace(person: RoomPerson, floor: { w: number; d: number }, frame: Frame): CSSProperties {
  const [fx, fy] = person.floor
  const above = fy > floor.d * 0.85
  const across = fx < floor.w * 0.15 ? '-14px' : fx > floor.w * 0.85 ? 'calc(-100% + 14px)' : '-50%'
  return {
    left: `${(frame.x(fx) / frame.width) * 100}%`,
    top: `${((frame.y(fy) + (above ? -TAG_GAP : TAG_GAP)) / frame.height) * 100}%`,
    transform: `translate(${across}, ${above ? '-100%' : '0'})`,
  }
}

interface Props {
  title: string
  /** ผังพื้นของ session ที่กำลังทำงาน — null = ยังไม่มีภาพ */
  floor: Floor | null
  objects: LiveObject[]
  people: RoomPerson[]
  counts: ReadonlyMap<string, number>
}

export default function FloorPlan({ title, floor, objects, people, counts }: Props) {
  const [view, setView] = usePersistentState<PlanView>(VIEW_KEY, DEFAULT_VIEW, isPlanView)
  const heat = useYoloLive((s) => (view.heat ? s.heat : null))
  const { w, d } = floor ?? EMPTY_FLOOR
  const frame = useMemo(() => planFrame(w, d), [w, d])
  // แผงสดมาใหม่ 4 ครั้ง/วินาที แต่ความหนาแน่นเปลี่ยนทุก 10 เฟรม — ไม่สร้างช่องหลายร้อยช่องซ้ำทุกครั้ง
  const live = floor !== null
  const heatCells = useMemo(() => (live && heat ? <HeatCells heat={heat} w={w} d={d} frame={frame} /> : null), [live, heat, w, d, frame])
  const label = floor ? `ผัง${title}: ${people.length > 0 ? `มีคน ${people.length} คน` : 'ว่าง'}` : `ผัง${title}: ยังไม่มีภาพจากกล้อง`

  return (
    <div className="yd-overview-plan">
      <div className="yd-overview-plan-tools">
        <button
          type="button"
          className="yd-btn-line is-small"
          aria-pressed={view.objects}
          onClick={() => setView((v) => ({ ...v, objects: !v.objects }))}
        >
          สิ่งของ
        </button>
        <Segment options={MARKER_OPTIONS} value={view.marker} onChange={(marker) => setView((v) => ({ ...v, marker }))} label="รูปแบบตำแหน่งคนบนผัง" />
        <PrintedCheckbox checked={view.heat} onChange={(on) => setView((v) => ({ ...v, heat: on }))}>
          ความหนาแน่น
        </PrintedCheckbox>
      </div>

      <div className="yd-overview-plan-box" style={{ '--yd-plan-ratio': frame.width / frame.height } as CSSProperties}>
        <svg viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={label}>
          {heatCells}
          <Grid w={w} d={d} frame={frame} />
          {floor && <Zones floor={floor} frame={frame} />}
          {floor && view.objects && objects.map((o) => <ObjectMark key={`${o.cls}-${o.id}`} object={o} frame={frame} />)}
          <rect className="yd-plan-wall" x={frame.x(0)} y={frame.y(0)} width={w * frame.unit} height={d * frame.unit} />
          {floor &&
            people.map((p) =>
              p.floorTrail.length > 1 ? (
                <polyline
                  key={`trail-${p.id}`}
                  className="yd-overview-trail"
                  points={[...p.floorTrail, p.floor].map(([x, y]) => `${frame.x(x)},${frame.y(y)}`).join(' ')}
                />
              ) : null,
            )}
          {floor &&
            people.map((p) => (
              <g key={p.id} className="yd-plan-person yd-overview-person" style={{ transform: `translate(${frame.x(p.floor[0])}px, ${frame.y(p.floor[1])}px)` }}>
                <PersonMark person={p} marker={view.marker} />
              </g>
            ))}
        </svg>

        {/* ชื่อเป็น HTML ทับบนผัง (ตัวอักษรคมชัดกว่าวาดใน SVG ที่ถูกย่อ/ขยาย) */}
        {floor && <ZoneNames floor={floor} frame={frame} />}
        {floor &&
          people.map((p) => {
            const count = todayCountOf(p, counts)
            return (
              <div key={p.id} className={`yd-plan-tag yd-overview-tag${isAlerting(p) ? ' is-alert' : ''}`} style={tagPlace(p, floor, frame)} title={personWhat(p)}>
                <span className="yd-plan-name">{p.label}</span>
                {hasFatigue(p) && <ZzMark label="ความล้า" />}
                {count !== null && count > 0 && (
                  <span className={`yd-plan-count is-${countLevel(count)}`} aria-label={`แจ้งเตือนวันนี้ ${count} ครั้ง`}>
                    {count}
                  </span>
                )}
              </div>
            )
          })}
        {!floor && <p className="yd-overview-plan-empty">ยังไม่มีภาพจากกล้อง</p>}
      </div>
    </div>
  )
}
