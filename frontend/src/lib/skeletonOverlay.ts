// คำนวณเส้นโครงร่างที่จะวาดทับภาพกล้อง (ใช้แค่แสดงผล ไม่มีผลกับการตรวจจับ)
// - bones: เส้นเชื่อม landmark ตาม BlazePose 33 จุด (หน้า แขน มือ ลำตัว ขา) เฉพาะจุดที่มองเห็นชัดพอ
// - neck / spine: MediaPipe ไม่มีจุด "คอ" — วาดเส้นเดียวกับที่ extractPostureFeatures ใช้วัดมุมจริง
//   neck  = กึ่งกลางไหล่ -> หัว (กึ่งกลางหู ถ้าไม่เห็นใช้จมูก) => neckAngleDeg
//   spine = กึ่งกลางสะโพก -> กึ่งกลางไหล่ => torsoAngleDeg

import { isVisible, midOrVisible } from './postureAnalysis'
import type { Point } from '../types/posture'

// เทียบเท่า PoseLandmarker.POSE_CONNECTIONS (ไม่ import class เพื่อให้ไฟล์นี้ test ได้โดยไม่ต้องโหลด WASM)
export const POSE_CONNECTIONS: readonly [number, number][] = [
  // หน้า
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  // ลำตัว
  [11, 12], [11, 23], [12, 24], [23, 24],
  // แขน/มือซ้าย
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // แขน/มือขวา
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // ขาซ้าย
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // ขาขวา
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
]

/**
 * basic = โครงร่างเดิม 10 เส้น (ช่วงบน + หู-ไหล่) ไม่กรอง visibility — ค่าเริ่มต้น
 * full  = ครบ 35 เส้น กรอง visibility + เส้นคอ/กระดูกสันหลังที่ใช้วัดมุมจริง
 */
export const SKELETON_MODES = ['basic', 'full'] as const
export type SkeletonMode = (typeof SKELETON_MODES)[number]
export const DEFAULT_SKELETON_MODE: SkeletonMode = 'basic'

export const BASIC_SKELETON_EDGES: readonly [number, number][] = [
  [11, 12],
  [23, 24],
  [11, 23],
  [12, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [7, 11],
  [8, 12],
]

const LM = { NOSE: 0, LEFT_EAR: 7, RIGHT_EAR: 8, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_HIP: 23, RIGHT_HIP: 24 }

export interface SkeletonSegments {
  bones: [Point, Point][]
  neck: [Point, Point] | null
  spine: [Point, Point] | null
}

/** landmarks เป็นพิกัด normalized (0-1) — ผู้เรียกคูณขนาดเฟรมเอง */
export function buildSkeletonSegments(landmarks: readonly Point[], minVisibility: number): SkeletonSegments {
  const bones: [Point, Point][] = []
  for (const [a, b] of POSE_CONNECTIONS) {
    const p1 = landmarks[a]
    const p2 = landmarks[b]
    if (isVisible(p1, minVisibility) && isVisible(p2, minVisibility)) bones.push([p1, p2])
  }

  const shoulderMid = midOrVisible(landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER], minVisibility)
  const hipMid = midOrVisible(landmarks[LM.LEFT_HIP], landmarks[LM.RIGHT_HIP], minVisibility)
  const nose = landmarks[LM.NOSE]
  const headPoint =
    midOrVisible(landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR], minVisibility) ??
    (isVisible(nose, minVisibility) ? nose : undefined)

  return {
    bones,
    neck: shoulderMid && headPoint ? [shoulderMid, headPoint] : null,
    spine: shoulderMid && hipMid ? [hipMid, shoulderMid] : null,
  }
}
