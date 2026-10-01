// จัดการรายชื่อพนักงานที่ "ลงทะเบียนใบหน้า" ไว้ในเครื่องนี้ — เก็บใน localStorage เท่านั้น ไม่ส่งออกไปไหน
// ดู src/types/identity.ts สำหรับข้อควรระวังเรื่อง PDPA ก่อนใช้งานจริง

import type { EnrolledPerson } from '../types/identity'
import { FACE_MATCH_DISTANCE_THRESHOLD } from '../types/identity'

const STORAGE_KEY = 'camwell:enrolled-faces:v1'

export function listEnrolledPeople(): EnrolledPerson[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as EnrolledPerson[]
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('[faceEnrollment] อ่านรายชื่อที่ลงทะเบียนไม่สำเร็จ:', err)
    return []
  }
}

function saveAll(people: EnrolledPerson[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(people))
  } catch (err) {
    console.warn('[faceEnrollment] บันทึกรายชื่อไม่สำเร็จ:', err)
  }
}

export function enrollPerson(name: string, descriptor: Float32Array): EnrolledPerson {
  const people = listEnrolledPeople()
  const person: EnrolledPerson = {
    id: `person-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    name: name.trim(),
    descriptor: Array.from(descriptor),
    enrolledAt: Date.now(),
  }
  saveAll([...people, person])
  return person
}

export function removePerson(id: string) {
  saveAll(listEnrolledPeople().filter((p) => p.id !== id))
}

function euclideanDistance(a: number[], b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

/** หาคนที่ใกล้เคียงที่สุดจากรายชื่อที่ลงทะเบียนไว้ คืนค่า null ถ้าไม่มีใครลงทะเบียนไว้เลย */
export function findBestMatch(
  descriptor: Float32Array,
  people: EnrolledPerson[],
): { person: EnrolledPerson; distance: number } | null {
  let best: { person: EnrolledPerson; distance: number } | null = null
  for (const person of people) {
    const distance = euclideanDistance(person.descriptor, descriptor)
    if (!best || distance < best.distance) {
      best = { person, distance }
    }
  }
  return best
}

export { FACE_MATCH_DISTANCE_THRESHOLD }
