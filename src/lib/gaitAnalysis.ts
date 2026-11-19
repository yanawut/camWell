// วิเคราะห์รูปแบบการเดิน (Gait Analysis) จากลำดับเฟรม BlazePose 33 จุด (3–12 วินาทีขณะเดิน)
// รองรับการคัดกรองแนวโน้มรูปแบบการเดินที่เข้าข่าย 12 รูปแบบตามหลักเวชศาสตร์ฟื้นฟู/ประสาทวิทยา
// หมายเหตุ: เป็นเครื่องมือคัดกรองเชิงพฤติกรรมเบื้องต้นจากภาพ 2D ไม่ใช่การวินิจฉัยโรค

import type { Point } from '../types/posture'
import { isVisible, midOrVisible } from './postureAnalysis'
import { jointAngleDeg } from './standingPostureAnalysis'

export type GaitPatternId =
  | 'antalgic'
  | 'trendelenburg'
  | 'steppage'
  | 'hemiplegic'
  | 'parkinsonian'
  | 'ataxic'
  | 'sensory_ataxic'
  | 'scissor'
  | 'waddling'
  | 'magnetic'
  | 'toe_walking'
  | 'short_leg'

export type GaitConfidence = 'low' | 'moderate' | 'high'

export interface GaitSample {
  t: number
  torsoHeight: number
  hipWidth: number
  shoulderTiltDeg: number
  pelvicTiltDeg: number
  /** signed pelvic tilt (+ = ขวาต่ำกว่าซ้าย, - = ซ้ายต่ำกว่าขวา) */
  pelvicTiltSignedDeg: number
  trunkLateralSwayNorm: number
  torsoForwardLeanDeg: number
  headDownPitchNorm: number
  ankleSepXNorm: number
  ankleDistHipRatio: number | null
  kneeDistHipRatio: number | null
  /** signed (leftAnkle.x - rightAnkle.x) / torsoHeight เพื่อจับรอบก้าว */
  ankleDiffXNorm: number
  leftKneeAngleDeg: number | null
  rightKneeAngleDeg: number | null
  leftElbowAngleDeg: number | null
  rightElbowAngleDeg: number | null
  leftWristRelHipX: number | null
  rightWristRelHipX: number | null
  leftAnkleY: number
  rightAnkleY: number
  /** > 0 เมื่อปลายเท้าอยู่ต่ำกว่าส้นเท้า (ใช้ร่วมกันทั้งกรณีปลายเท้าตกขณะยกขา และเขย่งปลายเท้าขณะยืน) */
  leftToeBelowHeelNorm: number | null
  rightToeBelowHeelNorm: number | null
  hasFootLandmarks: boolean
}

export interface GaitMetricsSummary {
  sampleCount: number
  durationSec: number
  stepCount: number
  cadenceSpm: number
  avgStrideNorm: number
  avgStepWidthRatio: number | null
  minKneeDistRatio: number | null
  stanceAsymmetryRatio: number
  pelvicDropDegMax: number
  trunkSwayRangeNorm: number
  meanTorsoLeanDeg: number
  armSwingAsymmetry: number | null
  meanArmSwingNorm: number | null
  footLandmarksAvailable: boolean
}

export interface GaitFinding {
  pattern: GaitPatternId
  labelTh: string
  confidence: GaitConfidence
  observedSignTh: string
  commonCausesTh: string
}

export interface GaitAnalysisResult {
  metrics: GaitMetricsSummary
  findings: GaitFinding[]
  summaryNoteTh: string
}

