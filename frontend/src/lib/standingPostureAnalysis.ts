// วิเคราะห์ "ท่ายืน (Static Posture)" และ "การทรงตัว (Romberg Test)" จาก BlazePose 33 landmarks
// เป็นการคัดกรองความสมมาตรและมุมข้อต่อเบื้องต้นจากภาพ 2D ไม่ใช่การวินิจฉัยโรคทางการแพทย์

import type { Point } from '../types/posture'
import { isVisible, midOrVisible } from './postureAnalysis'

export type StandingMode = 'standing_front' | 'standing_side' | 'romberg'
export type FindingSeverity = 'normal' | 'mild' | 'moderate' | 'high'

export interface StandingFinding {
  key: string
  category: 'spine_trunk' | 'pelvis_legs' | 'balance'
  title: string
  detail: string
  severity: Exclude<FindingSeverity, 'normal'>
}

export interface StandingFrontMetrics {
  shoulderTiltDeg: number
  pelvicTiltDeg: number
  trunkLateralShiftRatio: number
  kneeToAnkleWidthRatio: number | null
  stanceWidthRatio: number | null
  footAngleDiffDeg: number | null
}

export interface StandingSideMetrics {
  facing: 'left' | 'right'
  forwardHeadDeg: number
  roundedShoulderRatio: number
  upperBackKyphosisProxyDeg: number
  lumbarLordosisProxyDeg: number | null
  kneeExtensionDeg: number | null
}

export interface RombergSample {
  t: number
  centerX: number
  centerY: number
  torsoHeight: number
  stanceWidthRatio: number | null
}

export interface RombergResult {
  openSwayIndex: number
  closedSwayIndex: number
  swayRatio: number
  feetTogetherOk: boolean
  status: 'normal' | 'proprioceptive_suspect' | 'cerebellar_suspect' | 'insufficient_data'
  title: string
  detail: string
}

export const STANDING_LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
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

function degBetweenHorizontal(a: Point, b: Point): number {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dx < 1e-6 && dy < 1e-6) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

function degFromVertical(bottom: Point, top: Point): number {
  const dx = top.x - bottom.x
  const dy = bottom.y - top.y
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI)
}

/** มุมภายในที่จุด b ของสามเหลี่ยม a-b-c (0-180 องศา) */
export function jointAngleDeg(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x
  const aby = a.y - b.y
  const cbx = c.x - b.x
  const cby = c.y - b.y
  const magA = Math.hypot(abx, aby)
  const magC = Math.hypot(cbx, cby)
  if (magA < 1e-6 || magC < 1e-6) return 180
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / (magA * magC)))
  return (Math.acos(cos) * 180) / Math.PI
}

