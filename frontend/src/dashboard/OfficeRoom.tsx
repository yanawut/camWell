import { useEffect, useState, type ReactNode } from 'react'
import type { PersonSummary } from '../types/person'
import { Mark, ZzMark } from '../envelope/marks'

// ห้องหนึ่งห้อง = กล้องหนึ่งตัว วาดเป็นผังห้องมองจากด้านบน ลายเส้นหมึกเดียวแบบพิมพ์บนฉลาก
// คนที่ตรวจพบนั่งประจำโต๊ะเดิม (เข้า = ค่อย ๆ ปรากฏ, ออกจากเฟรม = ค่อย ๆ จางหาย)
// ข้างผังมีตารางรายชื่อคนในห้อง ให้อ่านสถานะได้โดยไม่ต้องไล่หาในภาพ

const PLAN_W = 400
const PLAN_H = 250
const LEAVE_ANIMATION_MS = 700
const NO_FALLS: string[] = []

interface Seat {
  /** จุดกึ่งกลางของคน (ตำแหน่งเก้าอี้) ในพิกัดผัง */
  cx: number
  cy: number
  /** ป้ายชื่ออยู่ใต้หรือเหนือเก้าอี้ — เลือกฝั่งที่ไม่ทับเฟอร์นิเจอร์ แม้ผังถูกย่อบนจอแคบ */
  tag: 'below' | 'above'
}

// 4 ที่นั่งต่อห้อง = จำนวนคนสูงสุดที่ตรวจได้ต่อกล้อง (MAX_TRACKED_PEOPLE) — ลำดับ = ลำดับที่คนใหม่ได้นั่ง
// แถวบนอยู่สูงพอให้ป้ายชื่อใต้เก้าอี้ไม่ชนโต๊ะแถวล่าง (ผังกว้างแค่ ~280px บนจอ 320px)
const OFFICE_SEATS: Seat[] = [
  { cx: 99, cy: 78, tag: 'below' },
  { cx: 301, cy: 78, tag: 'below' },
  { cx: 99, cy: 188, tag: 'below' },
  { cx: 301, cy: 188, tag: 'below' },
]

// ห้องประชุม: แถวบนติดโต๊ะประชุม ป้ายชื่อจึงอยู่เหนือเก้าอี้
const MEETING_SEATS: Seat[] = [
  { cx: 160, cy: 62, tag: 'above' },
  { cx: 240, cy: 62, tag: 'above' },
  { cx: 160, cy: 190, tag: 'below' },
  { cx: 240, cy: 190, tag: 'below' },
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
function nextSeating(seated: Seated[], people: PersonSummary[], seatCount: number): Seated[] {
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
    let free = -1
    for (let i = 0; i < seatCount; i += 1) {
      if (!taken.has(i)) {
        free = i
        break
      }
    }
    if (free === -1) continue
    // โต๊ะนี้อาจยังมีคนที่กำลังจางหายค้างอยู่ — ให้คนใหม่นั่งแทนเลย
    next = [...next.filter((s) => s.seat !== free), { person, seat: free, leaving: false }]
  }
  return next
}

/** อาการที่กำลังเตือนอยู่ของคนหนึ่งคน (เตือนแล้ว = ค้างนานพอตามเกณฑ์) */
function activeIssues(person: PersonSummary): string[] {
  const issues: string[] = []
  if (person.postureAlertActive) issues.push(person.postureStatus)
  if (person.distanceActive) issues.push('นั่งใกล้จอเกินไป')
  if (person.fatigueActive) issues.push('ความเหนื่อยล้า/ง่วง')
  return issues
}

/** ระดับจำนวนแจ้งเตือนวันนี้: 0 = ไม่มี, 1–10 = มีบ้าง, เกิน 10 = มาก (วงแดง) */
function countLevel(count: number): 'none' | 'some' | 'many' {
  if (count === 0) return 'none'
  return count <= 10 ? 'some' : 'many'
}

/** ผนัง หน้าต่าง ประตู และกริดพื้น (เหมือนกันทุกห้อง) */
function PlanShell({ children }: { children: ReactNode }) {
  const grid: ReactNode[] = []
  for (let x = 20; x < PLAN_W; x += 20) grid.push(<line key={`x${x}`} x1={x} y1={6} x2={x} y2={PLAN_H - 6} />)
  for (let y = 20; y < PLAN_H; y += 20) grid.push(<line key={`y${y}`} x1={6} y1={y} x2={PLAN_W - 6} y2={y} />)
  return (
    <>
      <g className="plan-grid">{grid}</g>
      {children}
      {/* ผนัง */}
      <rect className="plan-wall" x="6" y="6" width={PLAN_W - 12} height={PLAN_H - 12} />
      {/* หน้าต่างบนผนังด้านบน: เว้นผนังแล้วลากเส้นคู่ */}
      <g className="plan-window">
        <rect className="plan-paper" x="70" y="3" width="80" height="6" />
        <rect className="plan-paper" x="250" y="3" width="80" height="6" />
        <path d="M70 4.2h80M70 7.8h80M250 4.2h80M250 7.8h80M70 3v6M150 3v6M250 3v6M330 3v6" />
      </g>
      {/* ประตูผนังด้านล่าง: บานประตู + เส้นโค้งวงเปิด */}
      <rect className="plan-paper" x="178" y={PLAN_H - 9} width="40" height="6" />
      <path className="plan-door" d={`M178 ${PLAN_H - 6}V${PLAN_H - 44}A38 38 0 0 1 216 ${PLAN_H - 6}`} />
    </>
  )
}

