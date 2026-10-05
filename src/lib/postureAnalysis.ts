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

/** มุมเอียงของเส้นไหล่ซ้าย-ขวา เทียบแนวนอน (0 = ไหล่ตรง) */
function shoulderTilt(left: Point, right: Point): number {
  const dx = Math.abs(right.x - left.x)
  const dy = Math.abs(right.y - left.y)
  const rad = Math.atan2(dy, dx)
  return (rad * 180) / Math.PI
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

/** คุณภาพของสัญญาณ pose: เห็นทั้งตัว (มีสะโพก) / เห็นแค่ช่วงบน (หัว+ไหล่) */
export type PoseQuality = 'full_body' | 'upper_body'

export interface PostureAngles {
  neckAngleDeg: number
  /** null = มองไม่เห็นสะโพก วัดมุมลำตัวไม่ได้ */
  torsoAngleDeg: number | null
  shoulderTiltDeg: number
}

export interface PostureAnalysisResult extends PostureAngles {
  issue: PostureIssueType
  quality: PoseQuality
}

const NO_PERSON: PostureAnalysisResult = {
  issue: 'no_person',
  quality: 'upper_body',
  neckAngleDeg: 0,
  torsoAngleDeg: null,
  shoulderTiltDeg: 0,
}

/**
 * วิเคราะห์ landmarks 1 เฟรม -> มุมคอ/มุมลำตัว/มุมเอียงไหล่ + สรุปเป็นสถานะท่านั่ง
 * คืนค่า issue = 'no_person' ถ้ามองไม่เห็นหัวหรือไหล่ชัดเจนพอ
 */
export function analyzePosture(
  landmarks: Point[] | undefined,
  thresholds: PostureThresholds,
): PostureAnalysisResult {
  if (!landmarks || landmarks.length < 25) return NO_PERSON

  const nose = landmarks[LM.NOSE]
  const leftEar = landmarks[LM.LEFT_EAR]
  const rightEar = landmarks[LM.RIGHT_EAR]
  const leftShoulder = landmarks[LM.LEFT_SHOULDER]
  const rightShoulder = landmarks[LM.RIGHT_SHOULDER]
  const leftHip = landmarks[LM.LEFT_HIP]
  const rightHip = landmarks[LM.RIGHT_HIP]

  const shoulderMid = midOrVisible(leftShoulder, rightShoulder, thresholds.minVisibility)
  const hipMid = midOrVisible(leftHip, rightHip, thresholds.minVisibility)
  // หัว: ใช้หูถ้าเห็น (แม่นกว่าเวลานั่งหันข้าง) ไม่งั้น fallback ไปจมูก
  const headPoint = midOrVisible(leftEar, rightEar, thresholds.minVisibility) ?? (isVisible(nose, thresholds.minVisibility) ? nose : undefined)

  // Quality Gate: ต้องเห็นอย่างน้อย "หัว + ไหล่" ส่วนสะโพกไม่บังคับ
  if (!shoulderMid || !headPoint) return NO_PERSON
  const quality: PoseQuality = hipMid ? 'full_body' : 'upper_body'

  const neckAngleDeg = angleFromVertical(shoulderMid, headPoint)
  const torsoAngleDeg = hipMid ? angleFromVertical(hipMid, shoulderMid) : null
  const shoulderTiltDeg =
    isVisible(leftShoulder, thresholds.minVisibility) && isVisible(rightShoulder, thresholds.minVisibility)
      ? shoulderTilt(leftShoulder, rightShoulder)
      : 0

  let issue: PostureIssueType = 'good'
  if (torsoAngleDeg !== null && torsoAngleDeg >= thresholds.torsoAngleThresholdDeg) {
    issue = 'slouching'
  } else if (neckAngleDeg >= thresholds.neckAngleThresholdDeg) {
    issue = 'forward_head'
  } else if (shoulderTiltDeg >= thresholds.shoulderTiltThresholdDeg) {
    issue = 'leaning'
  }

  return { issue, quality, neckAngleDeg, torsoAngleDeg, shoulderTiltDeg }
}

export const POSTURE_LABELS_TH: Record<PostureIssueType, string> = {
  good: 'นั่งท่าดี',
  forward_head: 'ก้มคอ/ยื่นคอไปข้างหน้า',
  slouching: 'หลังค่อม/โน้มตัว',
  leaning: 'นั่งเอียงข้าง',
  no_person: 'ไม่พบคนในเฟรม',
}
