import { describe, expect, it } from 'vitest'
import { POSE_INTERVAL_MS, shouldProcessPose } from './poseThrottle'

describe('shouldProcessPose', () => {
  it('throttles IP camera ticks until the pose interval elapses', () => {
    const base = {
      hasLandmarker: true,
      sourceErrorSticky: false,
      lastPoseRunAt: 0,
      isVideoSource: false,
      videoCurrentTime: null,
      lastVideoTime: -1,
    }

    expect(shouldProcessPose({ ...base, perfNow: POSE_INTERVAL_MS - 0.01 })).toBe(false)
    expect(shouldProcessPose({ ...base, perfNow: POSE_INTERVAL_MS })).toBe(true)
  })

  it('throttles local video even when a new frame is available', () => {
    const base = {
      hasLandmarker: true,
      sourceErrorSticky: false,
      lastPoseRunAt: 1000,
      isVideoSource: true,
      videoCurrentTime: 12.6,
      lastVideoTime: 12.5,
    }

    expect(shouldProcessPose({ ...base, perfNow: 1000 + POSE_INTERVAL_MS - 1 })).toBe(false)
  })

  it('keeps the video new-frame check in addition to the throttle', () => {
    const base = {
      hasLandmarker: true,
      sourceErrorSticky: false,
      perfNow: 2000,
      lastPoseRunAt: 0,
      isVideoSource: true,
      lastVideoTime: 12.5,
    }

    expect(shouldProcessPose({ ...base, videoCurrentTime: 12.5 })).toBe(false)
    expect(shouldProcessPose({ ...base, videoCurrentTime: 12.6 })).toBe(true)
  })

  it('does not process without a landmarker or after a sticky source error', () => {
    const base = {
      perfNow: 2000,
      lastPoseRunAt: 0,
      isVideoSource: false,
      videoCurrentTime: null,
      lastVideoTime: -1,
    }

    expect(shouldProcessPose({ ...base, hasLandmarker: false, sourceErrorSticky: false })).toBe(false)
    expect(shouldProcessPose({ ...base, hasLandmarker: true, sourceErrorSticky: true })).toBe(false)
  })
})
