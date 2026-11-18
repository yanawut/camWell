// ค่าตั้งค่าแนะนำ (Preset) ตามตำแหน่งการติดตั้งกล้อง: มุมราบ vs มุมสูง

import { DEFAULT_FALL_THRESHOLDS, type FallThresholds } from '../types/fall'
import { DEFAULT_THRESHOLDS, type PostureThresholds } from '../types/posture'
import { DEFAULT_DISTANCE_THRESHOLDS, type DistanceThresholds } from '../types/wellbeing'

export type CameraAngleId = 'flat' | 'high'

export interface CameraAnglePreset {
  id: CameraAngleId
  title: string
  subtitle: string
  highlights: string[]
  postureThresholds: PostureThresholds
  fallThresholds: FallThresholds
  distanceThresholds: DistanceThresholds
}

export const CAMERA_ANGLE_PRESETS: Record<CameraAngleId, CameraAnglePreset> = {
  flat: {
    id: 'flat',
    title: 'กล้องมุมราบ (ระดับสายตา)',
    subtitle: 'เว็บแคมบนจอคอมพิวเตอร์ หรือตั้งบนโต๊ะระดับหน้าอก–ใบหน้า',
    highlights: [
      'มุมคอ 25° · หลังค่อม 15° · หัวต่ำ 15% (มาตรฐานแม่นยำสูง)',
      'ตรวจจับหกล้ม: ร่วงเร็ว 0.20 ภายใน 700 ms · มุมล้ม 55°',
      'เห็นใบหน้าชัด เหมาะกับฟีเจอร์ความเหนื่อยล้าและระยะห่างจอ (1.35x)',
    ],
    postureThresholds: { ...DEFAULT_THRESHOLDS },
    fallThresholds: { ...DEFAULT_FALL_THRESHOLDS },
    distanceThresholds: { ...DEFAULT_DISTANCE_THRESHOLDS },
  },
  high: {
    id: 'high',
    title: 'กล้องมุมสูง (มุมห้อง / เพดาน)',
    subtitle: 'กล้อง IP หรือกล้องติดมุมสูงกดลงมา ~30°–45°',
    highlights: [
      'ผ่อนเกณฑ์มุมคอ 32° · หลังค่อม 22° · หัวต่ำ 22% ลดเตือนพลาดจากมุมกด',
      'ตรวจจับหกล้มไวขึ้น: ร่วง 0.14 ภายใน 900 ms · มุมล้ม 50° (ชดเชยภาพมุมสูง)',
      'หน่วงเวลาท่านั่ง 10s และปรับระยะห่างจอ 1.45x (แนะนำ Calibrate หลังติดตั้ง)',
    ],
    postureThresholds: {
      ...DEFAULT_THRESHOLDS,
      neckAngleThresholdDeg: 32,
      torsoAngleThresholdDeg: 22,
      shoulderTiltThresholdDeg: 12,
      headDropThreshold: 0.22,
      sustainedMs: 10000,
    },
    fallThresholds: {
      ...DEFAULT_FALL_THRESHOLDS,
      dropRatioThreshold: 0.14,
      dropWindowMs: 900,
      fallTorsoAngleDeg: 50,
      disappearGraceMs: 3000,
    },
    distanceThresholds: {
      ...DEFAULT_DISTANCE_THRESHOLDS,
      tooCloseRatio: 1.45,
    },
  },
}

export function getMatchingCameraAnglePreset(
  posture: PostureThresholds,
  fall: FallThresholds,
  distance: DistanceThresholds,
): CameraAngleId | null {
  for (const preset of Object.values(CAMERA_ANGLE_PRESETS)) {
    const pMatch =
      posture.neckAngleThresholdDeg === preset.postureThresholds.neckAngleThresholdDeg &&
      posture.torsoAngleThresholdDeg === preset.postureThresholds.torsoAngleThresholdDeg &&
      posture.shoulderTiltThresholdDeg === preset.postureThresholds.shoulderTiltThresholdDeg &&
      posture.headDropThreshold === preset.postureThresholds.headDropThreshold &&
      posture.sustainedMs === preset.postureThresholds.sustainedMs
    const fMatch =
      fall.dropRatioThreshold === preset.fallThresholds.dropRatioThreshold &&
      fall.dropWindowMs === preset.fallThresholds.dropWindowMs &&
      fall.fallTorsoAngleDeg === preset.fallThresholds.fallTorsoAngleDeg &&
      fall.disappearGraceMs === preset.fallThresholds.disappearGraceMs
    const dMatch = distance.tooCloseRatio === preset.distanceThresholds.tooCloseRatio
    if (pMatch && fMatch && dMatch) return preset.id
  }
  return null
}
