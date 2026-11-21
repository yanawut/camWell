import type { PostureBaseline } from '../types/posture'

const STORAGE_KEY_PREFIX = 'camwell:posture-baseline:v1:'

export function loadPostureBaseline(cameraId: string): PostureBaseline | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + cameraId)
    return raw ? (JSON.parse(raw) as PostureBaseline) : null
  } catch {
    return null
  }
}

export function savePostureBaseline(
  cameraId: string,
  baseline: PostureBaseline,
): void {
  localStorage.setItem(
    STORAGE_KEY_PREFIX + cameraId,
    JSON.stringify(baseline),
  )
}

export function clearPostureBaseline(cameraId: string): void {
  localStorage.removeItem(STORAGE_KEY_PREFIX + cameraId)
}
