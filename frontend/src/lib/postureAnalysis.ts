// การคำนวณมุมท่านั่งจาก 33 pose landmarks ของ MediaPipe BlazePose
// อ้างอิง index ของ landmark ตามมาตรฐาน BlazePose:
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
//
// แบ่งเป็น 2 ขั้น:
//   1) extractPostureFeatures — แปลง landmarks เป็นตัวเลขที่วัดได้ โดยคำนวณ geometry ใน pixel space
//   2) classifyPosture       — เอาตัวเลขมาเทียบ threshold เพื่อจัดประเภทท่านั่ง
// แยกกันเพื่อให้แทรก smoothing และ calibration ในขั้นถัดไปได้

import type {
  Point,
  PostureBaseline,
  PostureFeatures,
  PostureIssueType,
  PostureThresholds,
} from '../types/posture'

const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const

export interface FrameSize {
  width: number
  height: number
}

function toPixels(point: Point, frame: FrameSize): Point {
  return {
    x: point.x * frame.width,
    y: point.y * frame.height,
    visibility: point.visibility,
  }
}

/** มุม (องศา) ระหว่างเวกเตอร์ p1->p2 กับแนวดิ่ง (0 = ตรงดิ่งพอดี, ยิ่งมากยิ่งเอียง) */
function angleFromVertical(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const rad = Math.atan2(dx, -dy)
  return Math.abs((rad * 180) / Math.PI)
}

/** มุมเอียงของเส้นไหล่ซ้าย-ขวา เทียบแนวนอน (0 = ไหล่ตรง) */
function shoulderTilt(left: Point, right: Point): number {
  const dx = Math.abs(right.x - left.x)
  const dy = Math.abs(right.y - left.y)
  const rad = Math.atan2(dy, dx)
  return (rad * 180) / Math.PI
}

export function isVisible(point: Point | undefined, min: number): point is Point {
  return !!point && (point.visibility === undefined || point.visibility >= min)
}

/** เลือกจุดกึ่งกลางระหว่างซ้าย-ขวา ถ้าเห็นทั้งคู่ ไม่งั้นใช้ข้างที่เห็น */
export function midOrVisible(left: Point | undefined, right: Point | undefined, min: number): Point | undefined {
  const leftVisible = isVisible(left, min)
  const rightVisible = isVisible(right, min)

  if (leftVisible && rightVisible) {
    return {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
    }
  }
  if (leftVisible) return left
  if (rightVisible) return right
  return undefined
}

/**
 * ขั้นที่ 1: landmarks 1 คน -> ตัวเลขที่วัดได้
 * คืน null ถ้ามองไม่เห็นหัว + ไหล่ชัดพอ ส่วนสะโพกไม่บังคับ
 */
export function extractPostureFeatures(
  landmarks: Point[] | undefined,
  frame: FrameSize,
  minVisibility: number,
): PostureFeatures | null {
  if (!landmarks || landmarks.length < 25) return null

  const at = (index: number): Point | undefined => {
    const point = landmarks[index]
    return point ? toPixels(point, frame) : undefined
  }

  const nose = at(LM.NOSE)
  const leftShoulder = at(LM.LEFT_SHOULDER)
  const rightShoulder = at(LM.RIGHT_SHOULDER)
  const shoulderMid = midOrVisible(leftShoulder, rightShoulder, minVisibility)
  const hipMid = midOrVisible(at(LM.LEFT_HIP), at(LM.RIGHT_HIP), minVisibility)
  const headPoint =
    midOrVisible(at(LM.LEFT_EAR), at(LM.RIGHT_EAR), minVisibility) ??
    (isVisible(nose, minVisibility) ? nose : undefined)

  if (!shoulderMid || !headPoint) return null

  let shoulderTiltDeg = 0
  let headHeightRatio: number | null = null

  if (isVisible(leftShoulder, minVisibility) && isVisible(rightShoulder, minVisibility)) {
    shoulderTiltDeg = shoulderTilt(leftShoulder, rightShoulder)

    const shoulderWidthPx = Math.hypot(
      rightShoulder.x - leftShoulder.x,
      rightShoulder.y - leftShoulder.y,
    )
    if (shoulderWidthPx > 0) {
      headHeightRatio = (shoulderMid.y - headPoint.y) / shoulderWidthPx
    }
  }

  return {
    quality: hipMid ? 'full_body' : 'upper_body',
    neckAngleDeg: angleFromVertical(shoulderMid, headPoint),
    torsoAngleDeg: hipMid ? angleFromVertical(hipMid, shoulderMid) : null,
    shoulderTiltDeg,
    headHeightRatio,
  }
}

/**
 * ขั้นที่ 2: ตัวเลข -> ท่านั่ง
 * ถ้ามี baseline ให้ตัดสินจากส่วนต่างของมุมเทียบกับท่าที่ calibrate และจากสัดส่วนหัวที่ต่ำลง
 */
export function classifyPosture(
  features: PostureFeatures,
  thresholds: PostureThresholds,
  baseline: PostureBaseline | null,
): Exclude<PostureIssueType, 'no_person'> {
  const neckAngleDeg = baseline
    ? features.neckAngleDeg - baseline.neckAngleDeg
    : features.neckAngleDeg
  const shoulderTiltDeg = baseline
    ? features.shoulderTiltDeg - baseline.shoulderTiltDeg
    : features.shoulderTiltDeg

  let torsoAngleDeg = features.torsoAngleDeg
  if (
    torsoAngleDeg !== null &&
    baseline?.torsoAngleDeg !== null &&
    baseline?.torsoAngleDeg !== undefined
  ) {
    torsoAngleDeg -= baseline.torsoAngleDeg
  }

  let headDrop: number | null = null
  if (
    baseline?.headHeightRatio !== null &&
    baseline?.headHeightRatio !== undefined &&
    baseline.headHeightRatio > 0 &&
    features.headHeightRatio !== null
  ) {
    headDrop = 1 - features.headHeightRatio / baseline.headHeightRatio
  }

  if (
    torsoAngleDeg !== null &&
    torsoAngleDeg >= thresholds.torsoAngleThresholdDeg
  ) {
    return 'slouching'
  }
  if (
    neckAngleDeg >= thresholds.neckAngleThresholdDeg ||
    (headDrop !== null && headDrop >= thresholds.headDropThreshold)
  ) {
    return 'forward_head'
  }
  if (shoulderTiltDeg >= thresholds.shoulderTiltThresholdDeg) {
    return 'leaning'
  }
  return 'good'
}

export const POSTURE_LABELS_TH: Record<PostureIssueType, string> = {
  good: 'นั่งท่าดี',
  forward_head: 'ก้มคอ/ยื่นคอไปข้างหน้า',
  slouching: 'หลังค่อม/โน้มตัว',
  leaning: 'นั่งเอียงข้าง',
  no_person: 'ไม่พบคนในเฟรม',
}
