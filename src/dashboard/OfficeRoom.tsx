import { useEffect, useState, type ReactNode } from 'react'
import type { PersonSummary } from '../types/person'
import { PixelCharacter } from './pixelArt'
import { SPRITE_WIDTH, lookFromSeed } from './pixelLook'

// ห้องทำงานโล่งๆ แบบ pixel art 1 ห้อง = กล้อง 1 ตัว — คนที่ตรวจพบในเฟรมจะโผล่เป็นตัวละครนั่งประจำโต๊ะ
// (เข้ามา = เด้งขึ้น, ออกจากเฟรม = ค่อยๆ จางหาย) พิกัดทั้งหมดเป็น "พิกเซลเสมือน" ของห้องขนาด ROOM_W × ROOM_H
// แล้วย่อ/ขยายด้วย viewBox ให้พอดีกับความกว้างจอ

const ROOM_W = 160
const ROOM_H = 100
const WALL_H = 32
const LEAVE_ANIMATION_MS = 700

interface Seat {
  /** จุดกึ่งกลางแนวนอนของตัวละคร/โต๊ะ */
  cx: number
  /** ขอบบนของหัวตัวละคร */
  top: number
}

// โต๊ะ 4 ตัว (2 แถว × 2 คอลัมน์) = จำนวนคนสูงสุดที่ตรวจได้ต่อกล้อง (MAX_TRACKED_PEOPLE)
const SEATS: Seat[] = [
  { cx: 50, top: 40 },
  { cx: 110, top: 40 },
  { cx: 50, top: 68 },
  { cx: 110, top: 68 },
]

interface Seated {
  person: PersonSummary
  seat: number
  leaving: boolean
}

interface SeatingState {
  prevPeople: PersonSummary[] | null
  seated: Seated[]
}

/**
 * จัดที่นั่งให้คนในเฟรม: คนเดิม (trackId เดิม) นั่งที่เดิมตลอด คนใหม่ได้โต๊ะว่างตัวแรก คนที่หายไปจากเฟรม
 * ถูกทำเครื่องหมาย leaving ไว้ก่อน (ให้เล่น animation จางหาย) แล้วค่อยลบทิ้งใน effect
 */
function nextSeating(seated: Seated[], people: PersonSummary[]): Seated[] {
  const byTrack = new Map(people.map((p) => [p.trackId, p]))
  let next: Seated[] = seated.map((s) => {
    const current = byTrack.get(s.person.trackId)
    // ยังอยู่ (หรือกลับเข้ามาก่อนจางหายหมด) -> อัปเดตสถานะล่าสุด, หายไป -> เริ่มจางหาย
    return current ? { person: current, seat: s.seat, leaving: false } : { ...s, leaving: true }
  })
  const seatedIds = new Set(next.map((s) => s.person.trackId))
  for (const person of people) {
    if (seatedIds.has(person.trackId)) continue
    const taken = new Set(next.filter((s) => !s.leaving).map((s) => s.seat))
    const free = SEATS.findIndex((_, i) => !taken.has(i))
    if (free === -1) continue
    // โต๊ะนี้อาจยังมีคนที่กำลังจางหายค้างอยู่ — ให้คนใหม่นั่งแทนเลย
    next = [...next.filter((s) => s.seat !== free), { person, seat: free, leaving: false }]
  }
  return next
}

function statusBubble(person: PersonSummary): { text: string; title: string; tone: 'alert' | 'tired' } | null {
  if (person.postureAlertActive) return { text: '!', title: person.postureStatus, tone: 'alert' }
  if (person.fatigueActive) return { text: 'Zz', title: 'ความเหนื่อยล้า/ง่วง', tone: 'tired' }
  if (person.distanceActive) return { text: '!', title: 'นั่งใกล้จอเกินไป', tone: 'alert' }
  return null
}

/** ระดับสีของป้ายจำนวนแจ้งเตือนวันนี้: 0 = เขียว (ว่าง ไม่มีตัวเลข), 1–10 = ส้ม, เกิน 10 = แดง */
function countLevel(count: number): 'none' | 'some' | 'many' {
  if (count === 0) return 'none'
  return count <= 10 ? 'some' : 'many'
}

