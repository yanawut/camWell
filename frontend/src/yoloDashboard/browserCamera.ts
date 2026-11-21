import { useEffect, useSyncExternalStore } from 'react'
import { yoloService } from '../yoloConsole/yoloService'
import type { SessionStatus } from '../yoloConsole/types'
import { errorText } from './errorText'

// กล้อง browser ของหน้าภาพรวม: เปิดให้เองเมื่อเข้าหน้า และปุ่ม "refresh กล้อง browser" ใช้สถานะชุดเดียวกัน
// yolo-backend มี session ได้ทีละอันเดียว การเปิดกล้องจึงแทนที่แหล่งภาพที่กำลังวิเคราะห์อยู่

export type AutoStartPlan = 'start' | 'leave'

const BUSY: readonly SessionStatus['state'][] = ['starting', 'running', 'paused', 'holding']

/**
 * ไม่มีอะไรวิเคราะห์อยู่ = เปิดกล้อง
 * กล้อง browser ค้างอยู่ = หน้าที่เคยส่งเฟรมถูกปิดหรือโหลดใหม่ไปแล้ว ภาพจึงหยุดนิ่ง ให้เปิดใหม่จากหน้านี้
 * แหล่งอื่น (วิดีโอ, go2rtc, Simulator) กำลังวิเคราะห์อยู่ = ไม่แย่ง เจ้าหน้าที่กด refresh เองได้
 */
export function autoStartPlan(status: Pick<SessionStatus, 'state' | 'source'>): AutoStartPlan {
  if (!BUSY.includes(status.state)) return 'start'
  return status.source?.kind === 'browser' ? 'start' : 'leave'
}

export interface CameraJob {
  pending: string | null
  error: string | null
}

let job: CameraJob = { pending: null, error: null }
const listeners = new Set<() => void>()

function setJob(next: CameraJob) {
  job = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useCameraJob = (): CameraJob => useSyncExternalStore(subscribe, () => job)

export async function startBrowserCamera(message: string) {
  if (job.pending) return
  setJob({ pending: message, error: null })
  try {
    await yoloService.startCamera()
    setJob({ pending: null, error: null })
  } catch (err) {
    setJob({ pending: null, error: errorText(err) })
  }
}

// yoloService ไม่มีคำสั่งอ่าน GET /api/session และหน้านี้ห้ามแก้ไฟล์ของ yolo-console จึงเรียกเอง (prefix /yolo เดียวกับ yoloService)
// ต้องถาม REST เพราะตอนต่อ /ws/live backend ส่งสถานะมาให้เฉพาะเมื่อเคยมี session มาก่อน
async function currentSession(): Promise<SessionStatus> {
  const res = await fetch('/yolo/api/session')
  if (!res.ok) throw new Error(`อ่านสถานะ session ไม่ได้ (${res.status})`)
  return (await res.json()) as SessionStatus
}

let autoStartTried = false

/** เปิดกล้องให้ครั้งเดียวต่อการโหลดหน้า — กลับมาหน้าภาพรวมอีกรอบ หรือหลังกด "จบ" จะไม่เปิดซ้ำเอง */
export function useAutoStartCamera(connected: boolean) {
  useEffect(() => {
    if (!connected || autoStartTried) return
    autoStartTried = true
    currentSession()
      .then((status) => {
        if (autoStartPlan(status) === 'start') void startBrowserCamera('กำลังเปิดกล้อง...')
      })
      .catch(() => {
        autoStartTried = false
      })
  }, [connected])
}
