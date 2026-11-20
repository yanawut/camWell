import { describe, it, expect } from 'vitest'
import {
  analyzeStandingFront,
  analyzeStandingSide,
  evaluateRombergTest,
  STANDING_LM,
  type RombergSample,
} from './standingPostureAnalysis'
import type { Point } from '../types/posture'

function blankLandmarks(): Point[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
}

describe('standingPostureAnalysis', () => {
  it('detects genu valgum, shoulder tilt, and pelvic tilt in front view', () => {
    const lm = blankLandmarks()
    lm[STANDING_LM.LEFT_SHOULDER] = { x: 0.4, y: 0.25, visibility: 0.9 }
    lm[STANDING_LM.RIGHT_SHOULDER] = { x: 0.6, y: 0.28, visibility: 0.9 } // tilted ~8.5 deg
    lm[STANDING_LM.LEFT_HIP] = { x: 0.44, y: 0.52, visibility: 0.9 }
    lm[STANDING_LM.RIGHT_HIP] = { x: 0.56, y: 0.54, visibility: 0.9 } // tilted ~9.5 deg
    lm[STANDING_LM.LEFT_KNEE] = { x: 0.47, y: 0.72, visibility: 0.9 }
    lm[STANDING_LM.RIGHT_KNEE] = { x: 0.53, y: 0.72, visibility: 0.9 } // dist 0.06
    lm[STANDING_LM.LEFT_ANKLE] = { x: 0.43, y: 0.9, visibility: 0.9 }
    lm[STANDING_LM.RIGHT_ANKLE] = { x: 0.57, y: 0.9, visibility: 0.9 } // dist 0.14 -> ratio 0.43

    const res = analyzeStandingFront(lm)
    expect(res).not.toBeNull()
    const keys = res!.findings.map((f) => f.key)
    expect(keys).toContain('scoliosis_proxy')
    expect(keys).toContain('leg_length_discrepancy')
    expect(keys).toContain('genu_valgum')
  })

  it('detects forward head, rounded shoulders, and genu recurvatum in side view', () => {
    const lm = blankLandmarks()
    lm[STANDING_LM.NOSE] = { x: 0.62, y: 0.2, visibility: 0.9 } // facing right
    lm[STANDING_LM.RIGHT_EAR] = { x: 0.59, y: 0.2, visibility: 0.9 }
    lm[STANDING_LM.RIGHT_SHOULDER] = { x: 0.52, y: 0.34, visibility: 0.9 } // forward of hip 0.46
    lm[STANDING_LM.RIGHT_HIP] = { x: 0.46, y: 0.56, visibility: 0.9 }
    lm[STANDING_LM.RIGHT_KNEE] = { x: 0.43, y: 0.75, visibility: 0.9 } // behind hip-ankle line (left of 0.46)
    lm[STANDING_LM.RIGHT_ANKLE] = { x: 0.47, y: 0.93, visibility: 0.9 }

    const res = analyzeStandingSide(lm)
    expect(res).not.toBeNull()
    const keys = res!.findings.map((f) => f.key)
    expect(keys).toContain('forward_head_standing')
    expect(keys).toContain('rounded_shoulders')
    expect(keys).toContain('genu_recurvatum')
  })

  it('classifies Romberg positive when sway increases sharply only with eyes closed', () => {
    const makeSamples = (amp: number): RombergSample[] =>
      Array.from({ length: 20 }, (_, i) => ({
        t: i * 100,
        centerX: 0.5 + (i % 2 === 0 ? amp : -amp),
        centerY: 0.4,
        torsoHeight: 0.3,
        stanceWidthRatio: 0.8,
      }))

    const result = evaluateRombergTest(makeSamples(0.002), makeSamples(0.015))
    expect(result.status).toBe('proprioceptive_suspect')
    expect(result.closedSwayIndex).toBeGreaterThan(result.openSwayIndex * 2)
  })
})
