// ประเภทข้อมูลสำหรับฟีเจอร์ "Face Recognition" (ระบุตัวตนพนักงาน)
//
// ⚠️ ข้อควรระวังสำคัญ: face descriptor เป็นข้อมูลชีวภาพ (biometric data) ถือเป็นข้อมูลส่วนบุคคล
// ที่มีความอ่อนไหวภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ของไทย การใช้งานจริงในออฟฟิศต้อง:
//   1. ขอความยินยอม (consent) จากพนักงานอย่างชัดเจนก่อนลงทะเบียนใบหน้า
//   2. แจ้งวัตถุประสงค์การใช้ข้อมูลให้ชัดเจน และเก็บเท่าที่จำเป็น
//   3. มีสิทธิ์ให้พนักงานขอลบข้อมูลของตัวเองได้ตลอดเวลา
//
// (Phase 2) ย้ายจากเดิมที่เก็บ descriptor ไว้ใน localStorage ของเบราว์เซอร์เครื่องเดียวมาเป็น backend +
// SQLite กลาง (ดู camwell-backend/) — ข้อมูล descriptor ดิบจะไม่ถูกส่งกลับมาที่ browser อีกเลยหลังลงทะเบียน
// (type นี้จึงไม่มี field descriptor) การจับคู่ใบหน้าทำที่ backend ทั้งหมด ฝั่ง frontend ส่งแค่ descriptor ที่
// ตรวจพบตอนนั้นไปถาม แล้วรับ "ผลลัพธ์การจับคู่" กลับมาเท่านั้น (ดู services/faceEnrollment.ts)
// ยังไม่ใช่ระบบที่ผ่านกระบวนการขอความยินยอมที่ถูกต้องตามกฎหมายทุกขั้นตอน — ควรปรึกษาฝ่ายกฎหมาย/HR ก่อนนำไป
// ใช้งานจริงกับพนักงาน

/** พนักงาน 1 คนที่ลงทะเบียนใบหน้าไว้ — ข้อมูลสรุปที่ backend ส่งกลับมา ไม่มี descriptor ดิบติดมาด้วย */
export interface EnrolledPerson {
  id: string
  name: string
  enrolledAt: number
  /** เวลาที่ยืนยันว่าขอความยินยอมจากพนักงานแล้ว (null = ไม่มีบันทึกไว้ — ไม่ควรเกิดขึ้นถ้าลงทะเบียนผ่าน UI นี้) */
  consentGivenAt: number | null
}

export interface IdentityReading {
  timestamp: number
  /** จับคู่ได้หรือไม่ (null = ไม่พบหน้า, 'unknown' = พบหน้าแต่ไม่ตรงกับใครที่ลงทะเบียนไว้) */
  matchedPersonId: string | 'unknown' | null
  matchedPersonName: string | null
  /** ระยะห่างแบบ Euclidean ของ descriptor (ยิ่งน้อย = ยิ่งมั่นใจว่าใช่) — คำนวณที่ backend */
  distance: number | null
}
