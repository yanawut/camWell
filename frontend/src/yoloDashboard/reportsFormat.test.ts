import { describe, expect, it } from 'vitest'
import type { AlertRecord, DailyPerson, DailyReport, ReportSummary, WellCategory } from '../yoloConsole/types'
import {
  alertDuration,
  alertsCsv,
  alertView,
  axisTicks,
  cardFileName,
  clock,
  dailyCsv,
  filterPeople,
  hourText,
  plotScale,
  regionsText,
  share,
  stackHours,
  stateTotals,
  zoneTotals,
} from './reportsFormat'

const record = (id: string, category: WellCategory, extra: Partial<AlertRecord> = {}): AlertRecord => ({
  kind: 'alert',
  id,
  session: 's1',
  camera: 'cam-1',
  person: 4,
  name: null,
  category,
  type: category === 'fall' ? 'fall' : 'neck',
  text: 'คอยื่น',
  started_at: 1_700_000_000,
  ended_at: 1_700_000_090,
  seconds: 90,
  worst: {},
  ...extra,
})

const hour = (h: number, counts: Partial<Record<WellCategory, number>> = {}): DailyReport['hourly'][number] => ({
  hour: h,
  posture: 0,
  distance: 0,
  break: 0,
  fatigue: 0,
  fall: 0,
  ...counts,
})

const person = (label: string, level: DailyPerson['risk']['level'], extra: Partial<DailyPerson> = {}): DailyPerson => ({
  key: label,
  label,
  named: true,
  cameras: ['cam-1', 'cam-2'],
  segments: 1,
  first_at: null,
  last_at: null,
  present_seconds: 0,
  sitting_seconds: 0,
  alert_count: 0,
  types: [],
  by_category: { posture: 0, distance: 0, break: 0, fatigue: 0, fall: 0 },
  longest_sit_minutes: null,
  fell: false,
  risk: { score: 50, level, enough: true, parts: { posture: 0, sitting: 0, eyes: 0 } },
  regions: [],
  symptoms: [],
  advice: [],
  week: null,
  ...extra,
})

describe('alertView', () => {
  const all = [
    record('a', 'posture', { name: 'สมชาย' }),
    record('b', 'fall', { name: 'สมชาย' }),
    record('c', 'posture', { name: 'สมศรี' }),
    record('d', 'distance', { person: 9 }),
  ]

  it('counts every category for the chosen person while the table shows only the chosen category', () => {
    const view = alertView(all, 'สมชาย', 'posture')
    expect(view.total).toBe(2)
    expect(view.byCategory).toEqual({ posture: 1, distance: 0, break: 0, fatigue: 0, fall: 1 })
    expect(view.shown.map((a) => a.id)).toEqual(['a'])
  })

  it('shows every alert when nothing is filtered', () => {
    const view = alertView(all, '', '')
    expect(view.total).toBe(4)
    expect(view.shown).toHaveLength(4)
  })

  it('offers each person once, names an unknown face by its track number, and keeps a chosen person the new range lacks', () => {
    expect(alertView(all, '', '').people).toEqual(['คนที่ 9', 'สมชาย', 'สมศรี'])
    const view = alertView(all, 'สมหญิง', '')
    expect(view.people).toContain('สมหญิง')
    expect(view.shown).toEqual([])
  })
})

describe('alertDuration', () => {
  it('says "ทันที" for falls and yawns, which have no length', () => {
    expect(alertDuration(record('f', 'fall', { seconds: 12 }))).toBe('ทันที')
    expect(alertDuration(record('y', 'fatigue', { type: 'yawn', seconds: 40 }))).toBe('ทันที')
  })

  it('gives the length of a lasting alert and marks one still going', () => {
    expect(alertDuration(record('p', 'posture', { seconds: 150 }))).toBe('2 นาที')
    expect(alertDuration(record('p', 'posture', { seconds: null }))).toBe('กำลังเกิด')
  })
})

describe('alertsCsv', () => {
  it('writes a Thai header and one row per alert, leaving the end blank while it is still going', () => {
    const rows = alertsCsv([record('a', 'posture', { name: 'สมชาย', ended_at: null, seconds: 61.6, worst: { neck: 31.2 } })])
    expect(rows[0]).toEqual(['เวลาเริ่ม', 'เวลาจบ', 'บุคคล', 'กล้อง', 'หมวด', 'ประเภท', 'ระยะเวลา (วินาที)', 'ค่าที่แย่ที่สุด'])
    expect(rows[1].slice(1)).toEqual(['', 'สมชาย', 'cam-1', 'ท่านั่ง', 'คอยื่น', 62, 'คอเอียงหน้า 31°'])
  })
})

