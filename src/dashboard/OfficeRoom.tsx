import { useEffect, useState, type ReactNode } from 'react'
import type { PersonSummary } from '../types/person'
import { lookFromSeed } from './pixelLook'

// ผังห้อง 2D: กล้องหนึ่งตัวต่อหนึ่งห้อง และจัดคนที่ตรวจพบลงที่นั่งเดิม
// (เข้ามา = เด้งขึ้น, ออกจากเฟรม = ค่อยๆ จางหาย) ภาพวาดปรับขนาดด้วย viewBox

const ROOM_W = 400
const ROOM_H = 240
const WALL_H = 105
const LEAVE_ANIMATION_MS = 700

interface Seat {
  /** จุดกึ่งกลางแนวนอนของตัวละคร/โต๊ะ */
  cx: number
  /** ขอบบนของหัวตัวละคร */
  top: number
}

// โต๊ะ 4 ตัว (2 แถว × 2 คอลัมน์) = จำนวนคนสูงสุดที่ตรวจได้ต่อกล้อง (MAX_TRACKED_PEOPLE)
const SEATS: Seat[] = [
  { cx: 88, top: 140 },
  { cx: 312, top: 78 },
  { cx: 312, top: 150 },
  { cx: 88, top: 78 },
]

type RoomVariant = 'office' | 'meeting'

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

/** พื้นหลังห้องทำงานและห้องประชุมตามภาพ Stitch */
function RoomBackground({ variant }: { variant: RoomVariant }) {
  const meeting = variant === 'meeting'
  const floorLines: ReactNode[] = []
  for (let x = 0; x <= ROOM_W; x += 32) floorLines.push(<line key={`x-${x}`} x1={x} y1={WALL_H + 2} x2={x} y2={ROOM_H} />)
  for (let y = WALL_H + 2; y <= ROOM_H; y += 32) floorLines.push(<line key={`y-${y}`} x1={0} y1={y} x2={ROOM_W} y2={y} />)
  return (
    <g>
      <rect width={ROOM_W} height={WALL_H} fill="#cbd5e1" />
      <rect y={WALL_H - 3} width={ROOM_W} height={5} fill="#475569" />
      <rect y={WALL_H + 2} width={ROOM_W} height={ROOM_H - WALL_H - 2} fill={meeting ? '#e7e7e9' : '#e5cb9b'} />
      <g stroke={meeting ? '#d2d2d7' : '#c8a878'} strokeOpacity={meeting ? '.7' : '.5'} strokeWidth=".7">{floorLines}</g>
      <rect x="170" y="17" width="62" height="50" fill="#fff" stroke="#475569" strokeWidth="3" />
      <rect x="174" y="21" width="27" height="42" fill="#93c5fd" />
      <rect x="204" y="21" width="24" height="42" fill="#93c5fd" />
      <path d="M202 21v42" stroke="#475569" strokeWidth="3" />
      {meeting ? (
        <g fill="#a89f91" opacity=".6" stroke="#a8a29e">
          <rect x="28" y={WALL_H + 12} width="74" height="38" />
          <rect x="28" y={ROOM_H - 58} width="74" height="38" />
          <rect x="298" y={WALL_H + 12} width="74" height="38" />
        </g>
      ) : (
        <>
          <rect x="24" y="44" width="84" height="49" rx="2" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
          <rect x="32" y="53" width="60" height="10" rx="1" fill="none" stroke="#3b82f6" />
          <rect x="32" y="69" width="61" height="4" rx="2" fill="#ef4444" />
          <rect x="32" y="78" width="43" height="4" rx="2" fill="#14b8a6" />
          <rect x="336" y="28" width="26" height="38" fill="#fff" stroke="#334155" strokeWidth="2" />
          <path d="M347 36v16m-7 7h14" stroke="#64748b" strokeWidth="2" />
          <path d="M362 183l-12 34h24z" fill="#059669" />
        </>
      )}
    </g>
  )
}

function MeetingFallZone() {
  return (
    <g>
      <rect x="288" y="160" width="46" height="34" rx="5" fill="#243642" />
      <rect x="270" y="187" width="84" height="34" rx="2" fill="#8c6b61" stroke="#dc2626" strokeWidth="2" />
    </g>
  )
}

function Chair({ cx, top }: Seat) {
  return (
    <g>
      <rect x={cx - 23} y={top + 8} width="46" height="34" rx="5" fill="#243642" />
      <rect x={cx - 19} y={top + 11} width="38" height="27" rx="4" fill="#314b5a" />
    </g>
  )
}

