import { Router, type Request, type Response } from 'express'
import { getDb, type AlertEventRow } from '../db.js'

// เหตุการณ์แจ้งเตือนจาก frontend (AlertEvent ใน src/types/alerts.ts ของ frontend) — ส่งมาตอนเริ่มและตอนจบ
// ด้วย id เดิม แล้ว upsert แถวเดียวกัน
export const alertsRouter = Router()

const CATEGORIES = new Set(['posture', 'fatigue', 'distance', 'fall'])

interface AlertSummary {
  id: string
  category: string
  type: string
  employeeId: string | null
  personName: string | null
  cameraId: string | null
  cameraLabel: string | null
  startedAt: number
  endedAt: number | null
  metrics: Record<string, number>
}

function toSummary(row: AlertEventRow): AlertSummary {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    employeeId: row.employee_id,
    personName: row.person_name,
    cameraId: row.camera_id,
    cameraLabel: row.camera_label,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    metrics: JSON.parse(row.metrics) as Record<string, number>,
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// GET /api/alerts?limit=100&employeeId=... — เหตุการณ์ล่าสุด กรองเฉพาะพนักงานคนเดียวได้
alertsRouter.get('/', (req: Request, res: Response) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100))
  const employeeId = optionalString(req.query.employeeId)
  const db = getDb()
  const select = `SELECT a.id, a.category, a.type, a.employee_id, COALESCE(e.name, a.person_name) as person_name,
                         a.camera_id, a.camera_label, a.started_at, a.ended_at, a.metrics
                  FROM alert_events a LEFT JOIN employees e ON e.id = a.employee_id`
  const rows = (
    employeeId
      ? db.prepare(`${select} WHERE a.employee_id = ? ORDER BY a.started_at DESC LIMIT ?`).all(employeeId, limit)
      : db.prepare(`${select} ORDER BY a.started_at DESC LIMIT ?`).all(limit)
  ) as unknown as AlertEventRow[]
  res.json(rows.map(toSummary))
})

// GET /api/alerts/summary — สรุปจำนวนการแจ้งเตือนรายคน (นับแยกหมวด + เวลาล่าสุด) สำหรับหน้ารายชื่อ
// เฉพาะเหตุการณ์ที่ผูกกับพนักงานได้ (employee_id ไม่เป็น NULL) — ?since=<epoch ms> นับเฉพาะที่เริ่มหลังเวลานั้น
// (Dashboard ส่งเวลาเที่ยงคืนตามเวลาเครื่องมา เพื่อนับเฉพาะ "วันนี้")
alertsRouter.get('/summary', (req: Request, res: Response) => {
  const since = Number(req.query.since)
  const rows = getDb()
    .prepare(
      `SELECT employee_id, category, COUNT(*) as count, MAX(started_at) as last_at
       FROM alert_events WHERE employee_id IS NOT NULL AND started_at >= ?
       GROUP BY employee_id, category`,
    )
    .all(Number.isFinite(since) ? since : 0) as unknown as { employee_id: string; category: string; count: number; last_at: number }[]

  const byEmployee = new Map<string, { employeeId: string; total: number; byCategory: Record<string, number>; lastAt: number }>()
  for (const r of rows) {
    const entry = byEmployee.get(r.employee_id) ?? { employeeId: r.employee_id, total: 0, byCategory: {}, lastAt: 0 }
    entry.total += r.count
    entry.byCategory[r.category] = r.count
    entry.lastAt = Math.max(entry.lastAt, r.last_at)
    byEmployee.set(r.employee_id, entry)
  }
  res.json([...byEmployee.values()])
})

// POST /api/alerts — บันทึก/อัปเดตเหตุการณ์ body: AlertEvent + { employeeId?, cameraId? }
alertsRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>
  const id = optionalString(body.id)
  const category = optionalString(body.category)
  const type = optionalString(body.type)
  const startedAt = finiteNumber(body.startedAt)
  if (!id || !category || !CATEGORIES.has(category) || !type || startedAt === null) {
    res.status(400).json({ error: 'รูปแบบเหตุการณ์แจ้งเตือนไม่ถูกต้อง' })
    return
  }

  const metrics: Record<string, number> = {}
  if (body.metrics && typeof body.metrics === 'object') {
    for (const [key, value] of Object.entries(body.metrics as Record<string, unknown>)) {
      const n = finiteNumber(value)
      if (n !== null) metrics[key] = n
    }
  }

  const db = getDb()
  const employeeId = optionalString(body.employeeId)
  const exists = employeeId ? db.prepare('SELECT 1 FROM employees WHERE id = ?').get(employeeId) : undefined

  // ON CONFLICT: ตอนจบเหตุการณ์ frontend ส่ง id เดิมมาพร้อม endedAt + metrics ที่แย่ที่สุด — อัปเดตแถวเดิม
  // (COALESCE employee_id กันกรณีส่งครั้งหลังไม่มี employeeId แล้วไปลบการเชื่อมโยงที่บันทึกไว้ตอนเริ่ม)
  db.prepare(
    `INSERT INTO alert_events
       (id, category, type, employee_id, person_name, camera_id, camera_label, started_at, ended_at, metrics)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       ended_at = excluded.ended_at,
       metrics = excluded.metrics,
       employee_id = COALESCE(excluded.employee_id, alert_events.employee_id),
       person_name = COALESCE(excluded.person_name, alert_events.person_name),
       camera_label = COALESCE(excluded.camera_label, alert_events.camera_label)`,
  ).run(
    id,
    category,
    type,
    exists ? employeeId : null,
    optionalString(body.personName),
    optionalString(body.cameraId),
    optionalString(body.cameraLabel),
    startedAt,
    finiteNumber(body.endedAt),
    JSON.stringify(metrics),
  )
  res.status(204).end()
})
