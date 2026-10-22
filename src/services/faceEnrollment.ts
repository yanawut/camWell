import type { EnrolledPerson } from '../types/identity'

const STORAGE_KEY = 'camwell:enrolled-people:v1'
const CONSENT_VERSION = 'face-recognition-v1'
// ค่ายิ่งสูงยิ่งจับคู่ได้ง่ายขึ้น แต่มีโอกาสระบุผิดคนมากขึ้น
export const FACE_MATCH_DISTANCE_THRESHOLD = 0.65

interface StoredPerson extends EnrolledPerson {
  descriptor: number[]
}

function readPeople(): StoredPerson[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((person): person is StoredPerson => {
      if (!person || typeof person !== 'object') return false
      const value = person as Partial<StoredPerson>
      return typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.descriptor)
    })
  } catch {
    return []
  }
}

function writePeople(people: StoredPerson[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(people))
}

export async function listEnrolledPeople(): Promise<EnrolledPerson[]> {
  return readPeople()
}

export async function enrollPerson(name: string, descriptor: Float32Array, consentGiven: boolean): Promise<EnrolledPerson> {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('ต้องระบุชื่อพนักงาน')
  if (!consentGiven) throw new Error('ต้องยืนยันความยินยอมก่อนลงทะเบียนใบหน้า')
  const now = Date.now()
  const person: StoredPerson = {
    id: crypto.randomUUID(),
    name: trimmedName,
    enrolledAt: now,
    consentGivenAt: now,
    consentVersion: CONSENT_VERSION,
    descriptor: Array.from(descriptor),
  }
  writePeople([...readPeople(), person])
  return person
}

export async function removePerson(id: string): Promise<void> {
  writePeople(readPeople().filter((person) => person.id !== id))
}

export interface IdentifyMatch {
  employeeId: string
  name: string
  distance: number
}

function euclideanDistance(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}

export async function identifyFace(descriptor: Float32Array): Promise<IdentifyMatch | null> {
  const current = Array.from(descriptor)
  let best: IdentifyMatch | null = null
  for (const person of readPeople()) {
    const distance = euclideanDistance(current, person.descriptor)
    if (distance <= FACE_MATCH_DISTANCE_THRESHOLD && (!best || distance < best.distance)) {
      best = { employeeId: person.id, name: person.name, distance }
    }
  }
  return best
}
