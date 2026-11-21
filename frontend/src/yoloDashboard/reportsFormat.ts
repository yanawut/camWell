// ตัวเลขและข้อความของหน้าประวัติแจ้งเตือน รายงานประจำวัน และสถิติการใช้ห้อง — ไม่มี React เพื่อทดสอบได้ตรงๆ
import type {
  AlertRecord,
  DailyPerson,
  DailyReport,
  PersonState,
  Report,
  ReportSummary,
  RiskLevel,
  SourceKind,
  WellCategory,
} from '../yoloConsole/types'
import { CATEGORIES, CATEGORY_TEXT, describeWorst, formatDateTime, formatSeconds, LEVEL_TEXT, personName } from '../yoloConsole/wellness'

export type CsvRow = (string | number | null)[]

const pad2 = (n: number) => String(n).padStart(2, '0')

// ---------------------------------------------------------------- กราฟ

export interface PlotBox {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

/** แปลงค่าเป็นพิกัดในกรอบกราฟ: 0 อยู่ที่เส้นฐาน ค่าสูงสุดอยู่ขอบบน */
export function plotScale(box: PlotBox, xMax: number, yMax: number) {
  const w = box.width - box.left - box.right
  const h = box.height - box.top - box.bottom
  return {
    x: (v: number) => box.left + (v / Math.max(1, xMax)) * w,
    y: (v: number) => box.height - box.bottom - (v / Math.max(1, yMax)) * h,
  }
}

export const axisTicks = (max: number) => [...new Set([0, Math.round(max / 2), max])]

// ---------------------------------------------------------------- ประวัติแจ้งเตือน

export type CategoryFilter = WellCategory | ''

export interface AlertView {
  /** ตัวเลือกของช่อง "บุคคล" */
  people: string[]
  /** นับหลังกรองบุคคลแล้ว แต่ไม่กรองหมวด — ช่องหมวดในแถบสรุปจึงเห็นทุกหมวดพร้อมกันขณะกรองหมวดหนึ่งอยู่ */
  total: number
  byCategory: Record<WellCategory, number>
  /** แถวในตาราง: กรองทั้งบุคคลและหมวด */
  shown: AlertRecord[]
}

export const alertPerson = (a: Pick<AlertRecord, 'name' | 'person'>) => personName(a.name, a.person)

export function alertView(all: readonly AlertRecord[], person: string, category: CategoryFilter): AlertView {
  const names = new Set(all.map(alertPerson))
  // คนที่เลือกไว้ไม่มีในช่วงวันที่ใหม่ ก็ยังต้องอยู่ในรายการ ไม่อย่างนั้นช่องเลือกจะแสดง "ทุกคน" ทั้งที่ตารางยังกรองคนนั้นอยู่
  if (person) names.add(person)
  const mine = person ? all.filter((a) => alertPerson(a) === person) : [...all]
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<WellCategory, number>
  for (const a of mine) byCategory[a.category] += 1
  return {
    people: [...names].sort((a, b) => a.localeCompare(b, 'th')),
    total: mine.length,
    byCategory,
    shown: category ? mine.filter((a) => a.category === category) : mine,
  }
}

/** การล้มและการหาวเป็นเหตุการณ์ชั่วขณะ จึงไม่มีระยะเวลา */
export const alertDuration = (a: Pick<AlertRecord, 'category' | 'type' | 'seconds'>) =>
  a.category === 'fall' || a.type === 'yawn' ? 'ทันที' : formatSeconds(a.seconds)

export function alertsCsv(alerts: readonly AlertRecord[]): CsvRow[] {
  return [
    ['เวลาเริ่ม', 'เวลาจบ', 'บุคคล', 'กล้อง', 'หมวด', 'ประเภท', 'ระยะเวลา (วินาที)', 'ค่าที่แย่ที่สุด'],
    ...alerts.map((a) => [
      formatDateTime(a.started_at),
      a.ended_at === null ? '' : formatDateTime(a.ended_at),
      alertPerson(a),
      a.camera,
      CATEGORY_TEXT[a.category],
      a.text,
      a.seconds === null ? null : Math.round(a.seconds),
      describeWorst(a),
    ]),
  ]
}

// ---------------------------------------------------------------- รายงานประจำวัน

export const RISK_LEVELS: readonly RiskLevel[] = ['high', 'medium', 'low']

export function filterPeople(people: readonly DailyPerson[], level: RiskLevel | '', search: string) {
  const query = search.trim().toLowerCase()
  return people.filter((p) => (!level || p.risk.level === level) && (!query || p.label.toLowerCase().includes(query)))
}

export interface HourBar {
  hour: number
  total: number
  /** ช่วงของแต่ละหมวดในแท่งซ้อน เป็นจำนวนครั้ง เรียงจากล่างขึ้นบนตามลำดับ CATEGORIES */
  segments: { category: WellCategory; from: number; to: number }[]
}

export function stackHours(hourly: DailyReport['hourly']): { max: number; bars: HourBar[] } {
  const bars = hourly.map((h) => {
    let base = 0
    const segments = CATEGORIES.filter((c) => h[c] > 0).map((category) => {
      const from = base
      base += h[category]
      return { category, from, to: base }
    })
    return { hour: h.hour, total: base, segments }
  })
  return { max: Math.max(1, ...bars.map((b) => b.total)), bars }
}

export const hourLabel = (hour: number) => `${pad2(hour)}:00`

export function hourText(h: DailyReport['hourly'][number]) {
  const total = CATEGORIES.reduce((n, c) => n + h[c], 0)
  return [`${hourLabel(h.hour)}`, `รวม ${total} ครั้ง`, ...CATEGORIES.map((c) => `${CATEGORY_TEXT[c]} ${h[c]}`)].join(' · ')
}

export function dailyCsv(r: DailyReport): CsvRow[] {
  return [
    ['บุคคล', 'กล้อง', 'อยู่หน้ากล้อง (นาที)', 'ความเสี่ยง', 'คะแนน', 'แจ้งเตือน', ...CATEGORIES.map((c) => CATEGORY_TEXT[c]), 'อาการที่ตรวจพบ'],
    ...r.people.map((p) => [
      p.label,
      p.cameras.join(' '),
      Math.round(p.present_seconds / 60),
      LEVEL_TEXT[p.risk.level],
      p.risk.score,
      p.alert_count,
      ...CATEGORIES.map((c) => p.by_category[c]),
      p.types.map((t) => `${t.text} ${t.count}`).join('; '),
    ]),
  ]
}

const REGION_TEXT: Record<string, string> = {
  eyes: 'ตา',
  neck: 'คอ',
  upper_back: 'หลังส่วนบน',
  lower_back: 'หลังส่วนล่าง',
  legs: 'ขา',
  whole: 'ทั้งตัว',
}

/** จุดที่รูปคนในการ์ดทำเป็นสีแดง เป็นคำ สำหรับโปรแกรมอ่านหน้าจอ */
export const regionsText = (regions: readonly string[]) =>
  regions.length ? regions.map((r) => REGION_TEXT[r] ?? r).join(', ') : 'ไม่มี'

/** ชื่อไฟล์รูปการ์ด — ตัดตัวอักษรที่ Windows ห้ามใช้ในชื่อไฟล์ */
export const cardFileName = (label: string, date: string) => `${label}_${date}.png`.replace(/[\\/:*?"<>|]/g, '_')

// ---------------------------------------------------------------- สถิติการใช้ห้อง

export const STATE_TEXT: Record<PersonState, string> = { sitting: 'นั่ง', standing: 'ยืน', walking: 'เดิน' }
export const PERSON_STATES = Object.keys(STATE_TEXT) as PersonState[]

export const KIND_TEXT: Record<SourceKind, string> = {
  sim: 'Simulator',
  video: 'ไฟล์วิดีโอ',
  image: 'ไฟล์รูปภาพ',
  browser: 'กล้อง browser',
  go2rtc: 'go2rtc',
}

export const OUTCOME_TEXT: Record<string, string> = { ended: 'จบปกติ', error: 'มีปัญหา' }

/** วินาที → m:ss หรือ h:mm:ss */
export function clock(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = pad2(s % 60)
  return h ? `${h}:${pad2(m)}:${rest}` : `${m}:${rest}`
}

export const share = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '–')

export const sessionDateTime = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

export const sessionLength = (r: Pick<Report, 'started_at' | 'ended_at'>) => r.ended_at - r.started_at

export const stateTotals = (s: ReportSummary): [PersonState, number][] =>
  PERSON_STATES.map((state) => [state, s.person_seconds_by_state[state] ?? 0])

export const zoneTotals = (s: ReportSummary): [string, number][] =>
  Object.entries(s.person_seconds_by_zone).sort((a, b) => a[0].localeCompare(b[0], 'th'))