const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function rangeOf(values: readonly number[]): number {
  if (values.length < 2) return 0
  let min = values[0]
  let max = values[0]
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return max - min
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function extractGaitSample(
  landmarks: readonly Point[] | undefined,
  t: number,
  minVisibility = 0.45,
): GaitSample | null {
  if (!landmarks || landmarks.length < 29) return null

  const lShoulder = landmarks[LM.LEFT_SHOULDER]
  const rShoulder = landmarks[LM.RIGHT_SHOULDER]
  const lHip = landmarks[LM.LEFT_HIP]
  const rHip = landmarks[LM.RIGHT_HIP]
  const lAnkle = landmarks[LM.LEFT_ANKLE]
  const rAnkle = landmarks[LM.RIGHT_ANKLE]

  const shoulderMid = midOrVisible(lShoulder, rShoulder, minVisibility)
  const hipMid = midOrVisible(lHip, rHip, minVisibility)
  if (!shoulderMid || !hipMid || !isVisible(lAnkle, minVisibility) || !isVisible(rAnkle, minVisibility)) {
    return null
  }

  const torsoHeight = Math.hypot(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y)
  if (torsoHeight < 0.06) return null

  const hipsBothVisible = isVisible(lHip, minVisibility) && isVisible(rHip, minVisibility)
  const shouldersBothVisible = isVisible(lShoulder, minVisibility) && isVisible(rShoulder, minVisibility)
  const hipWidth = hipsBothVisible ? Math.abs(lHip.x - rHip.x) : torsoHeight * 0.35

  const shoulderTiltDeg = shouldersBothVisible
    ? (Math.atan2(Math.abs(lShoulder.y - rShoulder.y), Math.max(1e-4, Math.abs(lShoulder.x - rShoulder.x))) * 180) /
      Math.PI
    : 0
  const pelvicTiltSignedDeg = hipsBothVisible
    ? (Math.atan2(rHip.y - lHip.y, Math.max(1e-4, Math.abs(lHip.x - rHip.x))) * 180) / Math.PI
    : 0
  const pelvicTiltDeg = Math.abs(pelvicTiltSignedDeg)

  const trunkLateralSwayNorm = (shoulderMid.x - hipMid.x) / Math.max(hipWidth, 0.04)
  const torsoForwardLeanDeg =
    (Math.atan2(Math.abs(shoulderMid.x - hipMid.x), Math.max(1e-4, hipMid.y - shoulderMid.y)) * 180) / Math.PI

  const earMid = midOrVisible(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR], minVisibility)
  const nose = landmarks[LM.NOSE]
  const headDownPitchNorm =
    earMid && isVisible(nose, minVisibility) ? (nose.y - earMid.y) / torsoHeight : 0

  const ankleSepXNorm = Math.abs(lAnkle.x - rAnkle.x) / torsoHeight
  const ankleDiffXNorm = (lAnkle.x - rAnkle.x) / torsoHeight

  const ankleDistHipRatio = hipsBothVisible && hipWidth > 0.03 ? Math.abs(lAnkle.x - rAnkle.x) / hipWidth : null
  const lKnee = landmarks[LM.LEFT_KNEE]
  const rKnee = landmarks[LM.RIGHT_KNEE]
  const kneeBothVisible = isVisible(lKnee, minVisibility) && isVisible(rKnee, minVisibility)
  const kneeDistHipRatio =
    hipsBothVisible && kneeBothVisible && hipWidth > 0.03 ? Math.abs(lKnee.x - rKnee.x) / hipWidth : null

  const leftKneeAngleDeg =
    isVisible(lHip, minVisibility) && isVisible(lKnee, minVisibility)
      ? jointAngleDeg(lHip, lKnee, lAnkle)
      : null
  const rightKneeAngleDeg =
    isVisible(rHip, minVisibility) && isVisible(rKnee, minVisibility)
      ? jointAngleDeg(rHip, rKnee, rAnkle)
      : null

  const lElbow = landmarks[LM.LEFT_ELBOW]
  const rElbow = landmarks[LM.RIGHT_ELBOW]
  const lWrist = landmarks[LM.LEFT_WRIST]
  const rWrist = landmarks[LM.RIGHT_WRIST]

  const leftElbowAngleDeg =
    isVisible(lShoulder, minVisibility) && isVisible(lElbow, minVisibility) && isVisible(lWrist, minVisibility)
      ? jointAngleDeg(lShoulder, lElbow, lWrist)
      : null
  const rightElbowAngleDeg =
    isVisible(rShoulder, minVisibility) && isVisible(rElbow, minVisibility) && isVisible(rWrist, minVisibility)
      ? jointAngleDeg(rShoulder, rElbow, rWrist)
      : null

  const leftWristRelHipX = isVisible(lWrist, minVisibility) ? (lWrist.x - hipMid.x) / torsoHeight : null
  const rightWristRelHipX = isVisible(rWrist, minVisibility) ? (rWrist.x - hipMid.x) / torsoHeight : null

  const lHeel = landmarks[LM.LEFT_HEEL]
  const rHeel = landmarks[LM.RIGHT_HEEL]
  const lToe = landmarks[LM.LEFT_FOOT_INDEX]
  const rToe = landmarks[LM.RIGHT_FOOT_INDEX]
  const hasFootLandmarks =
    isVisible(lHeel, minVisibility) &&
    isVisible(rHeel, minVisibility) &&
    isVisible(lToe, minVisibility) &&
    isVisible(rToe, minVisibility)

  const leftToeBelowHeelNorm = hasFootLandmarks ? (lToe.y - lHeel.y) / torsoHeight : null
  const rightToeBelowHeelNorm = hasFootLandmarks ? (rToe.y - rHeel.y) / torsoHeight : null

  return {
    t,
    torsoHeight,
    hipWidth,
    shoulderTiltDeg,
    pelvicTiltDeg,
    pelvicTiltSignedDeg,
    trunkLateralSwayNorm,
    torsoForwardLeanDeg,
    headDownPitchNorm,
    ankleSepXNorm,
    ankleDistHipRatio,
    kneeDistHipRatio,
    ankleDiffXNorm,
    leftKneeAngleDeg,
    rightKneeAngleDeg,
    leftElbowAngleDeg,
    rightElbowAngleDeg,
    leftWristRelHipX,
    rightWristRelHipX,
    leftAnkleY: lAnkle.y,
    rightAnkleY: rAnkle.y,
    leftToeBelowHeelNorm,
    rightToeBelowHeelNorm,
    hasFootLandmarks,
  }
}

