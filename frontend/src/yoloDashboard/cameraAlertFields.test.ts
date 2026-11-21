import { describe, expect, it } from 'vitest'
import type { WellnessSettings } from '../yoloConsole/types'
import { CATEGORIES, TEST_MODE } from '../yoloConsole/wellness'
import { ALERT_GROUPS, FACE_FIELD, hasInvalidField } from './cameraAlertFields'

const lowest: WellnessSettings = Object.fromEntries([
  ...[...ALERT_GROUPS.flatMap((g) => g.fields), FACE_FIELD].map((f) => [f.key, f.min]),
  ...ALERT_GROUPS.map((g) => [`${g.category}_on`, true]),
])

describe('alert threshold form', () => {
  it('accepts every field at its lowest allowed value', () => {
    expect(hasInvalidField(lowest)).toBe(false)
  })

  it('refuses a blank field', () => {
    expect(hasInvalidField({ ...lowest, sit_minutes: Number.NaN })).toBe(true)
  })

  it('refuses a value below the field’s minimum', () => {
    expect(hasInvalidField({ ...lowest, fall_angle: 19 })).toBe(true)
    expect(hasInvalidField({ ...lowest, min_face_px: 10 })).toBe(true)
  })

  it('still refuses a bad value in a category that is switched off', () => {
    expect(hasInvalidField({ ...lowest, fatigue_on: false, yawn_count: 0 })).toBe(true)
  })

  it('accepts the test mode timings', () => {
    expect(hasInvalidField({ ...lowest, ...TEST_MODE })).toBe(false)
  })

  it('has one box for every alert category', () => {
    expect(ALERT_GROUPS.map((g) => g.category).sort()).toEqual([...CATEGORIES].sort())
  })
})