export function analyzeStandingFront(
  landmarks: readonly Point[] | undefined,
  minVisibility = 0.5,
): { metrics: StandingFrontMetrics; findings: StandingFinding[] } | null {
  if (!landmarks || landmarks.length < 29) return null

  const lShoulder = landmarks[STANDING_LM.LEFT_SHOULDER]
  const rShoulder = landmarks[STANDING_LM.RIGHT_SHOULDER]
  const lHip = landmarks[STANDING_LM.LEFT_HIP]
  const rHip = landmarks[STANDING_LM.RIGHT_HIP]

  if (
    !isVisible(lShoulder, minVisibility) ||
    !isVisible(rShoulder, minVisibility) ||
    !isVisible(lHip, minVisibility) ||
    !isVisible(rHip, minVisibility)
  ) {
    return null
  }

  const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x)
  const hipWidth = Math.abs(lHip.x - rHip.x)
  if (shoulderWidth < 0.04 || hipWidth < 0.03) return null

  const shoulderTiltDeg = degBetweenHorizontal(lShoulder, rShoulder)
  const pelvicTiltDeg = degBetweenHorizontal(lHip, rHip)

  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2
  const hipMidX = (lHip.x + rHip.x) / 2
  const trunkLateralShiftRatio = Math.abs(shoulderMidX - hipMidX) / hipWidth

  const lKnee = landmarks[STANDING_LM.LEFT_KNEE]
  const rKnee = landmarks[STANDING_LM.RIGHT_KNEE]
  const lAnkle = landmarks[STANDING_LM.LEFT_ANKLE]
  const rAnkle = landmarks[STANDING_LM.RIGHT_ANKLE]

  let kneeToAnkleWidthRatio: number | null = null
  let stanceWidthRatio: number | null = null

  if (isVisible(lAnkle, minVisibility) && isVisible(rAnkle, minVisibility)) {
    const ankleDist = Math.abs(lAnkle.x - rAnkle.x)
    stanceWidthRatio = ankleDist / hipWidth
    if (isVisible(lKnee, minVisibility) && isVisible(rKnee, minVisibility) && ankleDist > 0.025) {
      const kneeDist = Math.abs(lKnee.x - rKnee.x)
      kneeToAnkleWidthRatio = kneeDist / ankleDist
    }
  }

  const lHeel = landmarks[STANDING_LM.LEFT_HEEL]
  const rHeel = landmarks[STANDING_LM.RIGHT_HEEL]
  const lToe = landmarks[STANDING_LM.LEFT_FOOT_INDEX]
  const rToe = landmarks[STANDING_LM.RIGHT_FOOT_INDEX]
  let footAngleDiffDeg: number | null = null
  if (
    isVisible(lHeel, minVisibility) &&
    isVisible(rHeel, minVisibility) &&
    isVisible(lToe, minVisibility) &&
    isVisible(rToe, minVisibility)
  ) {
    const leftAngle = degFromVertical(lHeel, lToe)
    const rightAngle = degFromVertical(rHeel, rToe)
    footAngleDiffDeg = Math.abs(leftAngle - rightAngle)
  }

  const findings: StandingFinding[] = []

  if (shoulderTiltDeg >= 4 || trunkLateralShiftRatio >= 0.28) {
    findings.push({
      key: 'scoliosis_proxy',
      category: 'spine_trunk',
      title: 'แนวโน้มกระดูกสันหลังคด / ลำตัวไม่สมมาตร (Scoliosis screening)',
      detail: `ไหล่เอียง ${shoulderTiltDeg.toFixed(1)}° · ลำตัวเบี่ยง ${(trunkLateralShiftRatio * 100).toFixed(0)}% (สังเกตไหล่สูงไม่เท่ากัน/เอวไม่สมมาตร)`,
      severity: shoulderTiltDeg >= 7 || trunkLateralShiftRatio >= 0.42 ? 'high' : 'moderate',
    })
  }

  if (pelvicTiltDeg >= 4) {
    findings.push({
      key: 'leg_length_discrepancy',
      category: 'pelvis_legs',
      title: 'เชิงกรานเอียง / สงสัยขายาวไม่เท่ากัน (Leg length discrepancy)',
      detail: `เชิงกรานเอียง ${pelvicTiltDeg.toFixed(1)}° อาจเกิดจากการลงน้ำหนักข้างเดียวหรือความยาวขาไม่เท่ากัน`,
      severity: pelvicTiltDeg >= 7 ? 'high' : 'moderate',
    })
  }

  if (kneeToAnkleWidthRatio !== null) {
    if (kneeToAnkleWidthRatio <= 0.72) {
      findings.push({
        key: 'genu_valgum',
        category: 'pelvis_legs',
        title: 'เข่าชิด / ขาเป็ดเข้าด้านใน (Genu valgum)',
        detail: `ระยะเข่าแคบกว่าข้อเท้า (อัตราส่วน ${kneeToAnkleWidthRatio.toFixed(2)})`,
        severity: kneeToAnkleWidthRatio <= 0.58 ? 'high' : 'moderate',
      })
    } else if (kneeToAnkleWidthRatio >= 1.32) {
      findings.push({
        key: 'genu_varum',
        category: 'pelvis_legs',
        title: 'ขาโก่ง (Genu varum)',
        detail: `ระยะเข่ากว้างกว่าข้อเท้า (อัตราส่วน ${kneeToAnkleWidthRatio.toFixed(2)})`,
        severity: kneeToAnkleWidthRatio >= 1.55 ? 'high' : 'moderate',
      })
    }
  }

  if (stanceWidthRatio !== null && stanceWidthRatio >= 1.75) {
    findings.push({
      key: 'wide_stance_ataxia',
      category: 'balance',
      title: 'ยืนกางขากว้างเพื่อทรงตัว (Wide-based stance)',
      detail: `ความกว้างฐานยืน ${stanceWidthRatio.toFixed(2)} เท่าของสะโพก — อาจสัมพันธ์กับภาวะ Ataxia หากทรงตัวลำบาก`,
      severity: stanceWidthRatio >= 2.1 ? 'high' : 'moderate',
    })
  }

  if (footAngleDiffDeg !== null && footAngleDiffDeg >= 12) {
    findings.push({
      key: 'foot_alignment_asymmetry',
      category: 'pelvis_legs',
      title: 'แนวปลายเท้า/ข้อเท้าซ้าย–ขวาไม่สมมาตร (Flat foot / Pes cavus screening)',
      detail: `มุมเท้าต่างกัน ${footAngleDiffDeg.toFixed(1)}° (กล้อง 2D ดูอุ้งเท้าโดยตรงไม่ได้ ควรตรวจฝ่าเท้าและรอยสึกของรองเท้าเพิ่มเติม)`,
      severity: 'mild',
    })
  }

  return {
    metrics: {
      shoulderTiltDeg,
      pelvicTiltDeg,
      trunkLateralShiftRatio,
      kneeToAnkleWidthRatio,
      stanceWidthRatio,
      footAngleDiffDeg,
    },
    findings,
  }
}

