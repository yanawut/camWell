// รายชื่อกล้องในเครื่อง (built-in + USB) ที่เบราว์เซอร์มองเห็นผ่าน navigator.mediaDevices
//
// หมายเหตุ: เบราว์เซอร์จะไม่คืนชื่ออุปกรณ์ (label) จริงจนกว่าจะเคยได้รับอนุญาตใช้กล้องมาก่อนอย่างน้อย 1 ครั้ง
// (ข้อจำกัดความเป็นส่วนตัวของเบราว์เซอร์) โค้ดนี้เลยขอสิทธิ์กล้องแบบสั้นๆ ก่อน (แล้วปิดสตรีมทิ้งทันที)
// เพื่อให้ enumerateDevices() คืนชื่อที่อ่านออกมาแทนที่จะเป็นรหัสเปล่าๆ

import { useCallback, useEffect, useState } from 'react'
import type { LocalCameraDevice } from '../types/cameraSource'

export function useCameraDevices() {
  const [devices, setDevices] = useState<LocalCameraDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // ขอสิทธิ์กล้องสั้นๆ ก่อน ถ้ายังไม่เคยอนุญาต (เพื่อให้ได้ label ของอุปกรณ์มาแสดง) แล้วปิดทิ้งทันที
      try {
        const primingStream = await navigator.mediaDevices.getUserMedia({ video: true })
        primingStream.getTracks().forEach((track) => track.stop())
      } catch {
        // ผู้ใช้ปฏิเสธสิทธิ์กล้อง หรือไม่มีกล้องเลย — ยังลอง enumerate ต่อได้ (จะได้ list ว่างหรือไม่มี label)
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = allDevices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `กล้อง (ไม่ทราบชื่อ) ${idx + 1}` }))
      setDevices(videoInputs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดึงรายชื่อกล้องไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // เลื่อนออกไปเป็น microtask แทนการเรียก refresh() (ซึ่งมี setState อยู่ต้นฟังก์ชัน) ตรงๆ แบบ synchronous
    // ใน effect — กัน cascading render ตามที่ linter เตือน
    queueMicrotask(() => void refresh())
  }, [refresh])

  return { devices, loading, error, refresh }
}
