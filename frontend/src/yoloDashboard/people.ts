import type { FacePair, FacePerson, FacePose } from '../yoloConsole/types'

// กติกาของหน้ารายชื่อบุคคล (?yolo-dashboard=people) ที่ไม่ต้องใช้ React

/** ส่งได้ครั้งละไม่เกินเท่านี้ ตาม MAX_PHOTOS_PER_REQUEST ของ yolo-backend */
export const MAX_PHOTOS = 20

/** นามสกุลไฟล์ที่ yolo-backend รับ (PHOTO_EXTS) — ไฟล์อื่นทำให้ทั้งคำขอถูกปฏิเสธ จึงคัดออกตั้งแต่ตอนเลือก */
const PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']

export const isPhotoFile = (name: string) => PHOTO_EXTS.some((ext) => name.toLowerCase().endsWith(ext))

export const PHOTO_EXTS_TEXT = PHOTO_EXTS.join(' ')

/** ถ่ายจากกล้องใหม่แทนชุดที่ถ่ายไว้ก่อน แต่รูปที่เลือกจากไฟล์ยังอยู่ */
export function withCameraShots<T extends { pose?: FacePose }>(picked: T[], shots: T[]): T[] {
  return [...picked.filter((p) => !p.pose), ...shots].slice(0, MAX_PHOTOS)
}

export function consentCounts(people: FacePerson[]) {
  const consented = people.filter((p) => p.consentAt !== null).length
  return { total: people.length, consented, missing: people.length - consented }
}

// ---------------------------------------------------------------- ฟอร์มเพิ่มคน

export interface EnrolDraft {
  name: string
  consent: boolean
  photos: number
  cameraOpen: boolean
}

export type EnrolGap = 'name' | 'consent' | 'photos' | 'camera'

export const ENROL_GAP_TEXT: Record<EnrolGap, string> = {
  name: 'ใส่ชื่อ',
  consent: 'ติ๊กยืนยันความยินยอม',
  photos: 'เลือกรูปหรือถ่ายจากกล้องอย่างน้อย 1 รูป',
  camera: 'ถ่ายให้เสร็จหรือกด "ปิดกล้อง"',
}

const ENROL_CHECKS: [EnrolGap, (d: EnrolDraft) => boolean][] = [
  ['name', (d) => d.name.trim() !== ''],
  ['consent', (d) => d.consent],
  ['photos', (d) => d.photos > 0],
  ['camera', (d) => !d.cameraOpen],
]

/** สิ่งที่ยังขาดก่อนกดบันทึกได้ เรียงตามลำดับในฟอร์ม — ว่าง = บันทึกได้ */
export const enrolGaps = (draft: EnrolDraft): EnrolGap[] =>
  ENROL_CHECKS.filter(([, done]) => !done(draft)).map(([gap]) => gap)

// ---------------------------------------------------------------- ความแม่นยำ

export const THRESHOLD_MIN = 0.15
export const THRESHOLD_MAX = 0.85

/** คู่ที่ต่ำกว่าเกณฑ์ไม่เกินเท่านี้ยังควรดูให้ดี */
export const NEAR = 0.1

// เกณฑ์ลบ NEAR เป็นทศนิยมที่คลาดเล็กน้อย (0.45 - 0.1 = 0.35000000000000003) คะแนนที่อยู่บนขอบพอดีจึงต้องมีที่เผื่อ
const EPS = 1e-9

export const sameThreshold = (a: number, b: number) => Math.abs(a - b) < EPS

export type PairLevel = 'risky' | 'near' | 'apart'

export const PAIR_LEVEL_TEXT: Record<PairLevel, string> = {
  risky: 'เสี่ยงจำสลับ',
  near: 'ใกล้เกณฑ์',
  apart: 'แยกกันได้',
}

export function pairLevel(score: number, threshold: number): PairLevel {
  if (score >= threshold - EPS) return 'risky'
  if (score >= threshold - NEAR - EPS) return 'near'
  return 'apart'
}

/**
 * ค่าแนะนำ: สูงกว่าคู่ที่หน้าคล้ายกันที่สุด NEAR แต่ไม่ต่ำกว่าค่าเริ่มต้นและไม่เกินปลายแถบเลื่อน
 * pairs มาจาก yolo-backend เรียงจากคล้ายที่สุดแล้ว
 */
export function suggestedThreshold(pairs: FacePair[], defaultThreshold: number) {
  const top = pairs[0]?.score
  if (top === undefined) return defaultThreshold
  return Math.min(THRESHOLD_MAX, Math.max(defaultThreshold, Math.round((top + NEAR) * 100) / 100))
}

export interface PhotoMark {
  photo: string
  /** ความเหมือนเฉลี่ยกับรูปอื่นของคนเดียวกัน — null = มีรูปเดียว หรือยังไม่ได้เทียบ */
  score: number | null
  /** ต่ำกว่าเกณฑ์: รูปเบลอ หันข้าง หรือเป็นหน้าคนอื่น */
  odd: boolean
}

export function markPhotos(
  photos: string[],
  scores: Record<string, number | null> | undefined,
  threshold: number | null,
): PhotoMark[] {
  return photos.map((photo) => {
    const score = scores?.[photo] ?? null
    return { photo, score, odd: threshold !== null && score !== null && score < threshold }
  })
}
