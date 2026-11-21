import { describe, expect, it } from 'vitest'
import { PHASES, personWhat, roomPhase, roomStatus, rosterRows, toRoomPeople, todayCountOf, todayCounts } from './roomPeople'
import type { PendingFall } from './alertInbox'
import type { AlertRecord, LiveAlert, LivePerson, LiveWellness, WellCategory } from '../yoloConsole/types'

const alert = (id: string, category: WellCategory, person: number, extra: Partial<LiveAlert> = {}): LiveAlert => ({
  id,
  category,
  type: category === 'fall' ? 'fall' : 'neck',
  text: category === 'fall' ? 'ล้ม' : 'ก้มคอ/ยื่นคอ',
  person,
  name: null,
  startedAt: 0,
  seconds: 90,
  moment: category === 'fall',
  ...extra,
})

const wellness = (alerts: LiveAlert[] = [], extra: Partial<LiveWellness> = {}): LiveWellness => ({
  checks: { posture: 'ok', distance: 'na', break: 'ok', fatigue: 'off', fall: 'ok' },
  notes: { distance: 'กำลังเรียนรู้ระยะปกติ' },
  alerts,
  sitMinutes: null,
  metrics: {},
  ...extra,
})

const person = (id: number, extra: Partial<LivePerson> = {}): LivePerson => ({
  id,
  state: 'sitting',
  conf: 0.9,
  box: [0, 0, 1, 1],
  trail: [],
  ground: [0, 0],
  floor: [1, 1],
  floorTrail: [],
  speed: 0,
  zone: null,
  wellness: wellness(),
  ...extra,
})

const record = (name: string | null): AlertRecord => ({
  kind: 'alert',
  id: Math.random().toString(),
  session: 's',
  camera: 'c',
  person: 1,
  name,
  category: 'posture',
  type: 'neck',
  text: '',
  started_at: 0,
  ended_at: null,
  seconds: null,
  worst: {},
})

const fall = (id: string, personId: number): PendingFall => ({ alert: alert(id, 'fall', personId), seenAt: 0 })

describe('room phase', () => {
  it('shows LIVE only while yolo-backend is connected and analysing', () => {
    expect(PHASES[roomPhase(true, 'running')].badge).toBe('LIVE')
    expect(PHASES[roomPhase(false, 'running')].badge).toBe('ไม่ได้เชื่อมต่อ yolo-backend')
  })

  it('treats a held result as done and an ended session as no camera', () => {
    expect(PHASES[roomPhase(true, 'holding')].badge).toBe('วิเคราะห์เสร็จแล้ว')
    expect(PHASES[roomPhase(true, 'ended')].badge).toBe('ยังไม่เปิดกล้อง')
    expect(PHASES[roomPhase(true, 'error')].badge).toBe('กล้องมีปัญหา')
  })

  it('counts a camera only while a session runs, is paused or holds a result', () => {
    const active = (['idle', 'starting', 'running', 'paused', 'holding', 'ended', 'error'] as const).filter(
      (state) => PHASES[roomPhase(true, state)].active,
    )
    expect(active).toEqual(['starting', 'running', 'paused', 'holding'])
    expect(PHASES[roomPhase(false, 'running')].active).toBe(false)
  })
})

describe('toRoomPeople', () => {
  it('names a person only when the face is recognised', () => {
    const [known, unknown] = toRoomPeople(
      [
        person(1, { face: { status: 'known', name: 'สมชาย', score: 0.8 } }),
        person(4, { face: { status: 'unknown', name: 'สมชาย', score: 0.2 } }),
      ],
      new Set(),
    )
    expect([known.name, known.label]).toEqual(['สมชาย', 'สมชาย'])
    expect([unknown.name, unknown.label]).toEqual([null, 'คนที่ 4'])
  })

  it('drops alerts that were acknowledged and keeps the rest', () => {
    const [p] = toRoomPeople([person(1, { wellness: wellness([alert('a', 'posture', 1), alert('b', 'fatigue', 1)]) })], new Set(['a']))
    expect(p.alerts.map((a) => a.id)).toEqual(['b'])
  })

  it('gives the five checks in order with the reason a check could not run', () => {
    const [p] = toRoomPeople([person(1)], new Set())
    expect(p.checks?.map((c) => [c.category, c.check])).toEqual([
      ['posture', 'ok'],
      ['distance', 'na'],
      ['break', 'ok'],
      ['fatigue', 'off'],
      ['fall', 'ok'],
    ])
    expect(p.checks?.[1].note).toBe('กำลังเรียนรู้ระยะปกติ')
  })

  it('has no checks when wellness is not running for that person', () => {
    const [p] = toRoomPeople([person(1, { wellness: null })], new Set())
    expect(p.checks).toBeNull()
    expect(personWhat(p)).toBe('นั่ง · ระบบแจ้งเตือนไม่ได้ทำงาน')
  })
})