export function analyzeStandingSide(
  landmarks: readonly Point[] | undefined,
  minVisibility = 0.45,
): { metrics: StandingSideMetrics; findings: StandingFinding[] } | null {
  if (!landmarks || landmarks.length < 29) return null

  // เลือกด้านที่มองเห็นชัดเจนกว่า (ซ้ายหรือขวา)
  const leftVis =
    (landmarks[STANDING_LM.LEFT_SHOULDER]?.visibility ?? 0) +
    (landmarks[STANDING_LM.LEFT_HIP]?.visibility ?? 0) +
    (landmarks[STANDING_LM.LEFT_EAR]?.visibility ?? 0)
  const rightVis =
    (landmarks[STANDING_LM.RIGHT_SHOULDER]?.visibility ?? 0) +
    (landmarks[STANDING_LM.RIGHT_HIP]?.visibility ?? 0) +
    (landmarks[STANDING_LM.RIGHT_EAR]?.visibility ?? 0)

  const useLeft = leftVis >= rightVis
  const ear = landmarks[useLeft ? STANDING_LM.LEFT_EAR : STANDING_LM.RIGHT_EAR]
  const nose = landmarks[STANDING_LM.NOSE]
  const shoulder = landmarks[useLeft ? STANDING_LM.LEFT_SHOULDER : STANDING_LM.RIGHT_SHOULDER]
  const hip = landmarks[useLeft ? STANDING_LM.LEFT_HIP : STANDING_LM.RIGHT_HIP]
  const knee = landmarks[useLeft ? STANDING_LM.LEFT_KNEE : STANDING_LM.RIGHT_KNEE]
  const ankle = landmarks[useLeft ? STANDING_LM.LEFT_ANKLE : STANDING_LM.RIGHT_ANKLE]

  if (!isVisible(shoulder, minVisibility) || !isVisible(hip, minVisibility)) {
    return null
  }

  const head = isVisible(ear, minVisibility) ? ear : isVisible(nose, minVisibility) ? nose : undefined
  if (!head) return null

  const torsoHeight = Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y)
  if (torsoHeight < 0.08) return null

  // ทิศทางที่คนหันหน้า (อิงจากจมูกเทียบกับหูหรือไหล่: facingX = +1 คือหันขวา, -1 คือหันซ้าย)
  const facingSign = isVisible(nose, minVisibility)
    ? nose.x >= (ear?.x ?? shoulder.x)
      ? 1
      : -1
    : head.x >= shoulder.x
      ? 1
      : -1

  const facing: 'left' | 'right' = facingSign >= 0 ? 'right' : 'left'
  const forwardHeadDeg = degFromVertical(shoulder, head)

  // ไหล่ห่อ (Rounded shoulders): ไหล่ยื่นไปด้านหน้าเทียบกับแนวดิ่งจากสะโพก
  const shoulderForwardShift = ((shoulder.x - hip.x) * facingSign) / torsoHeight
  const roundedShoulderRatio = Math.max(0, shoulderForwardShift)

  // หลังค่อม (Hyperkyphosis proxy): มุมสะโพก -> ไหล่ -> ศีรษะ ก้มงอมาก
  const upperBodyBendDeg = 180 - jointAngleDeg(hip, shoulder, head)
  const upperBackKyphosisProxyDeg = Math.max(0, upperBodyBendDeg)

  // หลังแอ่น (Hyperlordosis proxy) & เข่าแอ่น (Genu recurvatum)
  let lumbarLordosisProxyDeg: number | null = null
  let kneeExtensionDeg: number | null = null

  if (isVisible(knee, minVisibility)) {
    // เช็กการแอ่นของลำตัวท่อนบนเทียบสะโพก-เข่า (ถ้าสะโพกยื่นหน้าหรือไหล่เอนหลัง/แอ่นเอว)
    const hipForwardShift = ((hip.x - knee.x) * facingSign) / torsoHeight
    const trunkTiltBack = ((hip.x - shoulder.x) * facingSign) / torsoHeight
    if (hipForwardShift > 0.05 || trunkTiltBack > 0.04) {
      lumbarLordosisProxyDeg = Math.max(0, 180 - jointAngleDeg(knee, hip, shoulder))
    } else {
      lumbarLordosisProxyDeg = 0
    }

    if (isVisible(ankle, minVisibility)) {
      // คำนวณมุมเข่าแบบมีทิศทาง: > 180 หมายถึงเข่าแอ่นไปด้านหลัง (ทิศตรงข้ามกับ facingSign)
      const baseAngle = jointAngleDeg(hip, knee, ankle)
      const midX = (hip.x + ankle.x) / 2
      const kneeBehindLine = (midX - knee.x) * facingSign > 0.015
      kneeExtensionDeg = kneeBehindLine ? 360 - baseAngle : baseAngle
    }
  }

  const findings: StandingFinding[] = []

  if (forwardHeadDeg >= 20) {
    findings.push({
      key: 'forward_head_standing',
      category: 'spine_trunk',
      title: 'คอยื่น (Forward head posture)',
      detail: `ใบหูยื่นล้ำแนวไหล่ ${forwardHeadDeg.toFixed(1)}°`,
      severity: forwardHeadDeg >= 30 ? 'high' : 'moderate',
    })
  }

  if (roundedShoulderRatio >= 0.16) {
    findings.push({
      key: 'rounded_shoulders',
      category: 'spine_trunk',
      title: 'ไหล่ห่อ (Rounded shoulders)',
      detail: `ไหล่ม้วนล้ำหน้าแนวสะโพก ${(roundedShoulderRatio * 100).toFixed(0)}% ของความสูงลำตัว`,
      severity: roundedShoulderRatio >= 0.26 ? 'high' : 'moderate',
    })
  }

  if (upperBackKyphosisProxyDeg >= 25) {
    findings.push({
      key: 'hyperkyphosis',
      category: 'spine_trunk',
      title: 'แนวโน้มหลังค่อม (Hyperkyphosis)',
      detail: `หลังส่วนบนโค้งงอมาด้านหน้า ${upperBackKyphosisProxyDeg.toFixed(1)}°`,
      severity: upperBackKyphosisProxyDeg >= 38 ? 'high' : 'moderate',
    })
  }

  if (lumbarLordosisProxyDeg !== null && lumbarLordosisProxyDeg >= 16) {
    findings.push({
      key: 'hyperlordosis',
      category: 'spine_trunk',
      title: 'แนวโน้มหลังแอ่น / เชิงกรานเอียงหน้า (Hyperlordosis)',
      detail: `แนวเอวและเชิงกรานแอ่น ${lumbarLordosisProxyDeg.toFixed(1)}°`,
      severity: lumbarLordosisProxyDeg >= 26 ? 'high' : 'moderate',
    })
  }

  if (kneeExtensionDeg !== null && kneeExtensionDeg >= 188) {
    findings.push({
      key: 'genu_recurvatum',
      category: 'pelvis_legs',
      title: 'เข่าแอ่นไปด้านหลัง (Genu recurvatum)',
      detail: `มุมข้อเข่าเหยียดเกินแนวตรง (${kneeExtensionDeg.toFixed(1)}°)`,
      severity: kneeExtensionDeg >= 195 ? 'high' : 'moderate',
    })
  }

  return {
    metrics: {
      facing,
      forwardHeadDeg,
      roundedShoulderRatio,
      upperBackKyphosisProxyDeg,
      lumbarLordosisProxyDeg,
      kneeExtensionDeg,
    },
    findings,
  }
}

