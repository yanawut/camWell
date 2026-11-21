const MS_PER_MINUTE = 60_000

export interface BreakResetSliderModel {
  min: number
  max: number
  step: number
  value: number
}

export function getBreakResetSliderModel(breakResetMs: number): BreakResetSliderModel {
  return {
    min: 1,
    max: 15,
    step: 1,
    value: breakResetMs / MS_PER_MINUTE,
  }
}

export function breakResetMinutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE
}
