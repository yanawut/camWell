// ค่าคงที่กลางสำหรับโหมดการตรวจจับ ใช้ร่วมกันทั้ง pose landmarker และ face-api
//   - workstation: 1 กล้อง 1 คน (โน้ตบุ๊ก/คอมตั้งโต๊ะส่วนตัว) — เร็วที่สุดและเป็นค่าเริ่มต้น
//   - multi: กล้องตัวเดียวดูหลายคนพร้อมกัน — ใช้ทรัพยากรมากขึ้นตามจำนวนคน

export type DetectionMode = 'workstation' | 'multi'

export const MAX_TRACKED_PEOPLE = 4

export function maxPeopleFor(mode: DetectionMode): number {
  return mode === 'workstation' ? 1 : MAX_TRACKED_PEOPLE
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
