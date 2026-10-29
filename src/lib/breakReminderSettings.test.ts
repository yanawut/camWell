import { describe, expect, it } from 'vitest'
import { breakResetMinutesToMs, getBreakResetSliderModel } from './breakReminderSettings'

describe('break reset slider settings', () => {
  it('uses the ticket range of 1-15 minutes and converts minutes to milliseconds', () => {
    expect(getBreakResetSliderModel(3 * 60 * 1000)).toEqual({
      min: 1,
      max: 15,
      step: 1,
      value: 3,
    })
    expect(breakResetMinutesToMs(1)).toBe(60_000)
    expect(breakResetMinutesToMs(15)).toBe(900_000)
  })
})
