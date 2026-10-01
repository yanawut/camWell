// ประเภทข้อมูลสำหรับโมดูล "ความเหนื่อยล้า" (fatigue) "ระยะห่างจากจอ" (distance) และ "เตือนพัก" (break)
// ทั้งหมดคำนวณจาก @vladmandic/face-api (ใบหน้า 68 จุด + กรอบใบหน้า) ซึ่งรันในเบราว์เซอร์ล้วนๆ เช่นกัน

export type FatigueIssueType = 'drowsy' | 'frequent_yawning' | 'good' | 'no_face'

export interface FatigueReading {
  timestamp: number
  issue: FatigueIssueType
  /** Eye Aspect Ratio เฉลี่ย 2 ข้าง — ยิ่งต่ำ = ตายิ่งหลับ (ลืมตาปกติ ~0.25-0.35, หลับ ~0.05-0.15) */
  eyeAspectRatio: number
  /** คะแนนตาหลับ แปลงจาก EAR ให้ "ยิ่งสูง = ยิ่งแย่" (0 = ลืมตาเต็มที่, 1 = หลับสนิท) */
  eyeClosedScore: number
  /** Mouth Aspect Ratio — ยิ่งสูง = อ้าปากกว้าง (หาว) */
  mouthAspectRatio: number
  /** จำนวนครั้งที่หาว นับสะสมตั้งแต่เริ่มเซสชัน */
  yawnCount: number
}

export interface FatigueThresholds {
  /** eyeClosedScore สูงกว่านี้ถือว่า "เริ่มหลับตา" */
  eyeClosedThreshold: number
  /** ต้องหลับตาต่อเนื่องนานเท่านี้ (ms) ก่อนแจ้งเตือนว่าง่วง/หลับใน */
  drowsySustainedMs: number
  /** mouthAspectRatio สูงกว่านี้ถือว่ากำลังหาว (ไม่ใช่แค่พูด/หัวเราะ) */
  yawnMarThreshold: number
  /** ต้องอ้าปากกว้างต่อเนื่องนานเท่านี้ (ms) ถึงจะนับเป็น 1 ครั้งหาว (กันนับมั่วตอนพูด) */
  yawnMinDurationMs: number
  /** หาวกี่ครั้งขึ้นไปในช่วง yawnWindowMs ถึงจะถือว่า "หาวถี่ผิดปกติ" */
  yawnCountThreshold: number
  /** ช่วงเวลาที่นับความถี่การหาว (ms) */
  yawnWindowMs: number
}

export const DEFAULT_FATIGUE_THRESHOLDS: FatigueThresholds = {
  eyeClosedThreshold: 0.6,
  drowsySustainedMs: 2000,
  yawnMarThreshold: 0.55,
  yawnMinDurationMs: 1200,
  yawnCountThreshold: 3,
  yawnWindowMs: 10 * 60 * 1000, // 10 นาที
}

export type DistanceIssueType = 'too_close' | 'good' | 'no_face'

export interface DistanceReading {
  timestamp: number
  issue: DistanceIssueType
  /** ขนาดใบหน้าปัจจุบัน (พิกเซล, ความกว้างกรอบใบหน้า) หารด้วยค่า baseline ที่ calibrate ไว้ — ยิ่งสูง = ยิ่งใกล้จอ */
  relativeSize: number | null
}

export interface DistanceThresholds {
  /** relativeSize สูงกว่านี้ถือว่านั่งใกล้จอเกินไป (เทียบกับตอน calibrate) */
  tooCloseRatio: number
  sustainedMs: number
}

export const DEFAULT_DISTANCE_THRESHOLDS: DistanceThresholds = {
  tooCloseRatio: 1.35,
  sustainedMs: 5000,
}

/** สถานะตัวจับเวลานั่งต่อเนื่อง สำหรับเตือนพัก */
export interface BreakReminderState {
  /** เวลาที่เริ่มนับว่านั่งต่อเนื่อง (epoch ms) — null ถ้าตอนนี้ไม่มีคนอยู่หน้าจอ */
  continuousSinceMs: number | null
  /** แจ้งเตือนเตือนพักไปแล้วสำหรับรอบปัจจุบันหรือยัง (กันแจ้งซ้ำรัว ๆ) */
  reminderFiredForCurrentSession: boolean
}

export interface BreakThresholds {
  /** ต้องนั่งต่อเนื่องนานเท่านี้ (ms) ก่อนเตือนให้พัก */
  continuousSittingMs: number
  /** ถ้าลุกจากจอต่อเนื่องนานเท่านี้ (ms) ถือว่า "พักแล้ว" รีเซ็ตตัวนับ */
  breakResetMs: number
}

export const DEFAULT_BREAK_THRESHOLDS: BreakThresholds = {
  continuousSittingMs: 45 * 60 * 1000, // 45 นาที
  breakResetMs: 3 * 60 * 1000, // ลุกไป 3 นาทีถือว่าพักแล้ว
}
