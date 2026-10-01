// ประเภทข้อมูลสำหรับโมดูล "ท่านั่ง" (คำนวณจาก MediaPipe Pose Landmarker)
// เหตุการณ์แจ้งเตือนใช้ AlertEvent กลางร่วมกับโมดูลอื่น ดู src/types/alerts.ts

/** จุด landmark เดียวจาก MediaPipe Pose Landmarker (ค่า x,y เป็นสัดส่วน 0-1 ของเฟรม) */
export interface Point {
  x: number
  y: number
  z?: number
  visibility?: number
}

/** สถานะท่านั่งขณะปัจจุบัน (คำนวณจากเฟรมล่าสุด) */
export type PostureIssueType = 'forward_head' | 'slouching' | 'leaning' | 'good' | 'no_person'

export interface PostureReading {
  timestamp: number
  issue: PostureIssueType
  neckAngleDeg: number
  torsoAngleDeg: number
  shoulderTiltDeg: number
}

/** ค่า threshold ที่ผู้ใช้ปรับได้จาก SettingsPanel */
export interface PostureThresholds {
  /** มุมคอเอียงไปข้างหน้าเกินเท่านี้ (องศา) ถือว่าเป็น forward head posture */
  neckAngleThresholdDeg: number
  /** มุมลำตัว/หลังเอียงเกินเท่านี้ (องศา) ถือว่าหลังค่อม/โน้มตัว */
  torsoAngleThresholdDeg: number
  /** มุมไหล่เอียงซ้าย-ขวาเกินเท่านี้ (องศา) ถือว่านั่งเอียงข้าง */
  shoulderTiltThresholdDeg: number
  /** ต้องนั่งท่าไม่ดีต่อเนื่องนานเท่านี้ (มิลลิวินาที) ก่อนจะแจ้งเตือนจริง กันแจ้งเตือนถี่เกินไป */
  sustainedMs: number
  /** ค่าความมั่นใจขั้นต่ำของ landmark ที่จะนำมาคำนวณ (0-1) */
  minVisibility: number
}

export const DEFAULT_THRESHOLDS: PostureThresholds = {
  neckAngleThresholdDeg: 25,
  torsoAngleThresholdDeg: 15,
  shoulderTiltThresholdDeg: 10,
  sustainedMs: 8000,
  minVisibility: 0.5,
}
