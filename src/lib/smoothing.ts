import type { PostureFeatures } from '../types/posture'

export function ema(previous: number | null, current: number, alpha: number): number {
  return previous === null ? current : alpha * current + (1 - alpha) * previous
}

export function smoothFeatures(
  previous: PostureFeatures | null,
  current: PostureFeatures,
  alpha: number,
): PostureFeatures {
  if (!previous) return current

  return {
    quality: current.quality,
    neckAngleDeg: ema(previous.neckAngleDeg, current.neckAngleDeg, alpha),
    torsoAngleDeg:
      current.torsoAngleDeg === null
        ? null
        : ema(previous.torsoAngleDeg, current.torsoAngleDeg, alpha),
    shoulderTiltDeg: ema(previous.shoulderTiltDeg, current.shoulderTiltDeg, alpha),
    headHeightRatio:
      current.headHeightRatio === null
        ? null
        : ema(previous.headHeightRatio, current.headHeightRatio, alpha),
  }
}
