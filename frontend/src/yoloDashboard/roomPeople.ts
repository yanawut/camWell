import type { PendingFall } from './alertInbox'
import type { MarkState } from './marks'
import type { AlertRecord, LiveAlert, LivePerson, PersonState, Point, SessionState, WellCategory, WellCheck } from '../yoloConsole/types'
import { CATEGORIES, CATEGORY_TEXT, liveDuration, personName } from '../yoloConsole/wellness'

// ข้อมูลของหน้าภาพรวม: สถานะห้องจาก yolo-backend และคนในห้องในรูปที่หน้าเจ้าหน้าที่ใช้

export type RoomPhase = 'offline' | 'idle' | 'starting' | 'live' | 'paused' | 'done' | 'error'

const PHASE_OF_STATE: Record<SessionState, Exclude<RoomPhase, 'offline'>> = {
  idle: 'idle',
  starting: 'starting',
  running: 'live',
  paused: 'paused',
  holding: 'done',
  ended: 'idle',
  error: 'error',
}

export function roomPhase(connected: boolean, state: SessionState): RoomPhase {
  return connected ? PHASE_OF_STATE[state] : 'offline'
}

export interface PhaseInfo {
  badge: string
  tone: 'live' | 'plain' | 'alert'
  /** มี session ที่ใช้ภาพได้อยู่ — ไม่มี = คนในแผงสดเป็นของเก่า ไม่แสดง */
  active: boolean
}

export const PHASES: Record<RoomPhase, PhaseInfo> = {
  offline: { badge: 'ไม่ได้เชื่อมต่อ yolo-backend', tone: 'alert', active: false },
  idle: { badge: 'ยังไม่เปิดกล้อง', tone: 'plain', active: false },
  starting: { badge: 'กำลังเปิดกล้อง', tone: 'plain', active: true },
  live: { badge: 'LIVE', tone: 'live', active: true },
  paused: { badge: 'หยุดชั่วคราว', tone: 'plain', active: true },
  done: { badge: 'วิเคราะห์เสร็จแล้ว', tone: 'plain', active: true },
  error: { badge: 'กล้องมีปัญหา', tone: 'alert', active: false },
}

export interface PersonCheck {
  category: WellCategory
  check: WellCheck
  note: string | null
}

export interface RoomPerson {
  id: number
  /** ชื่อจากใบหน้าที่ลงทะเบียน — มีเฉพาะเมื่อระบบจำหน้าได้แล้ว */
  name: string | null
  label: string
  state: PersonState
  sitMinutes: number | null
  /** การเตือนที่ยังค้างอยู่ ไม่รวมอันที่กดรับทราบแล้ว */
  alerts: LiveAlert[]
  /** null = ระบบแจ้งเตือนสุขภาพไม่ได้ทำงานกับคนนี้ */
  checks: PersonCheck[] | null
  floor: Point
  floorTrail: Point[]
}

export function toRoomPeople(people: LivePerson[], acked: ReadonlySet<string>): RoomPerson[] {
  return people.map((p) => {
    const w = p.wellness ?? null
    const name = p.face?.status === 'known' && p.face.name ? p.face.name : null
    return {
      id: p.id,
      name,
      label: personName(name, p.id),
      state: p.state,
      sitMinutes: w?.sitMinutes ?? null,
      alerts: (w?.alerts ?? []).filter((a) => !acked.has(a.id)),
      checks: w ? CATEGORIES.map((category) => ({ category, check: w.checks[category], note: w.notes[category] ?? null })) : null,
      floor: p.floor,
      floorTrail: p.floorTrail,
    }
  })
}

export const isAlerting = (p: RoomPerson) => p.alerts.length > 0
export const hasFatigue = (p: RoomPerson) => p.alerts.some((a) => a.category === 'fatigue')

