// คำนวณความเหนื่อยล้าจาก 68 จุด landmark ใบหน้า (มาตรฐาน dlib/iBUG 68-point ที่ @vladmandic/face-api ใช้)
// อ้างอิง index จุดตา: 36-41 (ตาข้างหนึ่ง), 42-47 (ตาอีกข้าง) / จุดปาก: 48-67 (ภายนอก 48-59, ภายใน 60-67)

import type { FatigueIssueType, FatigueThresholds } from '../types/wellbeing'

interface Pt {
  x: number
  y: number
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Eye Aspect Ratio ของตา 1 ข้าง จาก 6 จุด [p1..p6] ตามลำดับมาตรฐาน (มุมซ้าย, บน2จุด, มุมขวา, ล่าง2จุด) */
function eyeAspectRatio(eye: Pt[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye
  const vertical = dist(p2, p6) + dist(p3, p5)
  const horizontal = dist(p1, p4) * 2
  if (horizontal === 0) return 0.3
  return vertical / horizontal
}

/** Mouth Aspect Ratio จากจุดปากด้านใน (60-67) — ไวต่อการ "อ้าปากกว้าง" มากกว่าปากด้านนอก */
function mouthAspectRatio(innerMouth: Pt[]): number {
  // innerMouth = positions[60..67] (8 จุด)
  const [p60, p61, p62, p63, p64, p65, p66, p67] = innerMouth
  const vertical = dist(p61, p67) + dist(p62, p66) + dist(p63, p65)
  const horizontal = dist(p60, p64) * 3
  if (horizontal === 0) return 0
  return vertical / horizontal
}

/** แปลง EAR (ยิ่งต่ำ=ยิ่งหลับ) ให้เป็นคะแนน "ยิ่งสูง=ยิ่งแย่" ช่วง 0-1 เทียบจาก EAR ปกติ ~0.3, หลับสนิท ~0.05 */
function toEyeClosedScore(ear: number): number {
  const OPEN_EAR = 0.3
  const CLOSED_EAR = 0.08
  const score = (OPEN_EAR - ear) / (OPEN_EAR - CLOSED_EAR)
  return Math.min(1, Math.max(0, score))
}

export interface FatigueAnalysisInput {
  /** positions[36..41] */
  rightEye: Pt[]
  /** positions[42..47] */
  leftEye: Pt[]
  /** positions[60..67] */
  innerMouth: Pt[]
}

export interface FatigueAnalysisResult {
  issue: FatigueIssueType
  eyeAspectRatio: number
  eyeClosedScore: number
  mouthAspectRatio: number
}

/**
 * วิเคราะห์ 1 เฟรม -> EAR/MAR + สรุปว่าตาหลับอยู่หรือไม่ (ไม่รวม logic นับจำนวนหาว ซึ่งต้อง track ข้ามเฟรม
 * อยู่ใน useFatigueTracking.ts เพราะต้องมี state คงอยู่ระหว่างเฟรม)
 */
export function analyzeFatigueFrame(
  input: FatigueAnalysisInput,
  thresholds: FatigueThresholds,
): FatigueAnalysisResult {
  const earRight = eyeAspectRatio(input.rightEye)
  const earLeft = eyeAspectRatio(input.leftEye)
  const ear = (earRight + earLeft) / 2
  const eyeClosedScore = toEyeClosedScore(ear)
  const mar = mouthAspectRatio(input.innerMouth)

  const issue: FatigueIssueType = eyeClosedScore >= thresholds.eyeClosedThreshold ? 'drowsy' : 'good'

  return { issue, eyeAspectRatio: ear, eyeClosedScore, mouthAspectRatio: mar }
}

export const FATIGUE_LABELS_TH: Record<FatigueIssueType, string> = {
  good: 'ปกติ ไม่ง่วง',
  drowsy: 'ง่วง/หลับตานาน',
  frequent_yawning: 'หาวถี่ผิดปกติ',
  no_face: 'ไม่พบใบหน้า',
}
