// บันทึกการเข้า-ออก (Phase 2) — CameraStage เปิดช่วงเมื่อระบุตัวตนคนในกล้องได้ และปิดเมื่อคนนั้นหายไปจากเฟรม
// นานพอ ข้อมูลเก็บที่ camwell-backend (ตาราง presence_sessions) ให้ AttendancePanel ดึงมาแสดง

import { apiFetch } from './apiConfig'

export interface PresenceSession {
  id: string
  employeeId: string | null
  personName: string
  cameraId: string
  cameraLabel: string
  startedAt: number
  endedAt: number | null
}

export async function listPresence(limit = 50): Promise<PresenceSession[]> {
  return apiFetch<PresenceSession[]>(`/api/presence?limit=${limit}`)
}

export async function startPresence(input: {
  employeeId: string
  personName: string
  cameraId: string
  cameraLabel: string
  startedAt: number
}): Promise<PresenceSession> {
  return apiFetch<PresenceSession>('/api/presence', { method: 'POST', body: JSON.stringify(input) })
}

export async function endPresence(id: string, endedAt: number): Promise<void> {
  await apiFetch<void>(`/api/presence/${encodeURIComponent(id)}/end`, {
    method: 'POST',
    body: JSON.stringify({ endedAt }),
    // ปิดแท็บ/รีเฟรชหน้าระหว่างที่ยังมีคนอยู่หน้ากล้อง — keepalive ให้ request นี้ส่งต่อจนจบแม้หน้าเว็บถูกปิดไปแล้ว
    keepalive: true,
  })
}
