import { describe, it, expect } from 'vitest'
import { analyzeGaitSequence, type GaitSample } from './gaitAnalysis'

function baseSample(t: number, overrides: Partial<GaitSample> = {}): GaitSample {
  return {
    t,
    torsoHeight: 0.3,
    hipWidth: 0.12,
    shoulderTiltDeg: 1,
    pelvicTiltDeg: 1,
    pelvicTiltSignedDeg: 1,
    trunkLateralSwayNorm: 0.02,
    torsoForwardLeanDeg: 3,
    headDownPitchNorm: 0,
    ankleSepXNorm: 0.45,
    ankleDistHipRatio: 1.0,
    kneeDistHipRatio: 0.9,
    ankleDiffXNorm: Math.sin(t / 300) * 0.45,
    leftKneeAngleDeg: 170,
    rightKneeAngleDeg: 170,
    leftElbowAngleDeg: 165,
    rightElbowAngleDeg: 165,
    leftWristRelHipX: Math.sin(t / 300) * 0.3,
    rightWristRelHipX: -Math.sin(t / 300) * 0.3,
    leftAnkleY: 0.9,
    rightAnkleY: 0.9,
    leftToeBelowHeelNorm: 0,
    rightToeBelowHeelNorm: 0,
    hasFootLandmarks: true,
    ...overrides,
  }
}

describe('gaitAnalysis', () => {
  it('detects Trendelenburg and Parkinsonian patterns from gait samples', () => {
    const trendelenburgSamples = Array.from({ length: 30 }, (_, i) =>
      baseSample(i * 150, {
        pelvicTiltDeg: i % 6 === 0 ? 10 : 2,
      }),
    )
    const tRes = analyzeGaitSequence(trendelenburgSamples)
    expect(tRes.findings.some((f) => f.pattern === 'trendelenburg')).toBe(true)

    const parkinsonSamples = Array.from({ length: 30 }, (_, i) =>
      baseSample(i * 150, {
        ankleSepXNorm: 0.2,
        ankleDiffXNorm: Math.sin(i * 0.8) * 0.2,
        torsoForwardLeanDeg: 16,
        leftWristRelHipX: 0.03,
        rightWristRelHipX: -0.03,
      }),
    )
    const pRes = analyzeGaitSequence(parkinsonSamples)
    expect(pRes.findings.some((f) => f.pattern === 'parkinsonian')).toBe(true)
  })

  it('detects Scissor gait and Toe walking when knees cross or heels stay elevated', () => {
    const scissorToeSamples = Array.from({ length: 30 }, (_, i) =>
      baseSample(i * 150, {
        kneeDistHipRatio: 0.2,
        leftToeBelowHeelNorm: 0.08,
        rightToeBelowHeelNorm: 0.08,
      }),
    )
    const res = analyzeGaitSequence(scissorToeSamples)
    expect(res.findings.some((f) => f.pattern === 'scissor')).toBe(true)
    expect(res.findings.some((f) => f.pattern === 'toe_walking')).toBe(true)
  })
})
