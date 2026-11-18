// ดึงรายงานประจำวันจาก camwell-backend (GET /api/reports/daily)

import type { AlertCategory } from '../types/alerts'
import { apiFetch } from './apiConfig'

export type DailyReportCategoryCounts = Record<AlertCategory, number>

export interface DailyReportHourlyBucket {
  hour: number
  total: number
  byCategory: DailyReportCategoryCounts
}

export interface DailyReportPerson {
  key: string
  employeeId: string | null
  personName: string
  cameras: string[]
  firstSeenAt: number | null
  lastSeenAt: number | null
  presenceDurationMs: number
  sessionCount: number
  totalAlerts: number
  alertDurationMs: number
  byCategory: DailyReportCategoryCounts
}

export interface DailyReportCamera {
  cameraId: string
  cameraLabel: string
  sessionCount: number
  totalAlerts: number
  byCategory: DailyReportCategoryCounts
}

export interface DailyReport {
  date: string
  startMs: number
  endMs: number
  generatedAt: number
  summary: {
    totalPeople: number
    totalSessions: number
    totalPresenceMs: number
    totalAlerts: number
    totalAlertDurationMs: number
    byCategory: DailyReportCategoryCounts
    byType: Record<string, number>
  }
  hourly: DailyReportHourlyBucket[]
  people: DailyReportPerson[]
  cameras: DailyReportCamera[]
}

export function getTodayDateInputValue(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function shiftDateInputValue(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return getTodayDateInputValue(dt)
}

export async function fetchDailyReport(date: string): Promise<DailyReport> {
  const params = new URLSearchParams({
    date,
    tzOffset: String(new Date().getTimezoneOffset()),
  })
  return apiFetch<DailyReport>(`/api/reports/daily?${params}`)
}