function Px({ x, y, w, h, fill }: { x: number; y: number; w: number; h: number; fill: string }) {
  return <rect x={x} y={y} width={w} height={h} fill={fill} />
}

/** พื้นหลังห้อง: ผนัง หน้าต่าง กระดานไวท์บอร์ด นาฬิกา ต้นไม้ และพื้นไม้ */
function RoomBackground() {
  const tiles: ReactNode[] = []
  for (let y = WALL_H + 2; y < ROOM_H; y += 8) {
    for (let x = 0; x < ROOM_W; x += 16) {
      const offset = ((y - WALL_H - 2) / 8) % 2 === 0 ? 0 : 8
      tiles.push(<Px key={`t-${x}-${y}`} x={x + offset} y={y} w={15} h={7} fill="#e2cfae" />)
    }
  }
  return (
    <g>
      {/* ผนัง + บัว */}
      <Px x={0} y={0} w={ROOM_W} h={WALL_H} fill="#dfe6ee" />
      <Px x={0} y={WALL_H - 6} w={ROOM_W} h={6} fill="#cfd8e3" />
      <Px x={0} y={WALL_H} w={ROOM_W} h={2} fill="#9aa8b8" />
      {/* พื้นไม้ */}
      <Px x={0} y={WALL_H + 2} w={ROOM_W} h={ROOM_H - WALL_H - 2} fill="#d7c09a" />
      {tiles}
      {/* หน้าต่าง */}
      <Px x={64} y={5} w={34} h={20} fill="#7b8ba0" />
      <Px x={66} y={7} w={30} h={16} fill="#bfe3ff" />
      <Px x={66} y={7} w={30} h={5} fill="#d9efff" />
      <Px x={80} y={7} w={2} h={16} fill="#7b8ba0" />
      <Px x={66} y={14} w={30} h={2} fill="#7b8ba0" />
      {/* ไวท์บอร์ด */}
      <Px x={12} y={7} w={36} h={17} fill="#9aa3ad" />
      <Px x={13} y={8} w={34} h={15} fill="#ffffff" />
      <Px x={16} y={11} w={14} h={1} fill="#3b82f6" />
      <Px x={16} y={14} w={22} h={1} fill="#ef4444" />
      <Px x={16} y={17} w={10} h={1} fill="#10b981" />
      {/* นาฬิกา */}
      <Px x={124} y={8} w={10} h={10} fill="#4b5563" />
      <Px x={125} y={9} w={8} h={8} fill="#f8fafc" />
      <Px x={128} y={10} w={1} h={4} fill="#1f2430" />
      <Px x={129} y={13} w={3} h={1} fill="#1f2430" />
      {/* ต้นไม้มุมห้อง */}
      <Px x={146} y={22} w={8} h={4} fill="#22a35a" />
      <Px x={144} y={25} w={12} h={6} fill="#1f8f4e" />
      <Px x={147} y={18} w={6} h={5} fill="#2fbf6c" />
      <Px x={146} y={31} w={8} h={8} fill="#b4643a" />
      <Px x={146} y={31} w={8} h={2} fill="#9a5230" />
    </g>
  )
}

function Chair({ cx, top }: Seat) {
  return (
    <g>
      <Px x={cx - 8} y={top + 5} w={16} h={11} fill="#475569" />
      <Px x={cx - 7} y={top + 6} w={14} h={9} fill="#64748b" />
    </g>
  )
}

function Desk({ cx, top }: Seat) {
  const y = top + 12
  return (
    <g>
      {/* หลังจอคอม (หันจอเข้าหาคนที่นั่ง) */}
      <Px x={cx + 7} y={y - 7} w={9} h={7} fill="#374151" />
      <Px x={cx + 10} y={y - 1} w={2} h={1} fill="#4b5563" />
      {/* แก้วกาแฟ */}
      <Px x={cx - 12} y={y - 3} w={3} h={3} fill="#f8fafc" />
      {/* หน้าโต๊ะ + ขอบ */}
      <Px x={cx - 16} y={y} w={32} h={4} fill="#b88a5c" />
      <Px x={cx - 16} y={y + 4} w={32} h={6} fill="#946a43" />
      <Px x={cx - 15} y={y + 10} w={2} h={4} fill="#6b4c30" />
      <Px x={cx + 13} y={y + 10} w={2} h={4} fill="#6b4c30" />
    </g>
  )
}

