import type { PostureBaseline, PostureFeatures } from '../types/posture'

export const MIN_CALIBRATION_SAMPLES = 12

export function median(values: number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeBaseline(
  samples: PostureFeatures[],
  now: number,
): PostureBaseline | null {
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null

  const neckAngleDeg = median(samples.map((sample) => sample.neckAngleDeg))
  const shoulderTiltDeg = median(samples.map((sample) => sample.shoulderTiltDeg))

  if (neckAngleDeg === null || shoulderTiltDeg === null) return null

  return {
    neckAngleDeg,
    torsoAngleDeg: median(
      samples.flatMap((sample) =>
        sample.torsoAngleDeg === null ? [] : [sample.torsoAngleDeg],
      ),
    ),
    shoulderTiltDeg,
    headHeightRatio: median(
      samples.flatMap((sample) =>
        sample.headHeightRatio === null ? [] : [sample.headHeightRatio],
      ),
    ),
    createdAt: now,
  }
}
