// คุยกับ camwell-backend (Phase 2) เพื่อลงทะเบียน/ลบ/จับคู่ใบหน้าพนักงาน — เดิม (Phase 1) ทำทุกอย่างในเบราว์เซอร์
// เอง (เก็บลง localStorage + เทียบ descriptor เอง) ตอนนี้ย้ายไปให้ backend ทำแทนทั้งหมด เพื่อให้พนักงานคนเดียว
// ถูกจำได้ทุกเครื่อง/ทุกกล้องในออฟฟิศ (ไม่ใช่แค่เครื่องที่ลงทะเบียนไว้) และไม่ต้องส่ง descriptor ดิบของทุกคน
// ไปให้ทุกเบราว์เซอร์ถืออยู่ — ดู camwell-backend/README.md สำหรับรายละเอียด API และ src/types/identity.ts
// สำหรับข้อควรระวังเรื่อง PDPA

import type { EnrolledPerson } from '../types/identity'
import { apiFetch } from './apiConfig'

export async function listEnrolledPeople(): Promise<EnrolledPerson[]> {
  return apiFetch<EnrolledPerson[]>('/api/employees')
}

/**
 * ลงทะเบียนพนักงานใหม่ — ต้องส่ง consentGiven: true มาด้วยเสมอ (UI ต้องบังคับให้ติ๊กยืนยันว่าขอความยินยอม
 * จากพนักงานแล้วก่อนเรียกฟังก์ชันนี้ ดู CameraStage.tsx) backend จะปฏิเสธคำขอถ้าไม่มีค่านี้
 */
export async function enrollPerson(name: string, descriptor: Float32Array, consentGiven: boolean): Promise<EnrolledPerson> {
  return apiFetch<EnrolledPerson>('/api/employees', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim(), descriptor: Array.from(descriptor), consentGiven }),
  })
}

export async function removePerson(id: string): Promise<void> {
  await apiFetch<void>(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface IdentifyMatch {
  employeeId: string
  name: string
  distance: number
}

/** ถามว่า descriptor ที่ตรวจพบตอนนี้ตรงกับใครที่ลงทะเบียนไว้ไหม — backend เป็นคนเทียบให้ทั้งหมด คืน null ถ้าไม่ตรงกับใคร */
export async function identifyFace(descriptor: Float32Array): Promise<IdentifyMatch | null> {
  const result = await apiFetch<{ matched: boolean; employeeId?: string; name?: string; distance?: number }>(
    '/api/employees/identify',
    { method: 'POST', body: JSON.stringify({ descriptor: Array.from(descriptor) }) },
  )
  if (!result.matched || !result.employeeId || !result.name || result.distance === undefined) return null
  return { employeeId: result.employeeId, name: result.name, distance: result.distance }
}
