import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { yoloService, type LiveState } from './yoloService'

/** อ่านค่าจากสถานะสดของ yolo-backend — select ต้องคืนค่าที่มีอยู่แล้วใน state (ห้ามสร้าง object ใหม่ทุกครั้ง) */
export function useYoloLive<T>(select: (state: LiveState) => T): T {
  return useSyncExternalStore(yoloService.subscribe, () => select(yoloService.getState()))
}

/** สัดส่วนภาพของแหล่งปัจจุบันสำหรับ CSS aspect-ratio (กล้อง 4:3, วิดีโอแนวตั้ง ฯลฯ) — ยังไม่มีภาพ = 16:9 */
export function useFrameAspect(): string {
  return useYoloLive((s) => (s.snapshot ? `${s.snapshot.size[0]} / ${s.snapshot.size[1]}` : '16 / 9'))
}

/**
 * วาด canvas ใหม่ทุกครั้งที่มีเฟรม/สถานะใหม่ ทุกครั้งที่ component render ใหม่ (เช่นสลับ layer) และตอนย่อ/ขยายหน้าจอ
 * โดยไม่ทำให้ React render ตามทุกเฟรม
 */
export function useLiveDraw(ref: RefObject<HTMLCanvasElement | null>, draw: (canvas: HTMLCanvasElement, state: LiveState) => void) {
  const drawRef = useRef(draw)
  const scheduleRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    drawRef.current = draw
    scheduleRef.current?.()
  })

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const canvas = ref.current
        if (canvas) drawRef.current(canvas, yoloService.getState())
      })
    }
    scheduleRef.current = schedule
    schedule()
    const unsubscribe = yoloService.subscribe(schedule)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      unsubscribe()
      window.removeEventListener('resize', schedule)
      scheduleRef.current = null
    }
  }, [ref])
}
