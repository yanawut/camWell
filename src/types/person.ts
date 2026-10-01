// สรุปสถานะของ "คนที่ตรวจจับได้ 1 คน" ในเฟรมปัจจุบัน ใช้ส่งจาก CameraStage ขึ้นไปแสดงผลที่ App
// (ตรงข้ามกับ AlertEvent ซึ่งเป็น "เหตุการณ์แจ้งเตือน 1 ครั้ง" — PersonSummary คือภาพรวม ณ ขณะนี้ของแต่ละคน)

export interface PersonSummary {
  /** trackId ภายใน (ไม่คงอยู่ข้ามเซสชัน - คนออกจากเฟรมนานแล้วกลับมาจะได้ id ใหม่) */
  trackId: string
  /** ชื่อจริง (ถ้า face recognition รู้จัก) ไม่งั้นเป็น "คนที่ N" ตามลำดับที่ตรวจพบ */
  label: string
  postureStatus: string
  fatigueActive: boolean
  distanceActive: boolean
  yawnCount: number
}
