// ประเภทแหล่งภาพกล้องที่เลือกได้
//
// 'local'    — กล้องที่เครื่องเห็นผ่าน getUserMedia ของเบราว์เซอร์ ครอบคลุมทั้งกล้องในตัวเครื่อง (built-in)
//              และกล้อง USB ต่อพ่วง — ทั้งสองแบบ OS จะรายงานเป็น "video input device" แบบเดียวกันหมด
//              เบราว์เซอร์แยกไม่ออกว่าอันไหน USB อันไหนในตัวเครื่อง ต้องดูจากชื่ออุปกรณ์ (label) เอาเอง
// 'ip-mjpeg' — กล้องเครือข่าย (IP Camera) ที่ส่งภาพแบบ MJPEG ผ่าน HTTP (เช่น http://192.168.1.50:8080/video)
//              เบราว์เซอร์แสดงผลสตรีมแบบนี้ได้ตรงๆ ผ่าน <img> โดยไม่ต้องมี backend
//              กล้องที่ส่งแค่ RTSP เบราว์เซอร์เปิดตรงไม่ได้ ให้ go2rtc แปลงภาพแล้วเลือกชนิด 'go2rtc' แทน
// 'go2rtc'   — ลิงก์ go2rtc: ดึงภาพจาก WebSocket ของ go2rtc ตรงจาก browser
export type CameraSourceKind = 'local' | 'ip-mjpeg' | 'go2rtc'

const CAMERA_SOURCE_KINDS: readonly CameraSourceKind[] = ['local', 'ip-mjpeg', 'go2rtc']

export interface CameraSource {
  kind: CameraSourceKind
  /** สำหรับ kind='local' — deviceId จาก navigator.mediaDevices.enumerateDevices() ไม่ระบุ = ใช้ค่าเริ่มต้นของเบราว์เซอร์ */
  deviceId?: string
  /** สำหรับ kind='ip-mjpeg' — URL ของสตรีม MJPEG เช่น http://192.168.1.50:8080/video */
  ipUrl?: string
  /** สำหรับ kind='go2rtc' — ลิงก์ go2rtc เช่น http://localhost:1984/stream.html?src=กล้อง */
  go2rtcUrl?: string
}

export function normalizeStreamUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null
  } catch {
    return null
  }
}

// ลิงก์หน้า go2rtc เช่น http://host:1984/stream.html?src=กล้อง -> ws://host:1984/api/ws?src=กล้อง (WebSocket ของ go2rtc เอง)
export function go2rtcBrowserSocketUrl(link: string): string | null {
  const url = new URL(link)
  const src = url.searchParams.get('src')
  if (!['http:', 'https:'].includes(url.protocol) || !src) return null
  const marker = url.pathname.indexOf('/api/')
  const prefix = marker >= 0 ? url.pathname.slice(0, marker) : url.pathname.slice(0, url.pathname.lastIndexOf('/'))
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}${prefix}/api/ws?src=${encodeURIComponent(src)}`
}

export const DEFAULT_CAMERA_SOURCE: CameraSource = { kind: 'local' }

/** กล้องที่บันทึกไว้ใน localStorage ด้วยชนิดที่เลิกรองรับแล้ว (เช่น 'rtsp') กลับไปใช้กล้องในเครื่อง */
export function restoreCameraSource(source: CameraSource): CameraSource {
  return CAMERA_SOURCE_KINDS.includes(source.kind) ? source : DEFAULT_CAMERA_SOURCE
}

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