describe('stackHours', () => {
  it('stacks the categories of each hour from the bottom and leaves out the empty ones', () => {
    const { bars } = stackHours([hour(9, { posture: 2, fatigue: 1, fall: 1 })])
    expect(bars[0].total).toBe(4)
    expect(bars[0].segments).toEqual([
      { category: 'posture', from: 0, to: 2 },
      { category: 'fatigue', from: 2, to: 3 },
      { category: 'fall', from: 3, to: 4 },
    ])
  })

  it('scales to the busiest hour, and to 1 on a quiet day so the axis never divides by zero', () => {
    expect(stackHours([hour(8, { break: 3 }), hour(9, { posture: 5, distance: 2 })]).max).toBe(7)
    expect(stackHours([hour(0), hour(1)]).max).toBe(1)
  })
})

describe('hourText', () => {
  it('reads out the hour, its total and every category', () => {
    expect(hourText(hour(7, { posture: 2, fall: 1 }))).toBe(
      '07:00 · รวม 3 ครั้ง · ท่านั่ง 2 · ระยะจอ 0 · เวลานั่ง 0 · ความล้า 0 · การล้ม 1',
    )
  })
})

describe('plotScale', () => {
  const box = { width: 200, height: 100, left: 20, right: 10, top: 10, bottom: 20 }

  it('puts zero on the baseline and the largest value on the top edge', () => {
    const { x, y } = plotScale(box, 10, 4)
    expect(y(0)).toBe(80)
    expect(y(4)).toBe(10)
    expect(x(0)).toBe(20)
    expect(x(10)).toBe(190)
  })

  it('labels the axis at zero, the middle and the top without repeats', () => {
    expect(axisTicks(6)).toEqual([0, 3, 6])
    expect(axisTicks(1)).toEqual([0, 1])
  })
})

describe('filterPeople', () => {
  const people = [person('Somchai', 'high'), person('Somsri', 'low'), person('Mana', 'high')]

  it('keeps one risk level', () => {
    expect(filterPeople(people, 'high', '').map((p) => p.label)).toEqual(['Somchai', 'Mana'])
  })

  it('searches names ignoring case and stray spaces, together with the level', () => {
    expect(filterPeople(people, '', '  som ').map((p) => p.label)).toEqual(['Somchai', 'Somsri'])
    expect(filterPeople(people, 'low', 'SOM').map((p) => p.label)).toEqual(['Somsri'])
  })
})

describe('dailyCsv', () => {
  it('writes one row per person with minutes present, the Thai risk level and the symptoms found', () => {
    const report = {
      people: [
        person('สมชาย', 'medium', {
          present_seconds: 3570,
          alert_count: 3,
          by_category: { posture: 2, distance: 0, break: 1, fatigue: 0, fall: 0 },
          types: [{ type: 'neck', text: 'คอยื่น', category: 'posture', count: 2 }],
        }),
      ],
    } as DailyReport
    expect(dailyCsv(report)[1]).toEqual(['สมชาย', 'cam-1 cam-2', 60, 'ปานกลาง', 50, 3, 2, 0, 1, 0, 0, 'คอยื่น 2'])
  })
})

describe('room statistics text', () => {
  it('writes lengths as m:ss, or h:mm:ss past an hour', () => {
    expect(clock(75)).toBe('1:15')
    expect(clock(3725)).toBe('1:02:05')
  })

  it('gives each state as a share of the frames, and a dash when the person has none', () => {
    expect(share(1, 3)).toBe('33%')
    expect(share(0, 0)).toBe('–')
  })

  it('lists sitting, standing and walking in that order with missing states as zero, and zones by name', () => {
    const summary = {
      person_seconds_by_state: { walking: 12 },
      person_seconds_by_zone: { 'โซน B': 5, 'โซน A': 9 },
    } as unknown as ReportSummary
    expect(stateTotals(summary)).toEqual([['sitting', 0], ['standing', 0], ['walking', 12]])
    expect(zoneTotals(summary)).toEqual([['โซน A', 9], ['โซน B', 5]])
  })
})

describe('regionsText', () => {
  it('names the highlighted body regions in Thai, and says none when there are none', () => {
    expect(regionsText(['neck', 'lower_back', 'eyes'])).toBe('คอ, หลังส่วนล่าง, ตา')
    expect(regionsText([])).toBe('ไม่มี')
  })
})

describe('cardFileName', () => {
  it('replaces characters Windows forbids in file names', () => {
    expect(cardFileName('ก/ข:ค', '2026-11-21')).toBe('ก_ข_ค_2026-11-21.png')
  })
})
