// การคำนวณมุมท่านั่งจาก 33 pose landmarks ของ MediaPipe BlazePose
// อ้างอิง index ของ landmark ตามมาตรฐาน BlazePose:
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

import type { Point, PostureIssueType, PostureThresholds } from '../types/posture'

const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const

/** มุม (องศา) ระหว่างเวกเตอร์ p1->p2 กับแนวดิ่ง (0 = ตรงดิ่งพอดี, ยิ่งมากยิ่งเอียง) */
function angleFromVertical(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  // แกน y ของภาพชี้ลง จึงใช้ -dy แทนทิศ "ขึ้น" ของแนวดิ่งอ้างอิง
  const rad = Math.atan2(dx, -dy)
  return Math.abs((rad * 180) / Math.PI)
}

/** มุมเอียงของเส้นไหล่ซ้าย-ขวา เทียบแนวนอน */
function shoulderTilt(left: Point, right: Point): number {
  const dx = right.x - left.x
  const dy = right.y - left.y
  const rad = Math.atan2(dy, dx)
  return Math.abs((rad * 180) / Math.PI)
}

function isVisible(p: Point | undefined, min: number): p is Point {
  return !!p && (p.visibility === undefined || p.visibility >= min)
}

/** เลือกจุดกึ่งกลางระหว่างซ้าย-ขวา ถ้าเห็นทั้งคู่ ไม่งั้นใช้ข้างที่เห็น (เผื่อกรณีนั่งหันข้างให้กล้อง) */
function midOrVisible(left: Point | undefined, right: Point | undefined, min: number): Point | undefined {
  const l = isVisible(left, min)
  const r = isVisible(right, min)
  if (l && r) return { x: (left!.x + right!.x) / 2, y: (left!.y + right!.y) / 2 }
  if (l) return left
  if (r) return right
  return undefined
}

export interface PostureAngles {
  neckAngleDeg: number
  torsoAngleDeg: number
  shoulderTiltDeg: number
}

export interface PostureAnalysisResult extends PostureAngles {
  issue: PostureIssueType
}

/**
 * วิเคราะห์ landmarks 1 เฟรม -> มุมคอ/มุมลำตัว/มุมเอียงไหล่ + สรุปเป็นสถานะท่านั่ง
 * คืนค่า issue = 'no_person' ถ้ามองไม่เห็น landmark หลักที่จำเป็นชัดเจนพอ
 */
export function analyzePosture(
  landmarks: Point[] | undefined,
  thresholds: PostureThresholds,
): PostureAnalysisResult {
  if (!landmarks || landmarks.length < 25) {
    return { issue: 'no_person', neckAngleDeg: 0, torsoAngleDeg: 0, shoulderTiltDeg: 0 }
  }

  const nose = landmarks[LM.NOSE]
  const leftEar = landmarks[LM.LEFT_EAR]
  const rightEar = landmarks[LM.RIGHT_EAR]
  const leftShoulder = landmarks[LM.LEFT_SHOULDER]
  const rightShoulder = landmarks[LM.RIGHT_SHOULDER]
  const leftHip = landmarks[LM.LEFT_HIP]
  const rightHip = landmarks[LM.RIGHT_HIP]

  const leftSideVisible = isVisible(leftShoulder, thresholds.minVisibility) && isVisible(leftHip, thresholds.minVisibility)
  const rightSideVisible = isVisible(rightShoulder, thresholds.minVisibility) && isVisible(rightHip, thresholds.minVisibility)
  // ถ้ามองด้านข้าง ให้ใช้ไหล่และสะโพกฝั่งเดียวกัน ห้ามผสมไหล่ซ้ายกับสะโพกขวา
  // เพราะจะทำให้มุมลำตัวเพี้ยนเมื่ออีกฝั่งถูกบัง
  const shoulderMid = leftSideVisible && !rightSideVisible
    ? leftShoulder
    : rightSideVisible && !leftSideVisible
      ? rightShoulder
      : midOrVisible(leftShoulder, rightShoulder, thresholds.minVisibility)
  const hipMid = leftSideVisible && !rightSideVisible
    ? leftHip
    : rightSideVisible && !leftSideVisible
      ? rightHip
      : midOrVisible(leftHip, rightHip, thresholds.minVisibility)
  // หัว: ถ้าเป็นมุมด้านข้าง ให้ใช้หูฝั่งเดียวกับไหล่/สะโพกที่มองเห็น
  // เพื่อไม่ผสม landmark คนละฝั่ง ซึ่งทำให้มุมคอผิดเมื่อใบหน้า/ลำตัวถูกบัง
  const sideHead = leftSideVisible && !rightSideVisible
    ? (isVisible(leftEar, thresholds.minVisibility) ? leftEar : undefined)
    : rightSideVisible && !leftSideVisible
      ? (isVisible(rightEar, thresholds.minVisibility) ? rightEar : undefined)
      : undefined
  const headPoint = sideHead ?? midOrVisible(leftEar, rightEar, thresholds.minVisibility) ?? (isVisible(nose, thresholds.minVisibility) ? nose : undefined)

  if (!shoulderMid || !hipMid || !headPoint) {
    return { issue: 'no_person', neckAngleDeg: 0, torsoAngleDeg: 0, shoulderTiltDeg: 0 }
  }

  const neckAngleDeg = angleFromVertical(shoulderMid, headPoint)
  const torsoAngleDeg = angleFromVertical(hipMid, shoulderMid)
  const shoulderTiltDeg =
    isVisible(leftShoulder, thresholds.minVisibility) && isVisible(rightShoulder, thresholds.minVisibility)
      ? shoulderTilt(leftShoulder, rightShoulder)
      : 0
  // ตรวจการเอียงคอ/ศีรษะด้านข้างจากแนวหูซ้าย-ขวาเพิ่มเติม
  // ใช้ threshold เดียวกับไหล่เพื่อให้ผู้ใช้ปรับความไวจาก Settings ได้จุดเดียว
  const headTiltDeg =
    isVisible(leftEar, thresholds.minVisibility) && isVisible(rightEar, thresholds.minVisibility)
      ? shoulderTilt(leftEar, rightEar)
      : 0
  const effectiveTiltDeg = Math.max(shoulderTiltDeg, headTiltDeg)

  let issue: PostureIssueType = 'good'
  if (torsoAngleDeg >= thresholds.torsoAngleThresholdDeg) {
    issue = 'slouching'
  } else if (neckAngleDeg >= thresholds.neckAngleThresholdDeg) {
    issue = 'forward_head'
  } else if (effectiveTiltDeg >= thresholds.shoulderTiltThresholdDeg) {
    issue = 'leaning'
  }

  return { issue, neckAngleDeg, torsoAngleDeg, shoulderTiltDeg: effectiveTiltDeg }
}

export const POSTURE_LABELS_TH: Record<PostureIssueType, string> = {
  good: 'นั่งท่าดี',
  forward_head: 'ก้มคอ/ยื่นคอไปข้างหน้า',
  slouching: 'หลังค่อม/โน้มตัว',
  leaning: 'นั่งเอียงข้าง',
  no_person: 'ไม่พบคนในเฟรม',
}