export function extractRombergSample(
  landmarks: readonly Point[] | undefined,
  t: number,
  minVisibility = 0.5,
): RombergSample | null {
  if (!landmarks || landmarks.length < 25) return null
  const shoulderMid = midOrVisible(
    landmarks[STANDING_LM.LEFT_SHOULDER],
    landmarks[STANDING_LM.RIGHT_SHOULDER],
    minVisibility,
  )
  const hipMid = midOrVisible(
    landmarks[STANDING_LM.LEFT_HIP],
    landmarks[STANDING_LM.RIGHT_HIP],
    minVisibility,
  )
  if (!shoulderMid || !hipMid) return null

  const torsoHeight = Math.hypot(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y)
  if (torsoHeight < 0.06) return null

  const lHip = landmarks[STANDING_LM.LEFT_HIP]
  const rHip = landmarks[STANDING_LM.RIGHT_HIP]
  const lAnkle = landmarks[STANDING_LM.LEFT_ANKLE]
  const rAnkle = landmarks[STANDING_LM.RIGHT_ANKLE]

  let stanceWidthRatio: number | null = null
  if (
    isVisible(lHip, minVisibility) &&
    isVisible(rHip, minVisibility) &&
    isVisible(lAnkle, minVisibility) &&
    isVisible(rAnkle, minVisibility)
  ) {
    const hipW = Math.abs(lHip.x - rHip.x)
    if (hipW > 0.02) {
      stanceWidthRatio = Math.abs(lAnkle.x - rAnkle.x) / hipW
    }
  }

  return {
    t,
    centerX: (shoulderMid.x + hipMid.x) / 2,
    centerY: (shoulderMid.y + hipMid.y) / 2,
    torsoHeight,
    stanceWidthRatio,
  }
}

