// ประมาณระยะห่างจากจอ โดยเทียบ "ขนาดใบหน้าในเฟรม" (ความกว้างกรอบใบหน้าที่ตรวจจับได้ เป็นพิกเซล)
// กับค่า baseline ที่ผู้ใช้ calibrate ไว้ตอนนั่งในระยะที่เหมาะสม — ยิ่งนั่งใกล้จอ หน้าจะยิ่งใหญ่ขึ้นในเฟรม
// วิธีนี้ไม่ต้องรู้ขนาดจอ/กล้องจริง ใช้ได้กับทุกอุปกรณ์ เพราะเทียบกับ baseline ของตัวเองเท่านั้น

import type { DistanceIssueType, DistanceThresholds } from '../types/wellbeing'

export interface DistanceAnalysisResult {
  issue: DistanceIssueType
  relativeSize: number | null
}

export function analyzeDistanceFrame(
  faceBoxWidthPx: number | null,
  baselineWidthPx: number | null,
  thresholds: DistanceThresholds,
): DistanceAnalysisResult {
  if (faceBoxWidthPx === null) {
    return { issue: 'no_face', relativeSize: null }
  }
  if (!baselineWidthPx) {
    // ยังไม่ได้ calibrate — รายงานขนาดปัจจุบันแต่ไม่ตัดสินว่าใกล้/ไกล
    return { issue: 'good', relativeSize: null }
  }
  const relativeSize = faceBoxWidthPx / baselineWidthPx
  const issue: DistanceIssueType = relativeSize >= thresholds.tooCloseRatio ? 'too_close' : 'good'
  return { issue, relativeSize }
}

export const DISTANCE_LABELS_TH: Record<DistanceIssueType, string> = {
  good: 'ระยะห่างเหมาะสม',
  too_close: 'นั่งใกล้จอเกินไป',
  no_face: 'ไม่พบใบหน้า',
}