function Desk({ cx, top }: Seat) {
  const y = top + 30
  return (
    <g>
      <rect x={cx + 8} y={y - 23} width="19" height="17" rx="1" fill="#374151" />
      <rect x={cx + 11} y={y - 20} width="13" height="11" fill="#bfdbfe" />
      <rect x={cx + 15} y={y - 6} width="5" height="6" fill="#475569" />
      <rect x={cx - 42} y={y} width="84" height="8" rx="2" fill="#7a5948" stroke="#543b2e" strokeWidth="2" />
      <rect x={cx - 42} y={y + 8} width="84" height="26" fill="#7a5948" stroke="#543b2e" strokeWidth="2" />
    </g>
  )
}

function PersonAvatar({ person, cx, top }: { person: PersonSummary; cx: number; top: number }) {
  const look = lookFromSeed(person.employeeId ?? person.trackId)
  return (
    <g transform={`translate(${cx - 17} ${top})`}>
      <circle cx="17" cy="17" r="10" fill={look.shirt} />
      <circle cx="17" cy="13" r="3" fill={look.skin} />
      <path d="M10.5 24c.5-3.8 2.6-6 6.5-6s6 2.2 6.5 6" fill="#fff" />
    </g>
  )
}

interface Props {
  id?: string
  title: string
  people: PersonSummary[]
  variant?: RoomVariant
  hasFallAlert?: boolean
  fallAlertCount?: number
  onOpenCamera: () => void
  /** จำนวนครั้งที่ถูกแจ้งเตือนวันนี้ของแต่ละคน (key = employeeId) — คนที่ยังระบุตัวตนไม่ได้จะไม่มีตัวเลข */
  alertCounts: Map<string, number>
}

export default function OfficeRoom({
  id,
  title,
  people,
  variant = 'office',
  hasFallAlert = false,
  fallAlertCount = 0,
  onOpenCamera,
  alertCounts,
}: Props) {
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
  // ท่านั่ง/ความเหนื่อยล้าแสดงบนตัวบุคคล; สถานะห้องเปลี่ยนเป็น WARNING เฉพาะเมื่อมีเหตุหกล้ม
  const hasActiveAlert = hasFallAlert

  return (
    <section id={id} className={`dash-room-card ${hasActiveAlert ? 'has-active-alert' : ''}`}>
      <header className="dash-room-header">
        <div className="dash-room-heading">
          <h2>{title}</h2>
          <span className={`dash-room-count ${hasActiveAlert ? 'is-warning' : present > 0 ? 'is-occupied' : ''}`}>
            {hasActiveAlert ? `WARNING · ${Math.max(fallAlertCount, 1)} คน` : present > 0 ? `OCCUPIED · ${present} คน` : 'ว่าง'}
          </span>
        </div>
        <span className="dash-room-menu" aria-hidden="true">⋮</span>
      </header>
      <div className="dash-room">
        <svg viewBox={`0 0 ${ROOM_W} ${ROOM_H}`} role="img" aria-label={`${title}: ${present} คน`}>
          <RoomBackground variant={variant} />
          {SEATS.map((seat, i) => {
            const occupant = seated.find((s) => s.seat === i)
            return (
              <g key={i}>
                {variant === 'office' && <Chair {...seat} />}
                {occupant && (
                  <g key={occupant.person.trackId} className={`dash-char ${occupant.leaving ? 'is-leaving' : ''}`}>
                    <PersonAvatar person={occupant.person} cx={seat.cx} top={seat.top} />
                  </g>
                )}
                {variant === 'office' && <Desk {...seat} />}
              </g>
            )
          })}
          {variant === 'meeting' && hasFallAlert && <MeetingFallZone />}
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
        {variant === 'meeting' && hasFallAlert && (
          <span className="dash-meeting-fall-tag">ตรวจพบการล้ม! (FALL)</span>
        )}
      </div>
      <footer className={`dash-room-foot ${hasFallAlert ? 'is-alert' : ''}`}>
        <span>{hasFallAlert ? 'ตรวจพบการล้ม — ตรวจสอบภาพสด' : '🔒 วิดีโอประมวลผลในเครื่อง'}</span>
        <button type="button" onClick={onOpenCamera}>{hasFallAlert ? 'เปิดไลฟ์' : 'ดูภาพสด'}</button>
      </footer>
    </section>
  )
}
