// ประเภทข้อมูลสำหรับฟีเจอร์ "Face Recognition" (ระบุตัวตนพนักงาน)
//
// ⚠️ ข้อควรระวังสำคัญ: descriptor ใบหน้าเป็นข้อมูลชีวภาพ (biometric data) ถือเป็นข้อมูลส่วนบุคคล
// ที่มีความอ่อนไหวภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ของไทย การใช้งานจริงในออฟฟิศต้อง:
//   1. ขอความยินยอม (consent) จากพนักงานอย่างชัดเจนก่อนลงทะเบียนใบหน้า
//   2. แจ้งวัตถุประสงค์การใช้ข้อมูลให้ชัดเจน และเก็บเท่าที่จำเป็น
//   3. มีสิทธิ์ให้พนักงานขอลบข้อมูลของตัวเองได้ตลอดเวลา
// โค้ดชุดนี้ (Phase 1) เก็บ descriptor ไว้ใน localStorage ของเบราว์เซอร์เครื่องนั้นๆ เท่านั้น
// ไม่ส่งออกไปที่ใดเลย แต่ยังไม่ใช่ระบบที่ผ่านกระบวนการขอความยินยอมที่ถูกต้อง — ควรปรึกษาฝ่ายกฎหมาย/HR
// ก่อนนำไปใช้งานจริงกับพนักงาน

/** พนักงาน 1 คนที่ลงทะเบียนใบหน้าไว้ในเครื่องนี้ */
export interface EnrolledPerson {
  id: string
  name: string
  /** face descriptor 128 มิติจาก @vladmandic/face-api เก็บเป็น array ตัวเลขธรรมดาเพื่อ serialize ลง localStorage ได้ */
  descriptor: number[]
  enrolledAt: number
}

export interface IdentityReading {
  timestamp: number
  /** จับคู่ได้หรือไม่ (null = ไม่พบหน้า, 'unknown' = พบหน้าแต่ไม่ตรงกับใครที่ลงทะเบียนไว้) */
  matchedPersonId: string | 'unknown' | null
  matchedPersonName: string | null
  /** ระยะห่างแบบ Euclidean ของ descriptor (ยิ่งน้อย = ยิ่งมั่นใจว่าใช่) */
  distance: number | null
}

/** ค่า threshold ระยะห่าง descriptor ที่ยอมรับว่า "ใช่คนเดียวกัน" — ค่ามาตรฐานทั่วไปของ face-api คือ 0.6 */
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.55
