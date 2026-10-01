// ประเภทแหล่งภาพกล้องที่เลือกได้
//
// 'local'    — กล้องที่เครื่องเห็นผ่าน getUserMedia ของเบราว์เซอร์ ครอบคลุมทั้งกล้องในตัวเครื่อง (built-in)
//              และกล้อง USB ต่อพ่วง — ทั้งสองแบบ OS จะรายงานเป็น "video input device" แบบเดียวกันหมด
//              เบราว์เซอร์แยกไม่ออกว่าอันไหน USB อันไหนในตัวเครื่อง ต้องดูจากชื่ออุปกรณ์ (label) เอาเอง
// 'ip-mjpeg' — กล้องเครือข่าย (IP Camera) ที่ส่งภาพแบบ MJPEG ผ่าน HTTP (เช่น http://192.168.1.50:8080/video)
//              เบราว์เซอร์แสดงผลสตรีมแบบนี้ได้ตรงๆ ผ่าน <img> โดยไม่ต้องมี backend
//              ⚠️ กล้อง IP/CCTV ส่วนใหญ่ (Hikvision, Dahua ฯลฯ) ใช้ RTSP เป็นค่าเริ่มต้น ซึ่งเบราว์เซอร์
//              เปิดสตรีม RTSP ตรงๆ ไม่ได้เลย (ไม่มี RTSP client ในเบราว์เซอร์) — ต้องมี backend แปลงสตรีม
//              (เช่น ffmpeg/go2rtc แปลง RTSP -> MJPEG หรือ HLS) ก่อน ซึ่งเป็นงาน Phase 2 ยังไม่รองรับในเวอร์ชันนี้
export type CameraSourceKind = 'local' | 'ip-mjpeg'

export interface CameraSource {
  kind: CameraSourceKind
  /** สำหรับ kind='local' — deviceId จาก navigator.mediaDevices.enumerateDevices() ไม่ระบุ = ใช้ค่าเริ่มต้นของเบราว์เซอร์ */
  deviceId?: string
  /** สำหรับ kind='ip-mjpeg' — URL ของสตรีม MJPEG เช่น http://192.168.1.50:8080/video */
  ipUrl?: string
}

export const DEFAULT_CAMERA_SOURCE: CameraSource = { kind: 'local' }

export interface LocalCameraDevice {
  deviceId: string
  label: string
}

// ต่อกล้องได้พร้อมกันหลายตัว (grid) — แต่ละกล้องมี CameraStage/โมเดล AI เป็นของตัวเอง (ตรวจจับแยกกันอิสระ)
// จำกัดไว้ไม่เกิน MAX_CAMERA_SLOTS เพราะแต่ละกล้องรันโมเดล pose + face แยกชุด ยิ่งเพิ่มยิ่งกินทรัพยากรเครื่อง
export const MAX_CAMERA_SLOTS = 2

export interface CameraSlot {
  /** รหัสภายในของกล้องตัวนี้ (ไม่ใช่ deviceId ของฮาร์ดแวร์) ใช้แยกสถานะ/ติดตามคนของกล้องแต่ละตัวให้ไม่ปนกัน */
  id: string
  /** ชื่อกล้อง/ตำแหน่งที่แสดงบนหน้าเว็บ เช่น "กล้อง 1" — ใช้กำกับว่าเหตุการณ์แจ้งเตือนมาจากกล้องไหนเมื่อมีมากกว่า 1 ตัว */
  label: string
  source: CameraSource
}

export function createCameraSlot(id: string, label: string): CameraSlot {
  return { id, label, source: DEFAULT_CAMERA_SOURCE }
}
