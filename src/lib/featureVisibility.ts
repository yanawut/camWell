export const DEFAULT_FACE_FEATURES_ENABLED = false

export interface CameraPeopleVisibility {
  showPeopleList: boolean
  showEmptyState: boolean
}

export function getCameraPeopleVisibility(peopleCount: number): CameraPeopleVisibility {
  return {
    showPeopleList: peopleCount > 0,
    showEmptyState: peopleCount === 0,
  }
}
