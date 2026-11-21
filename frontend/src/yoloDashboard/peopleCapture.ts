import type { Box } from '../yoloConsole/types'

// ขั้นตอนถ่ายหน้าจากกล้องในฟอร์มเพิ่มคน: คำบอกบนจอ การตัดรูปรอบหน้า และข้อความเมื่อเปิดกล้องไม่ได้

/** ทำตามคำบอกทีละข้อ ได้ภาพหลายมุมให้ yolo-backend เลือก */
export const CAPTURE_STEPS: readonly { text: string; ms: number }[] = [
  { text: 'มองตรงที่กล้อง', ms: 2000 },
  { text: 'หันซ้ายช้าๆ', ms: 2200 },
  { text: 'หันขวาช้าๆ', ms: 2200 },
  { text: 'เงยหน้าเล็กน้อย', ms: 1800 },
  { text: 'ก้มหน้าเล็กน้อย', ms: 1800 },
]

export const CAPTURE_MS = CAPTURE_STEPS.reduce((n, s) => n + s.ms, 0)

export const SHOT_EVERY_MS = 250

/** คำบอกที่ต้องขึ้นบนจอเมื่อบันทึกไปแล้ว elapsedMs */
export function captureStepAt(elapsedMs: number) {
  let end = 0
  for (const step of CAPTURE_STEPS) {
    end += step.ms
    if (elapsedMs < end) return step
  }
  return CAPTURE_STEPS[CAPTURE_STEPS.length - 1]
}

/** สี่เหลี่ยมจัตุรัสรอบหน้า กว้างสองเท่าของด้านยาวของกรอบหน้า: รูปย่อดูดี และเก็บภาพห้องไว้น้อยลง ไม่ล้นขอบภาพ */
export function faceCropRect([x1, y1, x2, y2]: Box, width: number, height: number) {
  const side = Math.min(Math.max(x2 - x1, y2 - y1) * 2, width, height)
  const x = Math.min(Math.max(0, (x1 + x2) / 2 - side / 2), width - side)
  const y = Math.min(Math.max(0, (y1 + y2) / 2 - side / 2), height - side)
  return { x, y, side }
}

const CAMERA_ERRORS: Record<string, string> = {
  NotAllowedError: 'ไม่ได้รับอนุญาตให้ใช้กล้อง กดอนุญาตกล้องที่แถบที่อยู่ของเบราว์เซอร์ แล้วลองอีกครั้ง',
  NotFoundError: 'ไม่พบกล้องในเครื่องนี้',
  NotReadableError: 'กล้องถูกโปรแกรมอื่นใช้อยู่ ปิดโปรแกรมนั้นแล้วลองอีกครั้ง',
}

export function cameraErrorText(err: unknown) {
  const name = (err as { name?: unknown } | null)?.name
  if (typeof name === 'string' && Object.hasOwn(CAMERA_ERRORS, name)) return CAMERA_ERRORS[name]
  return err instanceof Error ? err.message : String(err)
}