interface Props {
  title: string
  people: PersonSummary[]
  /** จำนวนครั้งที่ถูกแจ้งเตือนวันนี้ของแต่ละคน (key = employeeId) — คนที่ยังระบุตัวตนไม่ได้จะไม่มีตัวเลข */
  alertCounts: Map<string, number>
}

export default function OfficeRoom({ title, people, alertCounts }: Props) {
  const [state, setState] = useState<SeatingState>({ prevPeople: null, seated: [] })

  // ปรับที่นั่งระหว่าง render เมื่อรายชื่อคนเปลี่ยน (รูปแบบ "adjust state on prop change" ของ React) แทนการใช้
  // effect ที่จะทำให้ตัวละครโผล่ช้าไป 1 render
  let seated = state.seated
  if (people !== state.prevPeople) {
    seated = nextSeating(state.seated, people)
    setState({ prevPeople: people, seated })
  }

  // ลบตัวละครที่จางหายเสร็จแล้วออก
  const leavingKey = seated
    .filter((s) => s.leaving)
    .map((s) => s.person.trackId)
    .join(',')
  useEffect(() => {
    if (!leavingKey) return
    const ids = new Set(leavingKey.split(','))
    const timer = window.setTimeout(() => {
      setState((prev) => ({
        ...prev,
        seated: prev.seated.filter((s) => !(s.leaving && ids.has(s.person.trackId))),
      }))
    }, LEAVE_ANIMATION_MS)
    return () => window.clearTimeout(timer)
  }, [leavingKey])

  const present = seated.filter((s) => !s.leaving).length

  return (
    <section className="dash-room-card">
      <header className="dash-room-header">
        <h2>{title}</h2>
        <span className={`dash-room-count ${present > 0 ? 'is-occupied' : ''}`}>
          {present > 0 ? `${present} คนในห้อง` : 'ว่าง'}
        </span>
      </header>
      <div className="dash-room">
        <svg viewBox={`0 0 ${ROOM_W} ${ROOM_H}`} shapeRendering="crispEdges" role="img" aria-label={`${title}: ${present} คน`}>
          <RoomBackground />
          {SEATS.map((seat, i) => {
            const occupant = seated.find((s) => s.seat === i)
            return (
              <g key={i}>
                <Chair {...seat} />
                {occupant && (
                  <g transform={`translate(${seat.cx - SPRITE_WIDTH / 2} ${seat.top})`}>
                    <g
                      key={occupant.person.trackId}
                      className={`dash-char ${occupant.leaving ? 'is-leaving' : ''}`}
                    >
                      <PixelCharacter look={lookFromSeed(occupant.person.employeeId ?? occupant.person.trackId)} />
                    </g>
                  </g>
                )}
                <Desk {...seat} />
              </g>
            )
          })}
        </svg>
        {/* ป้ายชื่อ + ฟองสถานะเป็น HTML ทับบน SVG (ตัวอักษรคมชัดกว่าวาดใน SVG ที่ถูกขยาย) */}
        {seated.map(({ person, seat, leaving }) => {
          const { cx, top } = SEATS[seat]
          const bubble = statusBubble(person)
          const todayCount = person.employeeId ? (alertCounts.get(person.employeeId) ?? 0) : null
          return (
            <div
              key={person.trackId}
              className={`dash-tag ${leaving ? 'is-leaving' : ''}`}
              style={{ left: `${(cx / ROOM_W) * 100}%`, top: `${((top - 1) / ROOM_H) * 100}%` }}
            >
              {bubble && !leaving && (
                <span className={`dash-bubble is-${bubble.tone}`} title={bubble.title}>
                  {bubble.text}
                </span>
              )}
              <span className="dash-name" title={person.postureStatus}>
                {person.label}
                {todayCount !== null && (
                  <span
                    className={`dash-count is-${countLevel(todayCount)}`}
                    title={todayCount === 0 ? 'วันนี้ยังไม่ถูกแจ้งเตือน' : `ถูกแจ้งเตือนวันนี้ ${todayCount} ครั้ง`}
                  >
                    {todayCount > 0 ? todayCount : ''}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="dash-room-foot">
        {present} / {SEATS.length} โต๊ะมีคนนั่ง
      </p>
    </section>
  )
}
