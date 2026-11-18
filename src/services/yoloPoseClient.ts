import type { YoloFrameResult } from '../lib/yoloPose'

const VISION_URL = (import.meta.env.VITE_YOLO_BASE_URL ?? 'http://127.0.0.1:8001').replace(/\/+$/, '')

function frameBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('สร้างภาพสำหรับ YOLO ไม่สำเร็จ')), 'image/jpeg', 0.8)
    } catch (error) {
      reject(error)
    }
  })
}

export async function checkYoloService(): Promise<void> {
  const response = await fetch(`${VISION_URL}/health`)
  if (!response.ok) throw new Error(`YOLO service ตอบกลับ HTTP ${response.status}`)
}

export async function startRtspCamera(cameraId: string, url: string): Promise<void> {
  const response = await fetch(`${VISION_URL}/api/camera/${encodeURIComponent(cameraId)}/rtsp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(detail?.detail ?? `เชื่อมต่อ RTSP ไม่สำเร็จ (HTTP ${response.status})`)
  }
}

export function rtspStreamUrl(cameraId: string): string {
  return `${VISION_URL}/api/camera/${encodeURIComponent(cameraId)}/rtsp/stream`
}

export function stopRtspCamera(cameraId: string): void {
  void fetch(`${VISION_URL}/api/camera/${encodeURIComponent(cameraId)}/rtsp`, { method: 'DELETE' }).catch(() => undefined)
}

export async function inferYoloFrame(cameraId: string, canvas: HTMLCanvasElement): Promise<YoloFrameResult> {
  const image = await frameBlob(canvas)
  const response = await fetch(`${VISION_URL}/api/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'X-Camera-Id': cameraId },
    body: image,
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(detail?.detail ?? `YOLO service ตอบกลับ HTTP ${response.status}`)
  }
  return response.json() as Promise<YoloFrameResult>
}

export function closeYoloCamera(cameraId: string): void {
  void fetch(`${VISION_URL}/api/camera/${encodeURIComponent(cameraId)}/yolo`, { method: 'DELETE' }).catch(() => undefined)
}

export function closeVisionCamera(cameraId: string): void {
  void fetch(`${VISION_URL}/api/camera/${encodeURIComponent(cameraId)}`, { method: 'DELETE' }).catch(() => undefined)
}
