// อ่านประวัติการแจ้งเตือนที่เก็บใน camwell-backend (ตาราง alert_events) — ใช้ในหน้า /?alerts และ /?people
// (ฝั่งบันทึกดู services/alertReporter.ts)

import type { AlertCategory, AlertType } from '../types/alerts'
import { apiFetch } from './apiConfig'

export interface AlertRecord {
  id: string
  category: AlertCategory
  type: AlertType
  employeeId: string | null
  /** ชื่อปัจจุบันของพนักงาน (ถ้ายังไม่ถูกลบ) ไม่งั้นเป็นชื่อ ณ ตอนเกิดเหตุ */
  personName: string | null
  cameraId: string | null
  cameraLabel: string | null
  startedAt: number
  /** null = ไม่มีบันทึกเวลาจบ (ยังเกิดอยู่ หรือหน้าเว็บ/เครื่องดับไปก่อนส่งเวลาจบ) */
  endedAt: number | null
  metrics: Record<string, number>
}

export interface AlertSummary {
  employeeId: string
  total: number
  byCategory: Partial<Record<AlertCategory, number>>
  lastAt: number
}

export async function listAlertRecords(options: { employeeId?: string; limit?: number } = {}): Promise<AlertRecord[]> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 500) })
  if (options.employeeId) params.set('employeeId', options.employeeId)
  return apiFetch<AlertRecord[]>(`/api/alerts?${params}`)
}

/** สรุปจำนวนแจ้งเตือนรายคน — since (epoch ms) = นับเฉพาะเหตุการณ์ที่เริ่มหลังเวลานั้น ไม่ส่ง = ทั้งหมด */
export async function getAlertSummary(since?: number): Promise<AlertSummary[]> {
  return apiFetch<AlertSummary[]>(`/api/alerts/summary${since === undefined ? '' : `?since=${since}`}`)
}
