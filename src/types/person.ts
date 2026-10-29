// สรุปสถานะของ "คนที่ตรวจจับได้ 1 คน" ในเฟรมปัจจุบัน ใช้ส่งจาก CameraStage ขึ้นไปแสดงผลที่ App
// (ตรงข้ามกับ AlertEvent ซึ่งเป็น "เหตุการณ์แจ้งเตือน 1 ครั้ง" — PersonSummary คือภาพรวม ณ ขณะนี้ของแต่ละคน)

export interface PersonSummary {
  /** trackId ภายใน (ไม่คงอยู่ข้ามเซสชัน - คนออกจากเฟรมนานแล้วกลับมาจะได้ id ใหม่) */
  trackId: string
  /** ชื่อจริง (ถ้า face recognition รู้จัก) ไม่งั้นเป็น "คนที่ N" ตามลำดับที่ตรวจพบ */
  label: string
  /** id พนักงานใน backend ถ้าระบุตัวตนได้แล้ว (null = ยังไม่รู้ว่าใคร) — คงที่ข้ามเซสชัน ต่างจาก trackId */
  employeeId: string | null
  postureStatus: string
  /** กำลังแจ้งเตือนท่านั่งอยู่ (ค้างนานเกินเกณฑ์แล้ว ไม่ใช่แค่ท่าไม่ดีชั่วขณะ) */
  postureAlertActive: boolean
  fatigueActive: boolean
  distanceActive: boolean
  yawnCount: number
}