function computeSwayIndex(samples: readonly RombergSample[]): number {
  if (samples.length < 5) return 0
  const meanX = samples.reduce((sum, s) => sum + s.centerX, 0) / samples.length
  const meanY = samples.reduce((sum, s) => sum + s.centerY, 0) / samples.length
  const avgTorso = samples.reduce((sum, s) => sum + s.torsoHeight, 0) / samples.length
  if (avgTorso <= 0) return 0

  let sqSum = 0
  for (const s of samples) {
    const dx = (s.centerX - meanX) / avgTorso
    const dy = (s.centerY - meanY) / avgTorso
    sqSum += dx * dx + dy * dy
  }
  // RMS sway ในหน่วย % ของความสูงลำตัว
  return Math.sqrt(sqSum / samples.length) * 100
}

export function evaluateRombergTest(
  eyesOpenSamples: readonly RombergSample[],
  eyesClosedSamples: readonly RombergSample[],
): RombergResult {
  if (eyesOpenSamples.length < 8 || eyesClosedSamples.length < 8) {
    return {
      openSwayIndex: 0,
      closedSwayIndex: 0,
      swayRatio: 1,
      feetTogetherOk: false,
      status: 'insufficient_data',
      title: 'ข้อมูลยังไม่พอสำหรับประเมิน Romberg Test',
      detail: 'ต้องยืนหน้ากล้องให้นิ่งและเก็บเฟรมทั้งช่วงลืมตาและหลับตาอย่างน้อยช่วงละ 3–5 วินาที',
    }
  }

  const openSwayIndex = computeSwayIndex(eyesOpenSamples)
  const closedSwayIndex = computeSwayIndex(eyesClosedSamples)
  const swayRatio = closedSwayIndex / Math.max(openSwayIndex, 0.35)

  const stanceSamples = [...eyesOpenSamples, ...eyesClosedSamples]
    .map((s) => s.stanceWidthRatio)
    .filter((v): v is number => v !== null)
  const avgStance = stanceSamples.length > 0 ? stanceSamples.reduce((a, b) => a + b, 0) / stanceSamples.length : 1
  const feetTogetherOk = avgStance <= 1.25

  const SWAY_HIGH = 3.2

  if (openSwayIndex >= SWAY_HIGH && closedSwayIndex >= SWAY_HIGH) {
    return {
      openSwayIndex,
      closedSwayIndex,
      swayRatio,
      feetTogetherOk,
      status: 'cerebellar_suspect',
      title: 'เซทั้งตอนลืมตาและหลับตา',
      detail: `ความแกว่งลืมตา ${openSwayIndex.toFixed(1)}% · หลับตา ${closedSwayIndex.toFixed(1)}% — อาจสัมพันธ์กับปัญหาสมองน้อย (Cerebellum) หรือการทรงตัวพื้นฐาน ควรพบแพทย์ตรวจประเมิน`,
    }
  }

  if (closedSwayIndex >= SWAY_HIGH || (swayRatio >= 1.85 && closedSwayIndex >= 2.0)) {
    return {
      openSwayIndex,
      closedSwayIndex,
      swayRatio,
      feetTogetherOk,
      status: 'proprioceptive_suspect',
      title: 'Romberg Positive (เซมากขึ้นชัดเจนเฉพาะตอนหลับตา)',
      detail: `ความแกว่งลืมตา ${openSwayIndex.toFixed(1)}% → หลับตา ${closedSwayIndex.toFixed(1)}% (${swayRatio.toFixed(1)} เท่า) — อาจบ่งชี้ความผิดปกติของระบบรับรู้ตำแหน่งข้อ (Proprioception)`,
    }
  }

  return {
    openSwayIndex,
    closedSwayIndex,
    swayRatio,
    feetTogetherOk,
    status: 'normal',
    title: 'การทรงตัวปกติ (Romberg Negative)',
    detail: `ความแกว่งลืมตา ${openSwayIndex.toFixed(1)}% · หลับตา ${closedSwayIndex.toFixed(1)}% ทรงตัวได้มั่นคง${
      feetTogetherOk ? '' : ' (หมายเหตุ: ยืนเท้ายิ่งชิดจะยิ่งทดสอบได้แม่นยำขึ้น)'
    }`,
  }
}