function countStepsFromCycles(samples: readonly GaitSample[]): {
  stepCount: number
  peakStrides: number[]
  leftLeadTimeMs: number
  rightLeadTimeMs: number
} {
  let stepCount = 0
  const peakStrides: number[] = []
  let prevSign = 0
  let currentMaxSep = 0
  let leftLeadTimeMs = 0
  let rightLeadTimeMs = 0

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]
    const dt = i > 0 ? Math.max(0, s.t - samples[i - 1].t) : 0
    if (s.ankleDiffXNorm > 0.04) leftLeadTimeMs += dt
    else if (s.ankleDiffXNorm < -0.04) rightLeadTimeMs += dt

    currentMaxSep = Math.max(currentMaxSep, s.ankleSepXNorm)
    const sign = s.ankleDiffXNorm > 0.06 ? 1 : s.ankleDiffXNorm < -0.06 ? -1 : 0
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) {
      stepCount += 1
      peakStrides.push(currentMaxSep)
      currentMaxSep = 0
      prevSign = sign
    } else if (sign !== 0 && prevSign === 0) {
      prevSign = sign
    }
  }

  // fallback สำหรับมุมกล้องหน้าตรงที่ X ไม่สลับข้าง: นับรอบจากความต่างความสูงข้อเท้า (ยกเท้าซ้าย-ขวา)
  if (stepCount < 2) {
    let ySteps = 0
    let prevYSign = 0
    for (const s of samples) {
      const diffY = (s.leftAnkleY - s.rightAnkleY) / s.torsoHeight
      const sign = diffY > 0.03 ? 1 : diffY < -0.03 ? -1 : 0
      if (sign !== 0 && prevYSign !== 0 && sign !== prevYSign) {
        ySteps += 1
        prevYSign = sign
      } else if (sign !== 0 && prevYSign === 0) {
        prevYSign = sign
      }
    }
    stepCount = Math.max(stepCount, ySteps)
  }

  return { stepCount, peakStrides, leftLeadTimeMs, rightLeadTimeMs }
}

