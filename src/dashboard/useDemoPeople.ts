import { useEffect, useState } from 'react'
import type { CameraSlot } from '../types/cameraSource'
import type { PersonSummary } from '../types/person'
import { MAX_TRACKED_PEOPLE } from '../lib/multiPerson'

// โหมดสาธิต (/?dashboard&demo) — จำลองคนเดินเข้า/ออกห้องโดยไม่ต้องมีกล้อง ใช้โชว์หน้าตา Dashboard หรือทดสอบ
// animation เข้า/ออก: ทุก DEMO_TICK_MS สุ่มให้มีคนเข้า 1 คนหรือออก 1 คนในห้องใดห้องหนึ่ง

const DEMO_TICK_MS = 2500
const DEMO_NAMES = ['สมชาย', 'สุดา', 'คนที่ 7', 'วิภา', 'อนันต์', 'คนที่ 12', 'มาลี', 'ธนา']

let demoCounter = 0

function makeDemoPerson(): PersonSummary {
  demoCounter += 1
  const name = DEMO_NAMES[demoCounter % DEMO_NAMES.length]
  const roll = demoCounter % 5
  return {
    trackId: `demo-${demoCounter}`,
    label: name,
    employeeId: `demo-employee-${name}`,
    postureStatus: roll === 1 ? 'ก้มคอ/ยื่นคอไปข้างหน้า' : 'ท่าทางปกติ',
    postureAlertActive: roll === 1,
    fatigueActive: roll === 3,
    distanceActive: false,
    yawnCount: 0,
  }
}

export function useDemoPeople(enabled: boolean, cameraSlots: CameraSlot[]): Record<string, PersonSummary[]> | null {
  const [demo, setDemo] = useState<Record<string, PersonSummary[]>>({})

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      setDemo((prev) => {
        if (cameraSlots.length === 0) return prev
        const slot = cameraSlots[Math.floor(Math.random() * cameraSlots.length)]
        const people = prev[slot.id] ?? []
        const shouldEnter =
          people.length === 0 || (people.length < MAX_TRACKED_PEOPLE && Math.random() < 0.6)
        const leaverIndex = Math.floor(Math.random() * people.length)
        const nextPeople = shouldEnter ? [...people, makeDemoPerson()] : people.filter((_, i) => i !== leaverIndex)
        return { ...prev, [slot.id]: nextPeople }
      })
    }, DEMO_TICK_MS)
    return () => window.clearInterval(timer)
  }, [enabled, cameraSlots])

  return enabled ? demo : null
}
