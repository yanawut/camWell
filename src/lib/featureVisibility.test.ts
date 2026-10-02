import { describe, expect, it } from 'vitest'
import { DEFAULT_FACE_FEATURES_ENABLED, getCameraPeopleVisibility } from './featureVisibility'

describe('DEFAULT_FACE_FEATURES_ENABLED', () => {
  it('starts face-dependent features disabled', () => {
    expect(DEFAULT_FACE_FEATURES_ENABLED).toBe(false)
  })
})

describe('getCameraPeopleVisibility', () => {
  it('shows either the pose people list or its empty state without a face-feature dependency', () => {
    expect(getCameraPeopleVisibility(0)).toEqual({
      showPeopleList: false,
      showEmptyState: true,
    })
    expect(getCameraPeopleVisibility(2)).toEqual({
      showPeopleList: true,
      showEmptyState: false,
    })
  })
})
