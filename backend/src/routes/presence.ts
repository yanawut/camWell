import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { getDb, type PresenceSessionRow } from '../db.js'

// บันทึกการเข้า-ออก — frontend เปิดช่วง (start) ตอนระบุตัวตนคนในกล้องได้ และปิด (end) ตอนคนนั้นหายไปจากเฟรม
// นานพอ (track ถูกลบ) หรือตอนระบุได้ว่าเป็นคนอื่น
export const presenceRouter = Router()

interface PresenceSummary {
  id: string
  employeeId: string | null
  personName: string
  cameraId: string
  cameraLabel: string
  startedAt: number
  endedAt: number | null
}

function toSummary(row: PresenceSessionRow): PresenceSummary {
  return {
    id: row.id,
    employeeId: row.employee_id,
    personName: row.person_name,
    cameraId: row.camera_id,
    cameraLabel: row.camera_label,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// GET /api/presence?limit=50 — ประวัติเข้า-ออกล่าสุด เรียงจากใหม่ไปเก่า (ชื่อพนักงานใช้ชื่อปัจจุบัน ถ้ายังไม่ถูกลบ
// เผื่อมีการเปลี่ยนชื่อจาก "คนที่ N" เป็นชื่อจริงทีหลัง)
presenceRouter.get('/', (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50))
  const rows = getDb()
    .prepare(
      `SELECT ps.id, ps.employee_id, COALESCE(e.name, ps.person_name) as person_name, ps.camera_id,
              ps.camera_label, ps.started_at, ps.ended_at
       FROM presence_sessions ps LEFT JOIN employees e ON e.id = ps.employee_id
       ORDER BY ps.started_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as PresenceSessionRow[]
  res.json(rows.map(toSummary))
})

// POST /api/presence — เปิดช่วงใหม่ body: { employeeId, personName, cameraId, cameraLabel, startedAt? }
presenceRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>
  const employeeId = nonEmptyString(body.employeeId)
  const personName = nonEmptyString(body.personName)
  const cameraId = nonEmptyString(body.cameraId)
  const cameraLabel = nonEmptyString(body.cameraLabel) || cameraId
  if (!personName || !cameraId) {
    res.status(400).json({ error: 'ต้องระบุชื่อคนและรหัสกล้อง' })
    return
  }
  const startedAt = typeof body.startedAt === 'number' && Number.isFinite(body.startedAt) ? body.startedAt : Date.now()

  const db = getDb()
  // employeeId ที่ไม่มีอยู่จริง (เช่น เพิ่งถูกลบ) บันทึกเป็น NULL แทน กัน foreign key error
  const exists = employeeId ? db.prepare('SELECT 1 FROM employees WHERE id = ?').get(employeeId) : undefined
  const id = randomUUID()
  db.prepare(
    `INSERT INTO presence_sessions (id, employee_id, person_name, camera_id, camera_label, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(id, exists ? employeeId : null, personName, cameraId, cameraLabel, startedAt)

  const created = db.prepare('SELECT * FROM presence_sessions WHERE id = ?').get(id) as unknown as PresenceSessionRow
  res.status(201).json(toSummary(created))
})

// POST /api/presence/:id/end — ปิดช่วง body: { endedAt? } (เขียนทับได้ เผื่อเซิร์ฟเวอร์ restart แล้วปิดให้ก่อน
// ตอนเริ่มเซิร์ฟเวอร์ — เวลาจริงที่ frontend ส่งมาแม่นกว่า)
presenceRouter.post('/:id/end', (req: Request, res: Response) => {
  const body = req.body as { endedAt?: unknown }
  const endedAt = typeof body.endedAt === 'number' && Number.isFinite(body.endedAt) ? body.endedAt : Date.now()
  const result = getDb()
    .prepare('UPDATE presence_sessions SET ended_at = ? WHERE id = ?')
    .run(endedAt, String(req.params.id))
  if (result.changes === 0) {
    res.status(404).json({ error: 'ไม่พบช่วงเวลานี้' })
    return
  }
  res.status(204).end()
})
