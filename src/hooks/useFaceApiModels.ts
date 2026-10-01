// โหลดโมเดลของ @vladmandic/face-api จากไฟล์ local ทั้งหมด (public/models/face-api)
// ไม่มีการเรียก CDN ภายนอกตอนรันจริง เช่นเดียวกับ Pose Landmarker

import { useEffect, useState } from 'react'
import * as faceapi from '@vladmandic/face-api'

export type FaceApiStatus = 'loading' | 'ready' | 'error'

const MODEL_URL = `${import.meta.env.BASE_URL}models/face-api`

let loadPromise: Promise<void> | null = null

function loadModelsOnce(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => undefined)
  }
  return loadPromise
}

export function useFaceApiModels() {
  const [status, setStatus] = useState<FaceApiStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadModelsOnce()
      .then(() => {
        if (cancelled) return
        setStatus('ready')
      })
      .catch((err) => {
        console.error('[useFaceApiModels] โหลดโมเดล face-api ไม่สำเร็จ:', err)
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'โหลดโมเดล face-api ไม่สำเร็จ - ตรวจสอบว่ามีไฟล์ใน public/models/face-api ครบ (ดู README ในโฟลเดอร์นั้น)',
        )
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { status, error }
}
