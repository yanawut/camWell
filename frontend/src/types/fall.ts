// เกณฑ์การตรวจจับ "การหกล้ม/ตกจากเก้าอี้" — ใช้ pose landmarks ที่มีอยู่แล้ว ไม่ต้องโหลดโมเดลเพิ่ม
// เป็น edge-triggered event (ตรวจครั้งเดียวแจ้งครั้งเดียว) ไม่ใช่ sustained state แบบท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ

export interface FallThresholds {
  /** หน้าต่างเวลาที่ใช้ดูว่า "ร่วงตัวเร็ว" แค่ไหน (ms) */
  dropWindowMs: number
  /** สัดส่วนตำแหน่ง Y (normalized 0-1 ของเฟรม) ที่ร่วงลงภายใน dropWindowMs แล้วถือว่าเร็วผิดปกติ */
  dropRatioThreshold: number
  /** มุมลำตัวจากแนวตั้ง (องศา) ที่เมื่อเกินถือว่าลำตัว "ราบ/ใกล้แนวนอน" แบบคนล้ม */
  fallTorsoAngleDeg: number
  /** ห้ามแจ้งเตือนซ้ำสำหรับคนเดิมถี่กว่านี้ (ms) กันแจ้งรัวจากเหตุการณ์เดียวกัน */
  cooldownMs: number
  /** ถ้าร่วงตัวเร็วแล้วหายไปจากเฟรมภายในเวลานี้ (ms) ถือว่าสงสัยหกล้ม/ตกจากเก้าอี้จนหลุดมุมกล้อง */
  disappearGraceMs: number
}

export const DEFAULT_FALL_THRESHOLDS: FallThresholds = {
  dropWindowMs: 700,
  dropRatioThreshold: 0.2,
  fallTorsoAngleDeg: 55,
  cooldownMs: 15000,
  disappearGraceMs: 2500,
}
