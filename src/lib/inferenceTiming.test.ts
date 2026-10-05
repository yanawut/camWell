import { describe, expect, it } from 'vitest'
import { updateInferenceEma } from './inferenceTiming'

describe('updateInferenceEma', () => {
  it('weights the old EMA at 0.9 and the new sample at 0.1', () => {
    expect(updateInferenceEma(40, 10)).toBeCloseTo(37)
  })

  it('starts from the zero-valued ref required by the ticket', () => {
    expect(updateInferenceEma(0, 20)).toBeCloseTo(2)
  })

  it('smooths successive inference samples without rounding the stored EMA', () => {
    const first = updateInferenceEma(0, 20)
    const second = updateInferenceEma(first, 30)

    expect(first).toBeCloseTo(2)
    expect(second).toBeCloseTo(4.8)
  })
})
