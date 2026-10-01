// ตัวจับเวลา "นั่งต่อเนื่องนานแค่ไหน" ไม่เกี่ยวกับท่านั่งถูก/ผิด — แค่เตือนให้ลุกพักเป็นระยะ
// ทำงานอิสระจากโมดูลอื่น ใช้แค่สัญญาณ "ตอนนี้มีคนอยู่หน้าจอไหม" (reuse จาก pose/face detection ที่มีอยู่แล้ว)

import type { BreakReminderState, BreakThresholds } from '../types/wellbeing'

export const initialBreakState: BreakReminderState = {
  continuousSinceMs: null,
  reminderFiredForCurrentSession: false,
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
    // ไม่มีคนอยู่หน้าจอ — ถ้ายังไม่เคยบันทึกเวลาที่หายไป ให้ถือว่า "เริ่มพัก" จาก lastSeen เดิม
    // เพื่อความง่าย: ใช้ continuousSinceMs ค้างไว้ก่อน แล้วให้ตัวเรียกเป็นคนตัดสินใจรีเซ็ตเมื่อหายไปนานพอ
    // (ดูการ implement เต็มใน useBreakTracking.ts ที่ track lastPresentAt แยกต่างหาก)
    return { state, shouldRemind: false, continuousMinutes: 0 }
  }

  if (state.continuousSinceMs === null) {
    state.continuousSinceMs = now
    state.reminderFiredForCurrentSession = false
  }

  const elapsedMs = now - state.continuousSinceMs
  const continuousMinutes = Math.floor(elapsedMs / 60000)

  let shouldRemind = false
  if (elapsedMs >= thresholds.continuousSittingMs && !state.reminderFiredForCurrentSession) {
    state.reminderFiredForCurrentSession = true
    shouldRemind = true
  }

  return { state, shouldRemind, continuousMinutes }
}

/** รีเซ็ตตัวนับ เรียกเมื่อผู้ใช้หายไปจากกล้องนานเกิน breakResetMs (ถือว่าลุกไปพักแล้ว) หรือกดปุ่ม "พักแล้ว" เอง */
export function resetBreakTimer(): BreakReminderState {
  return { ...initialBreakState }
}
