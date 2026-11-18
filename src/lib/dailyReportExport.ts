// ตัวช่วยจัดรูปแบบและส่งออกรายงานประจำวัน (CSV / JSON)

import type { DailyReport } from '../services/dailyReport'

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds === 0) return '0 วิ'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`
  if (minutes > 0) return seconds > 0 ? `${minutes} นาที ${seconds} วิ` : `${minutes} นาที`
  return `${seconds} วิ`
}

export function formatTimeShort(epochMs: number | null): string {
  if (epochMs === null) return '—'
  return new Date(epochMs).toLocaleTimeString('th-TH', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateThai(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildDailyReportCsv(report: DailyReport): string {
  const header = [
    'วันที่',
    'บุคคล',
    'employeeId',
    'กล้อง',
    'เวลาเข้าแรก',
    'เวลาออกล่าสุด',
    'เวลาอยู่หน้ากล้อง(นาที)',
    'จำนวนครั้งที่พบ',
    'แจ้งเตือนรวม',
    'ท่านั่ง',
    'ความเหนื่อยล้า',
    'ระยะห่างจอ',
    'หกล้ม',
    'เวลารวมที่เกิดแจ้งเตือน(วินาที)',
  ]

  const rows = report.people.map((person) => [
    report.date,
    person.personName,
    person.employeeId ?? '',
    person.cameras.join(' / '),
    formatTimeShort(person.firstSeenAt),
    formatTimeShort(person.lastSeenAt),
    String(Math.round(person.presenceDurationMs / 60_000)),
    String(person.sessionCount),
    String(person.totalAlerts),
    String(person.byCategory.posture),
    String(person.byCategory.fatigue),
    String(person.byCategory.distance),
    String(person.byCategory.fall),
    String(Math.round(person.alertDurationMs / 1000)),
  ])

  return [header, ...rows].map((cols) => cols.map(escapeCsvCell).join(',')).join('\r\n')
}

export function downloadDailyReportCsv(report: DailyReport): void {
  const csv = buildDailyReportCsv(report)
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `camwell-daily-report-${report.date}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadDailyReportJson(report: DailyReport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `camwell-daily-report-${report.date}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
