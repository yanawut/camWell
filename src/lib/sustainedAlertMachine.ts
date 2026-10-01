// State machine กลาง (ใช้ร่วมกันทุกหมวด: ท่านั่ง / ความเหนื่อยล้า / ระยะห่างจากจอ) ที่แปลง
// "สถานะรายเฟรม" ให้เป็น "เหตุการณ์แจ้งเตือน" กติกา: ต้องเจอปัญหาเดิมต่อเนื่องนานเกิน sustainedMs
// ก่อนถึงจะยิง alert จริง และต้องกลับมาปกติต่อเนื่องสักครู่ (HYSTERESIS_MS) ก่อนจะเคลียร์ alert กันการกระพริบ
//
// ออกแบบให้ metric ทุกตัวใน "metrics" เป็นแบบ "ค่ายิ่งสูง = ยิ่งแย่" เสมอ (ดู types/alerts.ts) เพื่อให้
// ใช้ max เป็นค่าบันทึกไว้แสดงผล ("แย่สุดระหว่างแจ้งเตือน") ได้แบบเดียวกันทุกหมวด ไม่ต้องเขียน logic ซ้ำ

import type { AlertCategory, AlertEvent, AlertType } from '../types/alerts'

const HYSTERESIS_MS = 1000
const NO_SIGNAL_GRACE_MS = 3000 // สัญญาณหาย (เช่น ไม่เห็นหน้า/ตัว) ชั่วคราว ไม่ถือว่าตัดเซสชัน

export interface SustainedAlertState {
  activeEvent: AlertEvent | null
  candidateIssue: AlertType | null
  candidateSince: number | null
  goodSince: number | null
  lastSignalAt: number | null
}

export const initialSustainedState: SustainedAlertState = {
  activeEvent: null,
  candidateIssue: null,
  candidateSince: null,
  goodSince: null,
  lastSignalAt: null,
}

/** สถานะที่คำนวณได้จาก 1 เฟรม: 'good' = ปกติ, 'no_signal' = ตรวจจับไม่ได้ (ไม่เห็นคน/หน้า), อื่นๆ = ชื่อปัญหา */
export interface SustainedReading {
  issue: AlertType | 'good' | 'no_signal'
  metrics: Record<string, number>
}

export interface SustainedStepResult {
  state: SustainedAlertState
  startedEvent?: AlertEvent
  endedEvent?: AlertEvent
}

let idCounter = 0
function nextId(category: AlertCategory) {
  idCounter += 1
  return `${category}-${Date.now()}-${idCounter}`
}

function mergeMetricsMax(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = { ...a }
  for (const key of Object.keys(b)) {
    merged[key] = Math.max(merged[key] ?? -Infinity, b[key])
  }
  return merged
}

export function stepSustainedAlert(
  prev: SustainedAlertState,
  reading: SustainedReading,
  now: number,
  category: AlertCategory,
  sustainedMs: number,
  personName?: string,
): SustainedStepResult {
  const state: SustainedAlertState = { ...prev }

  if (reading.issue === 'no_signal') {
    if (state.lastSignalAt && now - state.lastSignalAt < NO_SIGNAL_GRACE_MS) {
      return { state }
    }
    const ended = state.activeEvent ? { ...state.activeEvent, endedAt: now } : undefined
    return { state: { ...initialSustainedState }, endedEvent: ended }
  }

  state.lastSignalAt = now

  if (reading.issue === 'good') {
    state.candidateIssue = null
    state.candidateSince = null
    if (!state.goodSince) state.goodSince = now

    if (state.activeEvent && now - state.goodSince >= HYSTERESIS_MS) {
      const ended = { ...state.activeEvent, endedAt: now }
      state.activeEvent = null
      return { state, endedEvent: ended }
    }
    return { state }
  }

  // พบปัญหา
  state.goodSince = null

  if (state.candidateIssue !== reading.issue) {
    state.candidateIssue = reading.issue
    state.candidateSince = now
  }

  if (state.activeEvent) {
    state.activeEvent = {
      ...state.activeEvent,
      metrics: mergeMetricsMax(state.activeEvent.metrics, reading.metrics),
    }
    return { state }
  }

  const sustainedFor = state.candidateSince ? now - state.candidateSince : 0
  if (sustainedFor >= sustainedMs) {
    const started: AlertEvent = {
      id: nextId(category),
      category,
      type: reading.issue,
      startedAt: now,
      personName,
      metrics: reading.metrics,
    }
    state.activeEvent = started
    return { state, startedEvent: started }
  }

  return { state }
}
