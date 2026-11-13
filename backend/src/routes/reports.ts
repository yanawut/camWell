import { Router, type Request, type Response } from 'express'
import { getDb, type AlertEventRow, type PresenceSessionRow } from '../db.js'
import { buildDailyReport, formatLocalDate, parseLocalDayRange } from '../lib/dailyReport.js'

export const reportsRouter = Router()

// GET /api/reports/daily?date=YYYY-MM-DD&tzOffset=-420
// สรุปรายงานประจำวัน: จำนวนคน, เวลาที่อยู่หน้ากล้อง, แจ้งเตือนแยกตามหมวด/ประเภท/ชั่วโมง/บุคคล/กล้อง
reportsRouter.get('/daily', (req: Request, res: Response) => {
  const rawTz = req.query.tzOffset
  const parsedTz = rawTz !== undefined ? Number(rawTz) : new Date().getTimezoneOffset()
  const tzOffset = Number.isFinite(parsedTz) && Math.abs(parsedTz) <= 840 ? parsedTz : new Date().getTimezoneOffset()

  const rawDate = typeof req.query.date === 'string' && req.query.date.trim()
    ? req.query.date.trim()
    : formatLocalDate(Date.now(), tzOffset)

  const range = parseLocalDayRange(rawDate, tzOffset)
  if (!range) {
    res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    return
  }

  const db = getDb()

  const alertRows = db
    .prepare(
      `SELECT a.id, a.category, a.type, a.employee_id, COALESCE(e.name, a.person_name) as person_name,
              a.camera_id, a.camera_label, a.started_at, a.ended_at, a.metrics
       FROM alert_events a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.started_at >= ? AND a.started_at < ?
       ORDER BY a.started_at ASC`,
    )
    .all(range.startMs, range.endMs) as unknown as AlertEventRow[]

  // ดึง presence sessions ที่ทับซ้อนกับช่วงวัน [startMs, endMs)
  const sessionRows = db
    .prepare(
      `SELECT ps.id, ps.employee_id, COALESCE(e.name, ps.person_name) as person_name,
              ps.camera_id, ps.camera_label, ps.started_at, ps.ended_at
       FROM presence_sessions ps
       LEFT JOIN employees e ON e.id = ps.employee_id
       WHERE ps.started_at < ? AND (ps.ended_at IS NULL OR ps.ended_at > ?)
       ORDER BY ps.started_at ASC`,
    )
    .all(range.endMs, range.startMs) as unknown as PresenceSessionRow[]

  const report = buildDailyReport({
    date: range.date,
    startMs: range.startMs,
    endMs: range.endMs,
    alerts: alertRows.map((r) => ({
      id: r.id,
      category: r.category,
      type: r.type,
      employeeId: r.employee_id,
      personName: r.person_name,
      cameraId: r.camera_id,
      cameraLabel: r.camera_label,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      employeeId: s.employee_id,
      personName: s.person_name,
      cameraId: s.camera_id,
      cameraLabel: s.camera_label,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    })),
  })

  res.json(report)
})