export function analyzeGaitSequence(samples: readonly GaitSample[]): GaitAnalysisResult {
  if (samples.length < 10) {
    return {
      metrics: {
        sampleCount: samples.length,
        durationSec: 0,
        stepCount: 0,
        cadenceSpm: 0,
        avgStrideNorm: 0,
        avgStepWidthRatio: null,
        minKneeDistRatio: null,
        stanceAsymmetryRatio: 0,
        pelvicDropDegMax: 0,
        trunkSwayRangeNorm: 0,
        meanTorsoLeanDeg: 0,
        armSwingAsymmetry: null,
        meanArmSwingNorm: null,
        footLandmarksAvailable: false,
      },
      findings: [],
      summaryNoteTh: 'ต้องเก็บข้อมูลขณะเดินอย่างน้อย 3–5 วินาที (เห็นลำตัวและข้อเท้าชัดเจน)',
    }
  }

  const durationMs = Math.max(1, samples[samples.length - 1].t - samples[0].t)
  const durationSec = durationMs / 1000
  const { stepCount, peakStrides, leftLeadTimeMs, rightLeadTimeMs } = countStepsFromCycles(samples)
  const cadenceSpm = durationSec > 0 ? Math.round((stepCount / durationSec) * 60) : 0
  const avgStrideNorm =
    peakStrides.length > 0 ? meanOf(peakStrides) : meanOf(samples.map((s) => s.ankleSepXNorm))

  const stepWidthRatios = samples.map((s) => s.ankleDistHipRatio).filter((v): v is number => v !== null)
  const avgStepWidthRatio = stepWidthRatios.length > 0 ? meanOf(stepWidthRatios) : null

  const kneeRatios = samples.map((s) => s.kneeDistHipRatio).filter((v): v is number => v !== null)
  const minKneeDistRatio = kneeRatios.length > 0 ? Math.min(...kneeRatios) : null

  const totalLeadMs = leftLeadTimeMs + rightLeadTimeMs
  const stanceAsymmetryRatio =
    totalLeadMs > 0 ? Math.abs(leftLeadTimeMs - rightLeadTimeMs) / totalLeadMs : 0

  const pelvicDropDegMax = Math.max(...samples.map((s) => s.pelvicTiltDeg))
  const trunkSwayRangeNorm = rangeOf(samples.map((s) => s.trunkLateralSwayNorm))
  const meanTorsoLeanDeg = meanOf(samples.map((s) => s.torsoForwardLeanDeg))

  const leftSwings = samples.map((s) => s.leftWristRelHipX).filter((v): v is number => v !== null)
  const rightSwings = samples.map((s) => s.rightWristRelHipX).filter((v): v is number => v !== null)
  const leftSwingRange = leftSwings.length >= 4 ? rangeOf(leftSwings) : null
  const rightSwingRange = rightSwings.length >= 4 ? rangeOf(rightSwings) : null
  const meanArmSwingNorm =
    leftSwingRange !== null && rightSwingRange !== null ? (leftSwingRange + rightSwingRange) / 2 : null
  const armSwingAsymmetry =
    leftSwingRange !== null && rightSwingRange !== null && Math.max(leftSwingRange, rightSwingRange) > 0.05
      ? Math.abs(leftSwingRange - rightSwingRange) / Math.max(leftSwingRange, rightSwingRange)
      : null

  const leftElbows = samples.map((s) => s.leftElbowAngleDeg).filter((v): v is number => v !== null)
  const rightElbows = samples.map((s) => s.rightElbowAngleDeg).filter((v): v is number => v !== null)
  const elbowAsymDeg =
    leftElbows.length >= 4 && rightElbows.length >= 4 ? Math.abs(meanOf(leftElbows) - meanOf(rightElbows)) : 0

  const leftKnees = samples.map((s) => s.leftKneeAngleDeg).filter((v): v is number => v !== null)
  const rightKnees = samples.map((s) => s.rightKneeAngleDeg).filter((v): v is number => v !== null)
  const kneeRangeDiffDeg =
    leftKnees.length >= 4 && rightKnees.length >= 4 ? Math.abs(rangeOf(leftKnees) - rangeOf(rightKnees)) : 0

  const footLandmarksAvailable = samples.some((s) => s.hasFootLandmarks)
  const findings: GaitFinding[] = []

  // 1. Antalgic gait
  if (stanceAsymmetryRatio >= 0.25 && pelvicDropDegMax < 8) {
    findings.push({
      pattern: 'antalgic',
      labelTh: 'Antalgic gait (เดินกะเผลก ลงน้ำหนักข้างหนึ่งสั้นกว่าปกติ)',
      confidence: stanceAsymmetryRatio >= 0.4 ? 'high' : 'moderate',
      observedSignTh: `ความไม่สมมาตรของช่วงก้าว ${(stanceAsymmetryRatio * 100).toFixed(0)}%`,
      commonCausesTh: 'ปวดข้อสะโพก เข่า หรือข้อเท้า',
    })
  }

  // 2. Trendelenburg gait
  if (pelvicDropDegMax >= 7.5 && trunkSwayRangeNorm < 0.45) {
    findings.push({
      pattern: 'trendelenburg',
      labelTh: 'Trendelenburg gait (สะโพกเอียงตกขณะลงน้ำหนักขาเดียว)',
      confidence: pelvicDropDegMax >= 11 ? 'high' : 'moderate',
      observedSignTh: `เชิงกรานเอียงตกสูงสุด ${pelvicDropDegMax.toFixed(1)}°`,
      commonCausesTh: 'กล้ามเนื้อสะโพก (Gluteus medius) อ่อนแรง',
    })
  }

  // 3. Steppage gait (ต้องมีจุดเท้าจาก MediaPipe)
  const toeDrops = samples
    .flatMap((s) => [s.leftToeBelowHeelNorm, s.rightToeBelowHeelNorm])
    .filter((v): v is number => v !== null)
  const maxAnkleLift = Math.max(
    rangeOf(samples.map((s) => s.leftAnkleY / s.torsoHeight)),
    rangeOf(samples.map((s) => s.rightAnkleY / s.torsoHeight)),
  )
  if (footLandmarksAvailable && toeDrops.length > 0) {
    const maxToeDrop = Math.max(...toeDrops)
    if (maxToeDrop >= 0.085 && maxAnkleLift >= 0.14) {
      findings.push({
        pattern: 'steppage',
        labelTh: 'Steppage gait (ยกเข่าสูง ปลายเท้าตก)',
        confidence: maxToeDrop >= 0.12 ? 'high' : 'moderate',
        observedSignTh: 'ปลายเท้าชี้ตกขณะยกขาสูงเพื่อไม่ให้ปลายเท้าลากพื้น',
        commonCausesTh: 'ข้อเท้าตก (Foot drop), เส้นประสาท Peroneal เสียหาย',
      })
    }
  }

  // 4. Hemiplegic gait
  if (
    armSwingAsymmetry !== null &&
    armSwingAsymmetry >= 0.45 &&
    (elbowAsymDeg >= 20 || kneeRangeDiffDeg >= 18)
  ) {
    findings.push({
      pattern: 'hemiplegic',
      labelTh: 'Hemiplegic gait (แขนข้างหนึ่งงอ/แกว่งน้อย ร่วมกับขาไม่สมมาตร)',
      confidence: armSwingAsymmetry >= 0.65 && elbowAsymDeg >= 30 ? 'high' : 'moderate',
      observedSignTh: `ความต่างการแกว่งแขน ${(armSwingAsymmetry * 100).toFixed(0)}% · มุมข้อศอกต่าง ${elbowAsymDeg.toFixed(0)}°`,
      commonCausesTh: 'ภาวะอ่อนแรงครึ่งซีก เช่น หลังโรคหลอดเลือดสมอง',
    })
  }

  // 5. Parkinsonian gait
  if (
    avgStrideNorm > 0 &&
    avgStrideNorm <= 0.34 &&
    meanTorsoLeanDeg >= 10 &&
    (meanArmSwingNorm === null || meanArmSwingNorm <= 0.22)
  ) {
    findings.push({
      pattern: 'parkinsonian',
      labelTh: 'Parkinsonian gait (ก้าวสั้น ตัวโน้มหน้า แขนไม่แกว่ง)',
      confidence: meanTorsoLeanDeg >= 15 && avgStrideNorm <= 0.25 ? 'high' : 'moderate',
      observedSignTh: `ก้าวสั้น (${avgStrideNorm.toFixed(2)} เท่าลำตัว) · ตัวโน้มหน้า ${meanTorsoLeanDeg.toFixed(1)}°`,
      commonCausesTh: 'โรคพาร์กินสัน หรือความผิดปกติของระบบสั่งการการเคลื่อนไหว',
    })
  }

  // 6. Ataxic gait
  const strideVariability = peakStrides.length >= 3 ? stdDev(peakStrides) : 0
  if (avgStepWidthRatio !== null && avgStepWidthRatio >= 1.55 && (trunkSwayRangeNorm >= 0.28 || strideVariability >= 0.08)) {
    findings.push({
      pattern: 'ataxic',
      labelTh: 'Ataxic gait (ฐานกว้าง เดินเซ ก้าวไม่สม่ำเสมอ)',
      confidence: avgStepWidthRatio >= 1.85 ? 'high' : 'moderate',
      observedSignTh: `ฐานก้าวกว้าง ${avgStepWidthRatio.toFixed(2)} เท่าของสะโพก · ตัวเซ ${(trunkSwayRangeNorm * 100).toFixed(0)}%`,
      commonCausesTh: 'สมองน้อยผิดปกติ หรือผลจากแอลกอฮอล์/ยา',
    })
  }

  // 7. Sensory ataxic gait
  const avgHeadDown = meanOf(samples.map((s) => s.headDownPitchNorm))
  if (maxAnkleLift >= 0.16 && avgHeadDown >= 0.1 && (avgStepWidthRatio === null || avgStepWidthRatio >= 1.35)) {
    findings.push({
      pattern: 'sensory_ataxic',
      labelTh: 'Sensory ataxic gait (ยกเท้าสูงและก้มมองเท้าขณะเดิน)',
      confidence: 'low',
      observedSignTh: 'ยกข้อเท้าสูงกว่าปกติร่วมกับศีรษะก้มมองพื้น',
      commonCausesTh: 'ปลายประสาทเสื่อม, ขาดวิตามิน B12',
    })
  }

  // 8. Scissor gait
  if (minKneeDistRatio !== null && minKneeDistRatio <= 0.32) {
    findings.push({
      pattern: 'scissor',
      labelTh: 'Scissor gait (เข่าชิดหรือไขว้กันขณะเดิน)',
      confidence: minKneeDistRatio <= 0.18 ? 'high' : 'moderate',
      observedSignTh: `ระยะห่างเข่าแคบสุด ${minKneeDistRatio.toFixed(2)} เท่าของสะโพก`,
      commonCausesTh: 'ภาวะกล้ามเนื้อเกร็ง (Spasticity), สมองพิการ (Cerebral palsy)',
    })
  }

  // 9. Waddling gait
  if (trunkSwayRangeNorm >= 0.42 && pelvicDropDegMax >= 6) {
    findings.push({
      pattern: 'waddling',
      labelTh: 'Waddling gait (เดินโยกตัวซ้าย–ขวาแบบเป็ด)',
      confidence: trunkSwayRangeNorm >= 0.58 ? 'high' : 'moderate',
      observedSignTh: `ลำตัวโยกซ้าย–ขวา ${(trunkSwayRangeNorm * 100).toFixed(0)}% · สะโพกแกว่ง ${pelvicDropDegMax.toFixed(1)}°`,
      commonCausesTh: 'กล้ามเนื้อสะโพกอ่อนแรงทั้งสองข้าง, โรคกล้ามเนื้อ, การตั้งครรภ์',
    })
  }

  // 10. Magnetic gait (proxy: ก้าวไม่ออก/ระยะก้าวต่ำมากโดยไม่โน้มตัวแบบพาร์กินสัน)
  const lowSepRatio = samples.filter((s) => s.ankleSepXNorm < 0.12).length / samples.length
  if (lowSepRatio >= 0.6 && stepCount <= 2 && durationSec >= 3 && meanTorsoLeanDeg < 10) {
    findings.push({
      pattern: 'magnetic',
      labelTh: 'Magnetic gait (เท้าคล้ายติดพื้น ก้าวออกตัวยาก)',
      confidence: 'low',
      observedSignTh: `เท้าชิดติดพื้น ${(lowSepRatio * 100).toFixed(0)}% ของเวลาที่พยายามเดิน`,
      commonCausesTh: 'ภาวะน้ำในโพรงสมองคั่ง (NPH) — ต้องประเมินร่วมกับแพทย์',
    })
  }

  // 11. Toe walking (ต้องมีจุดเท้าจาก MediaPipe)
  if (footLandmarksAvailable) {
    const heelHighSamples = samples.filter(
      (s) =>
        s.leftToeBelowHeelNorm !== null &&
        s.leftToeBelowHeelNorm >= 0.055 &&
        s.rightToeBelowHeelNorm !== null &&
        s.rightToeBelowHeelNorm >= 0.055,
    )
    const toeWalkRatio = heelHighSamples.length / samples.length
    if (toeWalkRatio >= 0.45) {
      findings.push({
        pattern: 'toe_walking',
        labelTh: 'Toe walking (เดินเขย่งปลายเท้า)',
        confidence: toeWalkRatio >= 0.7 ? 'high' : 'moderate',
        observedSignTh: `ส้นเท้าลอยสูงกว่าปลายเท้า ${(toeWalkRatio * 100).toFixed(0)}% ของช่วงเดิน`,
        commonCausesTh: 'เอ็นร้อยหวายตึง หรือควรคัดกรองพัฒนาการในเด็ก',
      })
    }
  }

  // 12. Short leg gait
  const sameSideShoulderTilt = samples.filter((s) => s.shoulderTiltDeg >= 4).length / samples.length
  const sameSidePelvicTilt = samples.filter((s) => s.pelvicTiltDeg >= 4).length / samples.length
  const consistentDirection =
    Math.abs(meanOf(samples.map((s) => s.pelvicTiltSignedDeg))) >= 4
  if (sameSideShoulderTilt >= 0.6 && sameSidePelvicTilt >= 0.6 && consistentDirection) {
    findings.push({
      pattern: 'short_leg',
      labelTh: 'Short leg gait (ไหล่และเชิงกรานเอียงตกข้างเดียวกันตลอดช่วงเดิน)',
      confidence: 'moderate',
      observedSignTh: `เชิงกรานและไหล่เอียงข้างเดียวต่อเนื่อง ${Math.round(sameSidePelvicTilt * 100)}% ของเวลา`,
      commonCausesTh: 'ขายาวไม่เท่ากัน',
    })
  }

  const summaryNoteTh =
    findings.length === 0
      ? 'ยังไม่พบรูปแบบการเดินผิดปกติชัดเจนในช่วงที่บันทึก'
      : `พบรูปแบบการเดินที่เข้าข่าย ${findings.length} รายการ (เพื่อคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัยโรค)`

  return {
    metrics: {
      sampleCount: samples.length,
      durationSec,
      stepCount,
      cadenceSpm,
      avgStrideNorm,
      avgStepWidthRatio,
      minKneeDistRatio,
      stanceAsymmetryRatio,
      pelvicDropDegMax,
      trunkSwayRangeNorm,
      meanTorsoLeanDeg,
      armSwingAsymmetry,
      meanArmSwingNorm,
      footLandmarksAvailable,
    },
    findings,
    summaryNoteTh,
  }
}