function OfficeFurniture() {
  return (
    <g className="plan-furniture">
      {OFFICE_SEATS.map(({ cx, cy }) => {
        const x = cx - 55
        const y = cy - 52
        return (
          <g key={`${cx}-${cy}`}>
            <rect className="plan-desk" x={x} y={y} width="110" height="34" />
            <rect className="plan-screen" x={cx - 15} y={y + 5} width="30" height="5" />
            <rect className="plan-keys" x={cx - 13} y={y + 19} width="26" height="7" />
            <rect className="plan-chair" x={cx - 12} y={cy - 11} width="24" height="22" />
          </g>
        )
      })}
      {/* ต้นไม้มุมห้อง */}
      <g className="plan-plant">
        <circle cx="366" cy="216" r="11" />
        <path d="M366 205v22M355 216h22M358 208l16 16M374 208l-16 16" />
      </g>
    </g>
  )
}

function MeetingFurniture() {
  return (
    <g className="plan-furniture">
      <rect className="plan-desk" x="112" y="86" width="176" height="78" />
      {[...MEETING_SEATS, { cx: 96, cy: 125 }, { cx: 304, cy: 125 }].map(({ cx, cy }) => (
        <rect key={`${cx}-${cy}`} className="plan-chair" x={cx - 12} y={cy - 11} width="24" height="22" />
      ))}
      {/* จอนำเสนอบนผนังซ้าย */}
      <rect className="plan-screen" x="10" y="95" width="5" height="60" />
    </g>
  )
}

/** คนมองจากด้านบน: ไหล่ (วงรีทึบ) + ศีรษะ */
function PersonMark({ cx, cy, alert }: { cx: number; cy: number; alert: boolean }) {
  return (
    <g>
      <ellipse className="plan-shoulders" cx={cx} cy={cy + 2.5} rx="13" ry="7.5" />
      <circle className="plan-head" cx={cx} cy={cy - 1} r="6.5" />
      {alert && (
        <path
          className="plan-ring"
          pathLength={1}
          transform={`translate(${cx - 22} ${cy - 22}) scale(1.1)`}
          d="M22.5 4.2c8.6.6 14.2 6.4 13.4 14.6-.8 8.6-8.4 15.4-17.2 14.8C10 33 4.6 27 5.4 19.2 6.2 10.8 12.6 4.4 21 3.9c1.6 0 3 .3 4.4.8"
        />
      )}
    </g>
  )
}

interface Props {
  id?: string
  title: string
  people: PersonSummary[]
  variant?: RoomVariant
  /** ข้อความของเหตุการณ์ล้มที่ยังไม่รับทราบในห้องนี้ */
  fallMessages?: string[]
  onOpenCamera: () => void
  /** จำนวนครั้งที่ถูกแจ้งเตือนวันนี้ของแต่ละคน (key = employeeId) — คนที่ยังระบุตัวตนไม่ได้จะไม่มีตัวเลข */
  alertCounts: Map<string, number>
}

