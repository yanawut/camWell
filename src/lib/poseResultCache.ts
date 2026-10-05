export function nextCachedPoseResult<T>(cached: T | null, detected: T | null, sourceChanged = false): T | null {
  if (sourceChanged) return null
  return detected ?? cached
}
