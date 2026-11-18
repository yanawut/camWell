import { describe, expect, it } from 'vitest'
import { CAMERA_ANGLE_PRESETS, getMatchingCameraAnglePreset } from './cameraAnglePresets'

describe('cameraAnglePresets', () => {
  it('detects matching flat and high angle presets', () => {
    const flat = CAMERA_ANGLE_PRESETS.flat
    expect(
      getMatchingCameraAnglePreset(flat.postureThresholds, flat.fallThresholds, flat.distanceThresholds),
    ).toBe('flat')

    const high = CAMERA_ANGLE_PRESETS.high
    expect(
      getMatchingCameraAnglePreset(high.postureThresholds, high.fallThresholds, high.distanceThresholds),
    ).toBe('high')
  })

  it('returns null when user customizes thresholds', () => {
    const flat = CAMERA_ANGLE_PRESETS.flat
    expect(
      getMatchingCameraAnglePreset(
        { ...flat.postureThresholds, neckAngleThresholdDeg: 28 },
        flat.fallThresholds,
        flat.distanceThresholds,
      ),
    ).toBeNull()
  })
})
