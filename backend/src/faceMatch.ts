// คำนวณว่า face descriptor ที่ส่งมาตรงกับพนักงานคนไหนที่ลงทะเบียนไว้ — ย้ายมาจากฝั่ง browser
// (src/services/faceEnrollment.ts เดิมของ frontend) เพื่อไม่ให้ raw descriptor ของทุกคนต้องถูกส่งออกไป
// ให้ทุกเครื่อง/ทุกกล้องในออฟฟิศถืออยู่ในเบราว์เซอร์ — เก็บไว้บน backend ที่เดียว ส่งแค่ "ผลลัพธ์การจับคู่" กลับไป

// ค่ามาตรฐานทั่วไปของ face-api คือ 0.6 — ใช้ 0.55 ให้เข้มกว่าเล็กน้อยกันจับคู่ผิดคน (ค่าเดิมจากตอนทำฝั่ง client)
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.55

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

export interface DescriptorCandidate {
  employeeId: string
  employeeName: string
  descriptor: number[]
}

export interface MatchResult {
  employeeId: string
  employeeName: string
  distance: number
}

/**
 * หา descriptor ที่ใกล้เคียงที่สุดจากทุก candidate (พนักงาน 1 คนอาจมีหลาย descriptor ถ้าลงทะเบียนซ้ำหลายครั้ง
 * — เทียบกับทุกอันแล้วเอาระยะทางที่น้อยที่สุดของแต่ละคน) คืนค่า null ถ้าไม่มี candidate เลย หรือไม่มีใคร
 * ใกล้พอ (ระยะทาง <= threshold)
 */
export function findBestMatch(descriptor: number[], candidates: DescriptorCandidate[]): MatchResult | null {
  let best: MatchResult | null = null
  for (const candidate of candidates) {
    const distance = euclideanDistance(candidate.descriptor, descriptor)
    if (!best || distance < best.distance) {
      best = { employeeId: candidate.employeeId, employeeName: candidate.employeeName, distance }
    }
  }
  if (!best || best.distance > FACE_MATCH_DISTANCE_THRESHOLD) return null
  return best
}
