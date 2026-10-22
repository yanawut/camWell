import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { MAX_TRACKED_PEOPLE } from '../lib/multiPerson'

export type PoseModel = 'lite' | 'full' | 'heavy'
export type LandmarkerStatus = 'loading' | 'ready' | 'error'

const WASM_BASE_PATH = `${import.meta.env.BASE_URL}wasm`
const MODEL_PATHS: Record<PoseModel, string> = {
  lite: `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`,
  full: `${import.meta.env.BASE_URL}models/pose_landmarker_full.task`,
  heavy: `${import.meta.env.BASE_URL}models/pose_landmarker_heavy.task`,
}

export function usePoseLandmarker(model: PoseModel = 'lite') {
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const [status, setStatus] = useState<LandmarkerStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      setStatus('loading'); setError(null)
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH)
        const options = (delegate: 'GPU' | 'CPU') => ({ baseOptions: { modelAssetPath: MODEL_PATHS[model], delegate }, runningMode: 'VIDEO' as const, numPoses: MAX_TRACKED_PEOPLE })
        let landmarker: PoseLandmarker
        try { landmarker = await PoseLandmarker.createFromOptions(vision, options('GPU')) }
        catch { landmarker = await PoseLandmarker.createFromOptions(vision, options('CPU')) }
        if (cancelled) { landmarker.close(); return }
        landmarkerRef.current = landmarker; setStatus('ready')
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : 'โหลดโมเดลไม่สำเร็จ'); setStatus('error') }
      }
    }
    init()
    return () => { cancelled = true; landmarkerRef.current?.close(); landmarkerRef.current = null }
  }, [model])
  return { landmarkerRef, status, error }
}
