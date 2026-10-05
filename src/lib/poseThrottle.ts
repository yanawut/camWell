export const POSE_INTERVAL_MS = 1000 / 12

interface PoseProcessInput {
  hasLandmarker: boolean
  sourceErrorSticky: boolean
  perfNow: number
  lastPoseRunAt: number
  isVideoSource: boolean
  videoCurrentTime: number | null
  lastVideoTime: number
}

export function shouldProcessPose({
  hasLandmarker,
  sourceErrorSticky,
  perfNow,
  lastPoseRunAt,
  isVideoSource,
  videoCurrentTime,
  lastVideoTime,
}: PoseProcessInput): boolean {
  return (
    hasLandmarker &&
    !sourceErrorSticky &&
    perfNow - lastPoseRunAt >= POSE_INTERVAL_MS &&
    (!isVideoSource || videoCurrentTime !== lastVideoTime)
  )
}
