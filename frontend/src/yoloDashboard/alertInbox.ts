import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useYoloLive } from '../yoloConsole/useYoloLive'
import { alarm, chime, personName, unlockAudio } from '../yoloConsole/wellness'
import type { LiveAlert } from '../yoloConsole/types'

// การล้มที่ยังไม่มีใครรับทราบ — ใช้ร่วมกันทุกหน้า: แถบแดงบนสุดของทุกหน้า แถวในตารางคนในห้อง และเสียงเตือนดังซ้ำ
// yolo-backend เอาการล้มออกจากแผงสดหลัง 120 วินาที (wellness.py moment_show_seconds) ที่นี่จึงจำไว้เองจนกว่าจะกดรับทราบ

export interface PendingFall {
  alert: LiveAlert
  /** เวลาตามนาฬิกาเครื่องที่หน้านี้เห็นการล้มครั้งแรก (ms) — startedAt ของ backend เป็นเวลาของแหล่งภาพ ไม่ใช่เวลาจริง */
  seenAt: number
}

export interface AlertInbox {
  falls: PendingFall[]
  acked: ReadonlySet<string>
  muted: boolean
}

const MUTED_KEY = 'camwell:yolo-dashboard:sound-muted:v1'
const ALARM_REPEAT_MS = 5000
const NO_ALERTS: LiveAlert[] = []

function readMuted() {
  try {
    return window.localStorage.getItem(MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function fallMessage(alert: LiveAlert) {
  const who = personName(alert.name, alert.person)
  return alert.type === 'fall_vanish'
    ? `${who} ร่วงลงแล้วหายจากภาพ อาจหกล้ม กรุณาตรวจสอบด่วน`
    : `สงสัยว่า ${who} หกล้มหรือตกจากเก้าอี้ กรุณาตรวจสอบด่วน`
}

/** เพิ่มการล้มใหม่ที่ยังไม่ได้รับทราบต่อท้ายรายการ คืน falls เดิมถ้าไม่มีอะไรใหม่ */
export function mergeFalls(falls: PendingFall[], acked: ReadonlySet<string>, alerts: LiveAlert[], now: number): PendingFall[] {
  const known = new Set(falls.map((f) => f.alert.id))
  const fresh = alerts.filter((a) => a.category === 'fall' && !acked.has(a.id) && !known.has(a.id))
  return fresh.length ? [...falls, ...fresh.map((alert) => ({ alert, seenAt: now }))] : falls
}

let inbox: AlertInbox = { falls: [], acked: new Set(), muted: readMuted() }
const listeners = new Set<() => void>()

function update(next: AlertInbox) {
  inbox = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAlertInbox(): AlertInbox {
  return useSyncExternalStore(subscribe, () => inbox)
}

export function ackAlert(id: string) {
  update({ ...inbox, acked: new Set(inbox.acked).add(id), falls: inbox.falls.filter((f) => f.alert.id !== id) })
}

export function setMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTED_KEY, String(muted))
  } catch {
    // เก็บค่าไม่ได้ก็ยังปิดเสียงในหน้านี้ได้
  }
  update({ ...inbox, muted })
}

/**
 * เรียกครั้งเดียวที่ราก /?yolo-dashboard: รับการแจ้งเตือนสดเข้ากล่อง และเล่นเสียง
 * การแจ้งเตือนใหม่ = เสียงสั้นสองโน้ต การล้ม = เสียงเตือนดังซ้ำทุก 5 วินาทีจนกว่าจะกดรับทราบครบ
 */
export function useAlertFeed() {
  const alerts = useYoloLive((s) => s.panel?.alerts ?? NO_ALERTS)
  const { falls, muted } = useAlertInbox()
  const heard = useRef(new Set<string>())

  useEffect(() => {
    const merged = mergeFalls(inbox.falls, inbox.acked, alerts, Date.now())
    if (merged !== inbox.falls) update({ ...inbox, falls: merged })
    let fall = false
    let other = false
    for (const a of alerts) {
      if (heard.current.has(a.id)) continue
      heard.current.add(a.id)
      if (a.category === 'fall') fall = true
      else other = true
    }
    if (inbox.muted) return
    if (fall) alarm()
    else if (other) chime()
  }, [alerts])

  const urgent = !muted && falls.length > 0
  useEffect(() => {
    if (!urgent) return
    const timer = setInterval(alarm, ALARM_REPEAT_MS)
    return () => clearInterval(timer)
  }, [urgent])

  // เบราว์เซอร์ยอมเปิดเสียงหลังผู้ใช้คลิกหรือกดแป้นในหน้าเท่านั้น
  useEffect(() => {
    const unlock = () => void unlockAudio().then(() => update({ ...inbox }))
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
}
