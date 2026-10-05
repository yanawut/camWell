// ฟังก์ชันช่วยคำนวณสำหรับตรวจจับการหกล้ม/ตกจากเก้าอี้ — แยกออกมาจาก CameraStage.tsx เพื่อให้ทดสอบ/อ่านง่าย
// แนวคิด: เก็บประวัติตำแหน่ง Y ของจุดกึ่งกลางไหล่ (normalized 0-1) ในหน้าต่างเวลาสั้นๆ แล้วเทียบจุดสูงสุด
// กับจุดล่าสุด — ถ้าร่วงลงเร็วเกิน threshold ภายในหน้าต่างนั้น ถือว่า "ร่วงตัวเร็วผิดปกติ"

export interface TorsoReading {
  t: number
  y: number
}

/** ตัดข้อมูลเก่าที่เกินหน้าต่างเวลาที่สนใจทิ้ง กันเก็บประวัติยาวไม่จำกัด */
export function pruneHistory(history: TorsoReading[], now: number, windowMs: number): TorsoReading[] {
  return history.filter((r) => now - r.t <= windowMs)
}

/**
 * คำนวณ "สัดส่วนที่ร่วงลง" ภายในประวัติที่เก็บไว้ — เทียบจุดที่สูงที่สุด (y น้อยสุด) กับจุดล่าสุด (y ปัจจุบัน)
 * คืนค่า null ถ้าข้อมูลยังไม่พอ (เพิ่งเริ่มเก็บ มีจุดเดียว)
 */
export function computeDropRatio(history: TorsoReading[]): number | null {
  if (history.length < 2) return null
  const latest = history[history.length - 1]
  let minY = latest.y
  for (const r of history) {
    if (r.y < minY) minY = r.y
  }
  return latest.y - minY
}

/**
 * คนที่เพิ่งร่วงตัวเร็วควรถูกแจ้งเตือนตอน track หลุด เมื่อ "เวลาที่เห็นครั้งสุดท้าย"
 * อยู่ภายใน grace window หลังสัญญาณ rapid drop โดยไม่ขึ้นกับเวลาที่ tracker ลบ track จริง
 */
export function shouldAlertLeftFrame(lastSeenAt: number, lastRapidDropAt: number, disappearGraceMs: number): boolean {
  return lastRapidDropAt > 0 && lastSeenAt - lastRapidDropAt <= disappearGraceMs
}
