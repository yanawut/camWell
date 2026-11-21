import { useCallback, useEffect, useRef, useState } from 'react'
import type { Box, FaceCaptureResult } from '../yoloConsole/types'
import { describeRejects } from '../yoloConsole/wellness'
import { yoloService } from '../yoloConsole/yoloService'
import { RecordGlyph } from './marks'
import { CAPTURE_MS, captureStepAt, cameraErrorText, faceCropRect, SHOT_EVERY_MS } from './peopleCapture'

type Capture =
  | { phase: 'opening' }
  /** empty = ถ่ายครั้งก่อนแล้วไม่ได้ภาพที่ใช้ได้เลย */
  | { phase: 'ready'; empty: FaceCaptureResult | null }
  | { phase: 'recording'; elapsed: number; shots: number }
  | { phase: 'selecting'; shots: number }
  | { phase: 'error'; message: string }

async function cropFace(frame: Blob, box: Box, name: string): Promise<File> {
  const bitmap = await createImageBitmap(frame)
  const { x, y, side } = faceCropRect(box, bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round(side)
  canvas.getContext('2d')!.drawImage(bitmap, x, y, side, side, 0, 0, side, side)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ตัดรูปไม่สำเร็จ'))), 'image/jpeg', 0.92),
  )
  return new File([blob], name, { type: 'image/jpeg' })
}

/** ถ่ายหน้าจากกล้องของเบราว์เซอร์ราว 10 วินาที แล้วให้ yolo-backend เลือกภาพที่ดีที่สุดจากหลายมุม */
export default function PeopleFaceCapture({
  onDone,
  onClose,
}: {
  onDone: (files: File[], result: FaceCaptureResult) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const mounted = useRef(true)
  const [state, setState] = useState<Capture>({ phase: 'opening' })
  const [attempt, setAttempt] = useState(0)

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // alive แยกต่อรอบ: กล้องที่เปิดเสร็จหลังรอบนี้ถูกยกเลิก (StrictMode เปิดสองรอบ หรือกดลองใหม่) ต้องปิดทันที ไม่งั้นไฟกล้องค้าง
  useEffect(() => {
    let alive = true
    const open = async () => {
      if (!navigator.mediaDevices) throw new Error('เบราว์เซอร์อนุญาตกล้องเฉพาะเมื่อเปิดผ่าน localhost หรือ https')
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      if (!alive) {
        media.getTracks().forEach((t) => t.stop())
        return
      }
      stream.current = media
      if (video.current) {
        video.current.srcObject = media
        await video.current.play()
      }
    }
    open().then(
      () => alive && setState({ phase: 'ready', empty: null }),
      (err: unknown) => alive && setState({ phase: 'error', message: cameraErrorText(err) }),
    )
    return () => {
      alive = false
      stop()
    }
  }, [attempt, stop])

  const record = async () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    setState({ phase: 'recording', elapsed: 0, shots: 0 })
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')!
    const shots: Promise<Blob | null>[] = []
    const started = performance.now()
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const elapsed = performance.now() - started
        if (!mounted.current || elapsed >= CAPTURE_MS) {
          clearInterval(timer)
          resolve()
          return
        }
        ctx.drawImage(v, 0, 0) // ไม่กลับซ้ายขวา ตามที่ backend คาด
        shots.push(new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85)))
        setState({ phase: 'recording', elapsed, shots: shots.length })
      }, SHOT_EVERY_MS)
    })
    if (!mounted.current) return
    setState({ phase: 'selecting', shots: shots.length })
    const frames = (await Promise.all(shots)).filter((b): b is Blob => !!b)
    try {
      const res = await yoloService.captureFaces(frames)
      const files = await Promise.all(
        res.selected.map((s, i) => cropFace(frames[s.index], s.box, `camera-${i + 1}-${s.pose}.jpg`)),
      )
      if (!mounted.current) return
      if (files.length) {
        stop()
        onDone(files, res)
      } else {
        setState({ phase: 'ready', empty: res })
      }
    } catch (err) {
      if (mounted.current) setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const retry = () => {
    setState({ phase: 'opening' })
    setAttempt((n) => n + 1)
  }

  const cover =
    state.phase === 'opening' ? 'กำลังเปิดกล้อง...'
    : state.phase === 'selecting' ? `กำลังเลือกภาพที่ดีที่สุดจาก ${state.shots} ภาพ...`
    : state.phase === 'error' ? state.message
    : null

  return (
    <div className="yd-people-capture">
      <div className="yd-people-capture-view">
        <video ref={video} muted playsInline aria-label="ภาพจากกล้อง" />
        <div className="yd-people-capture-oval" aria-hidden="true" />
        {state.phase === 'recording' && (
          <>
            <p className="yd-people-capture-step" aria-live="polite">{captureStepAt(state.elapsed).text}</p>
            <div className="yd-people-capture-progress" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (state.elapsed / CAPTURE_MS) * 100)}%` }} />
            </div>
          </>
        )}
        {cover && (
          <p className={`yd-people-capture-cover${state.phase === 'error' ? ' is-error' : ''}`} role={state.phase === 'error' ? 'alert' : 'status'}>
            {cover}
          </p>
        )}
      </div>

      {state.phase === 'ready' &&
        (state.empty ? (
          <p className="yd-error">
            ไม่ได้ภาพที่ใช้ได้เลย ({describeRejects(state.empty)}) ลองใหม่โดยยืนใกล้ขึ้นและแสงสว่างพอ
          </p>
        ) : (
          <p className="yd-fine">
            ยืนคนเดียวให้หน้าอยู่ในวงรี กด "เริ่มบันทึก" แล้วทำตามคำบอกบนจอ ราว {Math.round(CAPTURE_MS / 1000)} วินาที
            หันช้าๆ จะได้ภาพไม่เบลอ
          </p>
        ))}

      <div className="yd-actions">
        {state.phase === 'ready' && (
          <button type="button" className="yd-btn" onClick={() => void record()}>
            <RecordGlyph />
            เริ่มบันทึก
          </button>
        )}
        {state.phase === 'error' && (
          <button type="button" className="yd-btn-line" onClick={retry}>
            ลองเปิดกล้องอีกครั้ง
          </button>
        )}
        <button type="button" className="yd-btn-line" onClick={onClose} disabled={state.phase === 'selecting'}>
          ปิดกล้อง
        </button>
      </div>
    </div>
  )
}
