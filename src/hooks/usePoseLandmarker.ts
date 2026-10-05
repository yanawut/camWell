// โหลด MediaPipe Pose Landmarker (BlazePose) จากไฟล์ local ทั้งหมด (public/wasm + public/models)
// ไม่มีการเรียก CDN ภายนอกตอนรันจริง — เข้าเงื่อนไข "AI แบบ local" ตามที่ต้องการ

import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export type LandmarkerStatus = 'loading' | 'ready' | 'error'
export type PoseDelegate = 'GPU' | 'CPU'

/** รุ่นของ Pose Landmarker — ทุกรุ่นให้ landmark 33 จุดรูปแบบเดียวกัน ต่างกันที่ความแม่นยำ/ความเร็ว */
export const POSE_MODELS = ['lite', 'full', 'heavy'] as const
export type PoseModelVariant = (typeof POSE_MODELS)[number]
export const DEFAULT_POSE_MODEL: PoseModelVariant = 'lite'

export function poseModelFileName(model: PoseModelVariant): string {
  return `pose_landmarker_${model}.task`
}

const WASM_BASE_PATH = `${import.meta.env.BASE_URL}wasm`

/**
 * @param numPoses จำนวนคนสูงสุดที่ให้โมเดลหา — เปลี่ยนค่าแล้วโมเดลจะถูกสร้างใหม่อัตโนมัติ
 * @param model รุ่นโมเดล (ค่าเริ่มต้น lite) — เปลี่ยนค่าแล้วโมเดลจะถูกสร้างใหม่อัตโนมัติเช่นกัน
 */
export function usePoseLandmarker(numPoses: number, model: PoseModelVariant = DEFAULT_POSE_MODEL) {
  const landmarkerRef = useRef<PoseLandmarker | null>(null)
  const [status, setStatus] = useState<LandmarkerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [delegate, setDelegate] = useState<PoseDelegate | null>(null)

  useEffect(() => {
    let cancelled = false
    const modelPath = `${import.meta.env.BASE_URL}models/${poseModelFileName(model)}`

    async function init() {
      setStatus('loading')
      setError(null)
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH)

        let landmarker: PoseLandmarker
        let usedDelegate: PoseDelegate = 'GPU'
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses,
          })
        } catch (gpuErr) {
          // บาง GPU/เบราว์เซอร์ไม่รองรับ WebGL delegate — fallback ไป CPU
          console.warn('[usePoseLandmarker] สร้างด้วย GPU delegate ไม่สำเร็จ ลองใหม่ด้วย CPU:', gpuErr)
          usedDelegate = 'CPU'
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numPoses,
          })
        }

        if (cancelled) {
          landmarker.close()
          return
        }
        landmarkerRef.current = landmarker
        setDelegate(usedDelegate)
        setStatus('ready')
      } catch (err) {
        console.error('[usePoseLandmarker] โหลดโมเดลไม่สำเร็จ:', err)
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : `โหลดโมเดลไม่สำเร็จ - ตรวจสอบว่ารัน \`npm run setup:assets\` แล้ว และมีไฟล์ public/models/${poseModelFileName(model)}`,
          )
          setStatus('error')
        }
      }
    }

    init()

    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [numPoses, model])

  return { landmarkerRef, status, error, delegate }
}