/** จำนวนแจ้งเตือนวันนี้ต่อชื่อ — คนที่ยังไม่รู้ชื่อนับรวมกันไม่ได้ จึงไม่นับ */
export function todayCounts(records: AlertRecord[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of records) if (r.name) counts.set(r.name, (counts.get(r.name) ?? 0) + 1)
  return counts
}

/** null = ยังไม่ระบุตัว */
export const todayCountOf = (p: RoomPerson, counts: ReadonlyMap<string, number>) => (p.name ? (counts.get(p.name) ?? 0) : null)

/** 0 = ไม่มี, 1–10 = มีบ้าง, เกิน 10 = มาก (วงแดง) */
export function countLevel(count: number): 'none' | 'some' | 'many' {
  if (count === 0) return 'none'
  return count <= 10 ? 'some' : 'many'
}

export interface RoomStatus {
  mark: MarkState
  text: string
  alert: boolean
}

export function roomStatus(pendingFalls: number, people: RoomPerson[]): RoomStatus {
  const alerting = people.filter(isAlerting).length
  if (pendingFalls > 0) return { mark: 'ring', text: 'ตรวจพบการล้ม · เปิดภาพสดเพื่อตรวจสอบ', alert: true }
  if (alerting > 0) return { mark: 'ring', text: `มีคน ${people.length} คน · เตือนอยู่ ${alerting} คน`, alert: true }
  if (people.length > 0) return { mark: 'tick', text: `มีคน ${people.length} คน · ปกติทุกคน`, alert: false }
  return { mark: 'empty', text: 'ว่าง', alert: false }
}

export type RosterRow = { kind: 'fall'; fall: PendingFall } | { kind: 'person'; person: RoomPerson }

/** การล้มขึ้นก่อน แล้วคนที่ล้ม คนที่กำลังเตือน และคนอื่น — ในกลุ่มเดียวกันเรียงตาม ID แถวจะได้ไม่กระโดดหนีเมาส์ */
export function rosterRows(falls: PendingFall[], people: RoomPerson[]): RosterRow[] {
  const fallen = new Set(falls.map((f) => f.alert.person))
  const rank = (p: RoomPerson) => (fallen.has(p.id) ? 0 : isAlerting(p) ? 1 : 2)
  const sorted = [...people].sort((a, b) => rank(a) - rank(b) || a.id - b.id)
  return [
    ...falls.map((fall): RosterRow => ({ kind: 'fall', fall })),
    ...sorted.map((person): RosterRow => ({ kind: 'person', person })),
  ]
}

const STATE_TEXT: Record<PersonState, string> = { sitting: 'นั่ง', standing: 'ยืน', walking: 'เดิน' }

/** บรรทัด "อาการ" ใต้ชื่อในตาราง */
export function personWhat(p: RoomPerson): string {
  if (isAlerting(p)) return p.alerts.map((a) => `${a.text} (${liveDuration(a)})`).join(' · ')
  const now = p.checks ? `ท่าทางปกติ · ${STATE_TEXT[p.state]}` : `${STATE_TEXT[p.state]} · ระบบแจ้งเตือนไม่ได้ทำงาน`
  const sat = p.state === 'sitting' && p.sitMinutes !== null ? ` · นั่งมา ${Math.floor(p.sitMinutes)} นาที` : ''
  return now + sat
}

export const CHECK_MARK: Record<WellCheck, MarkState> = { ok: 'tick', alert: 'ring', na: 'empty', off: 'empty' }
export const CHECK_TEXT: Record<WellCheck, string> = { ok: 'ปกติ', alert: 'เตือน', na: 'วัดไม่ได้', off: 'ปิดอยู่' }

/** คำอธิบายเมื่อชี้: ทำไมวัดไม่ได้ หรือถูกปิดไว้ */
export function checkNote(c: PersonCheck): string | undefined {
  if (c.check === 'na') return `${CATEGORY_TEXT[c.category]}: ${c.note ?? 'วัดไม่ได้'}`
  if (c.check === 'off') return `${CATEGORY_TEXT[c.category]}: ปิดอยู่`
  return undefined
}
