// ข้อความ/รูปแบบตัวเลขของการแจ้งเตือนสุขภาพ ใบหน้า และเสียงเตือน — พอร์ตจากต้นแบบ Cam-Well-YoLo-ByteTrack/frontend/src/lib/{wellness,faces,alertSound}.ts
import type { AlertRecord, DailyPerson, FaceCaptureResult, FacePose, LiveAlert, RiskLevel, WellCategory, WellnessSettings } from './types'

export const CATEGORY_TEXT: Record<WellCategory, string> = {
  posture: 'ท่านั่ง',
  distance: 'ระยะจอ',
  break: 'เวลานั่ง',
  fatigue: 'ความล้า',
  fall: 'การล้ม',
}
export const CATEGORIES = Object.keys(CATEGORY_TEXT) as WellCategory[]

export const personName = (name: string | null | undefined, id: number) => name || `คนที่ ${id}`

export function formatSeconds(seconds: number | null) {
  if (seconds === null) return 'กำลังเกิด'
  if (seconds < 1) return 'ทันที'
  if (seconds < 60) return `${Math.round(seconds)} วิ`
  const m = Math.floor(seconds / 60)
  return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม. ${m % 60} นาที`
}

export const liveDuration = (a: LiveAlert) => (a.moment ? 'ทันที' : formatSeconds(a.seconds))

const WORST: Record<string, (v: number) => string> = {
  neck: (v) => `คอเอียงหน้า ${Math.round(v)}°`,
  head_drop: (v) => `ศีรษะสูงกว่าไหล่ ${v.toFixed(2)}`,
  torso: (v) => `ลำตัวเอียง ${Math.round(v)}°`,
  tilt: (v) => `ไหล่เอียง ${Math.round(v)}°`,
  ratio: (v) => `หน้าใหญ่กว่าปกติ ×${v.toFixed(2)}`,
  minutes: (v) => `นั่ง ${Math.floor(v)} นาที`,
  seconds: (v) => `หลับตา ${v.toFixed(1)} วิ`,
  yawns: (v) => `หาว ${v} ครั้ง`,
  drop: (v) => `ร่วง ${Math.round(v * 100)}% ของความสูง`,
}
const WORST_FOR: Record<string, string[]> = {
  neck: ['neck', 'head_drop'],
  hunch: ['torso'],
  lean: ['tilt', 'torso'],
  close: ['ratio'],
  sit_long: ['minutes'],
  eyes_closed: ['seconds'],
  yawn: ['yawns'],
  fall: ['drop'],
  fall_vanish: ['drop'],
}

/** The worst values of an alert, in words. */
export function describeWorst(a: Pick<AlertRecord, 'type' | 'worst'>) {
  const keys = WORST_FOR[a.type] ?? Object.keys(a.worst)
  return keys
    .filter((k) => typeof a.worst[k] === 'number' && WORST[k])
    .map((k) => WORST[k](a.worst[k]))
    .join(', ')
}

export const formatDateTime = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

/** A CSV that Excel opens with Thai intact (UTF-8 with a byte order mark). */
export function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
  download(name, new Blob([text], { type: 'text/csv;charset=utf-8' }))
}

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const LEVEL_TEXT: Record<RiskLevel, string> = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' }
export const LEVEL_CLASS: Record<RiskLevel, string> = { high: 'yc-level-high', medium: 'yc-level-medium', low: 'yc-level-low' }

export const clockTime = (epoch: number | null) =>
  epoch ? new Date(epoch * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'

export function personText(p: DailyPerson, date: string) {
  const lines = [
    `รายงานสุขภาพการทำงาน ${new Date(`${date}T12:00:00`).toLocaleDateString('th-TH', { dateStyle: 'long' })}`,
    `${p.label}: ความเสี่ยง Office Syndrome ${LEVEL_TEXT[p.risk.level]} (${p.risk.score}/100)`,
    `อยู่หน้ากล้อง ${formatSeconds(p.present_seconds)} (${clockTime(p.first_at)}–${clockTime(p.last_at)})`,
    p.types.length
      ? `อาการที่ตรวจพบ: ${p.types.map((t) => `${t.text} ${t.count} ครั้ง`).join(', ')}`
      : 'ไม่พบอาการผิดปกติวันนี้',
    ...(p.symptoms.length ? [`แนวโน้มที่อาจเกิด: ${p.symptoms.join(' / ')}`] : []),
    `แนวทางดูแล: ${p.advice.join(' / ')}`,
    '(คัดกรองเบื้องต้นจากพฤติกรรม ไม่ใช่การวินิจฉัยทางการแพทย์)',
  ]
  return lines.join('\n')
}

/** Short timings to see every alert within a minute or two; not for real use. */
export const TEST_MODE: WellnessSettings = {
  posture_seconds: 5,
  distance_seconds: 5,
  distance_learn_seconds: 20,
  sit_minutes: 1,
  break_seconds: 15,
  eye_closed_seconds: 1.5,
  yawn_seconds: 1,
  yawn_count: 1,
}

export const isTestMode = (s: WellnessSettings | undefined) =>
  !!s && (Number(s.sit_minutes) < 10 || Number(s.posture_seconds) < 10)

export const POSE_TEXT: Record<FacePose, string> = {
  center: 'ตรง',
  left: 'หันซ้าย',
  right: 'หันขวา',
  up: 'เงย',
  down: 'ก้ม',
}
const REJECT_TEXT: Record<keyof FaceCaptureResult['rejected'], string> = {
  no_face: 'ไม่เห็นหน้า',
  many_faces: 'มีหลายคน',
  small: 'อยู่ไกลเกินไป',
  too_turned: 'หันข้างมากเกินไป',
  blurry: 'เบลอ',
  other_person: 'เป็นคนอื่น',
}

export function describeRejects(r: FaceCaptureResult) {
  const parts = Object.entries(r.rejected)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${REJECT_TEXT[k as keyof FaceCaptureResult['rejected']]} ${n}`)
  return parts.length ? `ตัดทิ้ง: ${parts.join(', ')}` : 'ไม่มีภาพที่ถูกตัดทิ้ง'
}

let ctx: AudioContext | null = null

/** Browsers only start audio after a click or key press on the page. */
export function audioReady() {
  return ctx?.state === 'running'
}

export async function unlockAudio() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
}

function tone(freq: number, start: number, length: number, volume: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(volume, start + 0.02)
  gain.gain.setValueAtTime(volume, start + length - 0.05)
  gain.gain.linearRampToValueAtTime(0, start + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + length)
}

/** Two soft notes: posture, distance, sitting time, fatigue. */
export function chime() {
  if (!audioReady()) return
  const t = ctx!.currentTime
  tone(880, t, 0.18, 0.15)
  tone(660, t + 0.22, 0.25, 0.15)
}

/** Loud alternating alarm for a fall. */
export function alarm() {
  if (!audioReady()) return
  const t = ctx!.currentTime
  for (let i = 0; i < 6; i++) tone(i % 2 ? 700 : 1050, t + i * 0.25, 0.22, 0.4)
}
