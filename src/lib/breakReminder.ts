// ตัวจับเวลา "นั่งต่อเนื่องนานแค่ไหน" ไม่เกี่ยวกับท่านั่งถูก/ผิด — แค่เตือนให้ลุกพักเป็นระยะ
// ทำงานอิสระจากโมดูลอื่น ใช้แค่สัญญาณ "ตอนนี้มีคนอยู่หน้ากล้องไหม"
//
// กติกา:
//   - มีคนอยู่หน้ากล้อง → นับเวลานั่งต่อเนื่อง
//   - หายไปน้อยกว่า breakResetMs → ยังถือว่าเป็นรอบนั่งเดิม
//   - หายไปตั้งแต่ breakResetMs ขึ้นไป → ถือว่าพักแล้วและรีเซ็ตตัวนับ

import type { BreakReminderState, BreakThresholds } from '../types/wellbeing'

export const initialBreakState: BreakReminderState = {
  continuousSinceMs: null,
  lastPresentAtMs: null,
  reminderFiredForCurrentSession: false,
}

export function getBreakReminderLabel(multiCameraMode: boolean, cameraLabel: string): string {
  return multiCameraMode ? `คนที่นั่งหน้า${cameraLabel}` : 'คุณ'
}

export interface BreakStepResult {
  state: BreakReminderState
  /** true เฉพาะเฟรมที่เพิ่งครบเวลาและควรแสดงการแจ้งเตือน (edge-triggered ไม่ซ้ำทุกเฟรม) */
  shouldRemind: boolean
  /** นาทีที่นั่งต่อเนื่องมา ใช้แสดงผลในหน้าเว็บ */
  continuousMinutes: number
}

export function stepBreakReminder(
  prev: BreakReminderState,
  isPresent: boolean,
  now: number,
  thresholds: BreakThresholds,
): BreakStepResult {
  const state: BreakReminderState = { ...prev }

  if (!isPresent) {
    if (state.lastPresentAtMs !== null && now - state.lastPresentAtMs >= thresholds.breakResetMs) {
      return { state: resetBreakTimer(), shouldRemind: false, continuousMinutes: 0 }
    }

    return {
      state,
      shouldRemind: false,
      continuousMinutes: minutesSince(state.continuousSinceMs, now),
    }
  }

  state.lastPresentAtMs = now

  if (state.continuousSinceMs === null) {
    state.continuousSinceMs = now
    state.reminderFiredForCurrentSession = false
  }

  const elapsedMs = now - state.continuousSinceMs

  let shouldRemind = false
  if (elapsedMs >= thresholds.continuousSittingMs && !state.reminderFiredForCurrentSession) {
    state.reminderFiredForCurrentSession = true
    shouldRemind = true
  }

  return {
    state,
    shouldRemind,
    continuousMinutes: minutesSince(state.continuousSinceMs, now),
  }
}

function minutesSince(sinceMs: number | null, now: number): number {
  return sinceMs === null ? 0 : Math.floor((now - sinceMs) / 60000)
}

/** รีเซ็ตตัวนับเมื่อไม่มีคนอยู่หน้ากล้องนานถึง breakResetMs */
export function resetBreakTimer(): BreakReminderState {
  return { ...initialBreakState }
}
