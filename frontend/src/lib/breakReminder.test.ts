import { describe, expect, it } from 'vitest'
import { getBreakReminderLabel, initialBreakState, stepBreakReminder } from './breakReminder'
import type { BreakThresholds } from '../types/wellbeing'

const MIN = 60 * 1000
const thresholds: BreakThresholds = {
  continuousSittingMs: 45 * MIN,
  breakResetMs: 3 * MIN,
}

describe('getBreakReminderLabel', () => {
  it('uses คุณ for a single camera', () => {
    expect(getBreakReminderLabel(false, 'กล้อง 1')).toBe('คุณ')
  })

  it('uses the camera label for multi-camera reminders', () => {
    expect(getBreakReminderLabel(true, 'กล้อง 2')).toBe('คนที่นั่งหน้ากล้อง 2')
  })
})

describe('stepBreakReminder', () => {
  it('resets the sitting session after absence longer than breakResetMs', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    state = stepBreakReminder(state, true, 40 * MIN, thresholds).state
    state = stepBreakReminder(state, false, 44 * MIN, thresholds).state

    expect(state.continuousSinceMs).toBeNull()
  })

  it('resets at the exact breakResetMs boundary even when last presence was time zero', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    state = stepBreakReminder(state, false, 3 * MIN, thresholds).state

    expect(state.continuousSinceMs).toBeNull()
    expect(state.lastPresentAtMs).toBeNull()
  })

  it('keeps the same sitting session after a short 10 second absence', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    state = stepBreakReminder(state, true, 40 * MIN, thresholds).state
    state = stepBreakReminder(state, false, 40 * MIN + 10_000, thresholds).state
    const back = stepBreakReminder(state, true, 40 * MIN + 20_000, thresholds)

    expect(back.state.continuousSinceMs).toBe(0)
    expect(back.continuousMinutes).toBe(40)
  })

  it('fires the break reminder only once for the current sitting session', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    const first = stepBreakReminder(state, true, 45 * MIN, thresholds)
    state = first.state
    const second = stepBreakReminder(state, true, 45 * MIN + 100, thresholds)

    expect(first.shouldRemind).toBe(true)
    expect(second.shouldRemind).toBe(false)
  })
})