export default function OfficeRoom({
  id,
  title,
  people,
  variant = 'office',
  fallMessages = NO_FALLS,
  onOpenCamera,
  alertCounts,
}: Props) {
  const seats = variant === 'meeting' ? MEETING_SEATS : OFFICE_SEATS
  const hasFallAlert = fallMessages.length > 0
  const [state, setState] = useState<SeatingState>({ prevPeople: null, seated: [] })

  // ปรับที่นั่งระหว่าง render เมื่อรายชื่อคนเปลี่ยน (รูปแบบ "adjust state on prop change" ของ React) แทนการใช้
  // effect ที่จะทำให้คนโผล่ช้าไป 1 render
  let seated = state.seated
  if (people !== state.prevPeople) {
    seated = nextSeating(state.seated, people, seats.length)
    setState({ prevPeople: people, seated })
  }

  // ลบคนที่จางหายเสร็จแล้วออก
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

  const present = seated.filter((s) => !s.leaving)
  const alerting = present.filter((s) => activeIssues(s.person).length > 0).length
  const headingId = id ? `${id}-title` : undefined
  const todayCount = (person: PersonSummary) => (person.employeeId ? (alertCounts.get(person.employeeId) ?? 0) : null)

  let status: { mark: 'ring' | 'tick' | 'empty'; text: string; tone?: 'alert' }
  if (hasFallAlert) status = { mark: 'ring', text: 'ตรวจพบการล้ม · เปิดภาพสดเพื่อตรวจสอบ', tone: 'alert' }
  else if (alerting > 0) status = { mark: 'ring', text: `มีคน ${present.length} คน · เตือนอยู่ ${alerting} คน`, tone: 'alert' }
  else if (present.length > 0) status = { mark: 'tick', text: `มีคน ${present.length} คน · ปกติทุกคน` }
  else status = { mark: 'empty', text: 'ว่าง' }

  // ตารางรายชื่อ: คนที่มีอาการค้างขึ้นก่อน
  const roster = [...present].sort((a, b) => activeIssues(b.person).length - activeIssues(a.person).length)

  return (
    <section id={id} className={`dash-room${hasFallAlert ? ' is-fall' : ''}`} aria-labelledby={headingId}>
      <header className="dash-room-head">
        <div className="dash-room-heading">
          <h2 id={headingId}>{title}</h2>
          <p className={`dash-room-status${status.tone === 'alert' ? ' is-alert' : ''}`}>
            <Mark state={status.mark} label="" small />
            {status.text}
          </p>
        </div>
        <button type="button" className={hasFallAlert ? 'dash-open-live is-fall' : 'rx-secondary is-small'} onClick={onOpenCamera}>
          {hasFallAlert ? 'เปิดภาพสดทันที' : 'ดูภาพสด'}
        </button>
      </header>

      <div className="dash-room-body">
        <div className="dash-plan">
          <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} role="img" aria-label={`ผัง${title}: ${present.length > 0 ? `มีคน ${present.length} คน` : 'ว่าง'}`}>
            <PlanShell>{variant === 'meeting' ? <MeetingFurniture /> : <OfficeFurniture />}</PlanShell>
            {seated.map(({ person, seat, leaving }) => (
              <g key={person.trackId} className={`plan-person${leaving ? ' is-leaving' : ''}`}>
                <PersonMark {...seats[seat]} alert={!leaving && activeIssues(person).length > 0} />
              </g>
            ))}
          </svg>
          {/* ชื่อเป็น HTML ทับบนผัง (ตัวอักษรคมชัดกว่าวาดใน SVG ที่ถูกย่อ/ขยาย) */}
          {seated.map(({ person, seat, leaving }) => {
            const { cx, cy, tag } = seats[seat]
            const count = todayCount(person)
            const alert = activeIssues(person).length > 0
            return (
              <div
                key={person.trackId}
                className={`plan-tag is-${tag}${leaving ? ' is-leaving' : ''}${alert ? ' is-alert' : ''}`}
                style={{ left: `${(cx / PLAN_W) * 100}%`, top: `${((tag === 'below' ? cy + 15 : cy - 15) / PLAN_H) * 100}%` }}
                title={activeIssues(person).join(' · ') || person.postureStatus}
              >
                <span className="plan-name">{person.label}</span>
                {person.fatigueActive && <ZzMark label="ความเหนื่อยล้า" />}
                {count !== null && count > 0 && (
                  <span className={`plan-count is-${countLevel(count)}`} aria-label={`แจ้งเตือนวันนี้ ${count} ครั้ง`}>{count}</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="dash-roster">
          <table>
            <caption>คนในห้องนี้</caption>
            <thead className="rx-visually-hidden">
              <tr><th scope="col">สถานะ</th><th scope="col">ชื่อและอาการ</th><th scope="col">แจ้งเตือนวันนี้</th></tr>
            </thead>
            <tbody>
              {fallMessages.map((message, i) => (
                <tr key={`fall-${i}`} className="is-fall">
                  <td><Mark state="ring" label="ตรวจพบการล้ม" small /></td>
                  <th scope="row">
                    <span className="dash-roster-name">ตรวจพบการล้ม</span>
                    <span className="dash-roster-what">{message}</span>
                  </th>
                  <td className="rx-hand dash-roster-count is-many">ทันที</td>
                </tr>
              ))}
              {roster.map(({ person }) => {
                const issues = activeIssues(person)
                const count = todayCount(person)
                return (
                  <tr key={person.trackId} className={issues.length > 0 ? 'is-alert' : undefined}>
                    <td><Mark state={issues.length > 0 ? 'ring' : 'tick'} label={issues.length > 0 ? 'มีอาการค้าง' : 'ปกติ'} small /></td>
                    <th scope="row">
                      <span className="dash-roster-name">{person.label}</span>
                      <span className="dash-roster-what">{issues.length > 0 ? issues.join(' · ') : 'ท่าทางปกติ'}</span>
                    </th>
                    <td className={`rx-hand dash-roster-count${count !== null && countLevel(count) === 'many' ? ' is-many' : ''}`}>
                      {count === null ? 'ยังไม่ระบุตัว' : `${count} ครั้ง`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {roster.length === 0 && !hasFallAlert && <p className="dash-roster-empty">ยังไม่มีคนในห้องนี้</p>}
        </div>
      </div>
    </section>
  )
}