describe('todayCounts', () => {
  it('counts today alerts per named person and leaves unnamed people without a number', () => {
    const counts = todayCounts([record('สมชาย'), record('สมชาย'), record(null), record('สมหญิง')])
    expect(Object.fromEntries(counts)).toEqual({ สมชาย: 2, สมหญิง: 1 })

    const [named, unnamed, quiet] = toRoomPeople(
      [
        person(1, { face: { status: 'known', name: 'สมชาย', score: 1 } }),
        person(2),
        person(3, { face: { status: 'known', name: 'สมศรี', score: 1 } }),
      ],
      new Set(),
    )
    expect(todayCountOf(named, counts)).toBe(2)
    expect(todayCountOf(unnamed, counts)).toBeNull()
    expect(todayCountOf(quiet, counts)).toBe(0)
  })
})

describe('roster', () => {
  it('lists pending falls, then the fallen person, then people alerting, then everyone else by track id', () => {
    const people = toRoomPeople(
      [
        person(9),
        person(2),
        person(7, { wellness: wellness([alert('p7', 'posture', 7)]) }),
        person(5),
        person(3, { wellness: wellness([alert('p3', 'posture', 3)]) }),
      ],
      new Set(),
    )
    const rows = rosterRows([fall('f1', 5)], people)
    expect(rows.map((r) => (r.kind === 'fall' ? r.fall.alert.id : r.person.id))).toEqual(['f1', 5, 3, 7, 2, 9])
  })
})

describe('room status line', () => {
  const calm = toRoomPeople([person(1), person(2)], new Set())
  const alerting = toRoomPeople([person(1), person(2, { wellness: wellness([alert('x', 'posture', 2)]) })], new Set())

  it('puts a fall above everything else', () => {
    expect(roomStatus(1, alerting)).toEqual({ mark: 'ring', text: 'ตรวจพบการล้ม · เปิดภาพสดเพื่อตรวจสอบ', alert: true })
  })

  it('counts people alerting, calm rooms and empty rooms', () => {
    expect(roomStatus(0, alerting).text).toBe('มีคน 2 คน · เตือนอยู่ 1 คน')
    expect(roomStatus(0, calm)).toEqual({ mark: 'tick', text: 'มีคน 2 คน · ปกติทุกคน', alert: false })
    expect(roomStatus(0, [])).toEqual({ mark: 'empty', text: 'ว่าง', alert: false })
  })
})

describe('what line', () => {
  it('names each alert with how long it has lasted', () => {
    const [p] = toRoomPeople([person(1, { wellness: wellness([alert('a', 'posture', 1, { seconds: 90 })]) })], new Set())
    expect(personWhat(p)).toBe('ก้มคอ/ยื่นคอ (1 นาที)')
  })

  it('adds the sitting time only while sitting', () => {
    const sitting = toRoomPeople([person(1, { wellness: wellness([], { sitMinutes: 12.7 }) })], new Set())[0]
    const walking = toRoomPeople([person(1, { state: 'walking', wellness: wellness([], { sitMinutes: 12.7 }) })], new Set())[0]
    expect(personWhat(sitting)).toBe('ท่าทางปกติ · นั่ง · นั่งมา 12 นาที')
    expect(personWhat(walking)).toBe('ท่าทางปกติ · เดิน')
  })
})
