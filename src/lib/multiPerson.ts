// ค่าคงที่กลางสำหรับโหมดการตรวจจับ ใช้ร่วมกันทั้ง pose landmarker และ face-api
//   - workstation: 1 กล้อง 1 คน (โน้ตบุ๊ก/คอมตั้งโต๊ะส่วนตัว) — เร็วที่สุดและเป็นค่าเริ่มต้น
//   - multi: กล้องตัวเดียวดูหลายคนพร้อมกัน — ใช้ทรัพยากรมากขึ้นตามจำนวนคน
//   - unlimited: ไม่จำกัดจำนวนคน — YOLO / face-api รับทุกคนที่เจอในเฟรม ส่วน MediaPipe ต้องระบุ numPoses
//     เป็นตัวเลขตายตัว จึงใช้เพดาน MEDIAPIPE_MAX_POSES แทน

export type DetectionMode = 'workstation' | 'multi' | 'unlimited'

export const DETECTION_MODES: readonly DetectionMode[] = ['workstation', 'multi', 'unlimited']

export const MAX_TRACKED_PEOPLE = 4

/** เพดาน numPoses ของ MediaPipe Pose Landmarker ในโหมด unlimited (ยิ่งสูง โมเดลยิ่งช้าลง) */
export const MEDIAPIPE_MAX_POSES = 20

export function isDetectionMode(value: unknown): value is DetectionMode {
  return DETECTION_MODES.includes(value as DetectionMode)
}

export function isMultiPersonMode(mode: DetectionMode): boolean {
  return mode !== 'workstation'
}

export function maxPeopleFor(mode: DetectionMode): number {
  if (mode === 'workstation') return 1
  if (mode === 'multi') return MAX_TRACKED_PEOPLE
  return Infinity
}

/** numPoses ที่ส่งให้ MediaPipe — ต้องเป็นจำนวนเต็มเสมอ */
export function landmarkerNumPosesFor(mode: DetectionMode): number {
  return Math.min(maxPeopleFor(mode), MEDIAPIPE_MAX_POSES)
}

/** ข้อความแสดงจำนวนคนสูงสุด เช่น "4" หรือ "ไม่จำกัด" */
export function formatMaxPeople(max: number): string {
  return Number.isFinite(max) ? String(max) : 'ไม่จำกัด'
}

export function limitPeopleForMode<T>(
  items: readonly T[],
  mode: DetectionMode,
  getPriority: (item: T) => number,
): T[] {
  return [...items]
    .sort((a, b) => getPriority(b) - getPriority(a))
    .slice(0, maxPeopleFor(mode))
}
