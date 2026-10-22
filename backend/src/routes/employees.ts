import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { getDb, nextAutoPersonNumber, type EmployeeRow } from '../db.js'
import { findBestMatch, type DescriptorCandidate } from '../faceMatch.js'

export const employeesRouter = Router()

interface EmployeeSummary {
  id: string
  name: string
  enrolledAt: number
  consentGivenAt: number | null
  autoEnrolled: boolean
}

function toSummary(row: EmployeeRow): EmployeeSummary {
  return {
    id: row.id,
    name: row.name,
    enrolledAt: row.created_at,
    consentGivenAt: row.consent_given_at,
    autoEnrolled: row.auto_enrolled === 1,
  }
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number' && Number.isFinite(v))
}

// GET /api/employees — รายชื่อพนักงานที่ลงทะเบียนไว้ (ไม่ส่ง descriptor กลับ — descriptor เป็นข้อมูลชีวภาพ
// อ่อนไหว อยู่บน backend นี้ที่เดียวพอ ไม่จำเป็นต้องส่งออกไปให้ client ถืออีก)
employeesRouter.get('/', (_req: Request, res: Response) => {
  const rows = getDb().prepare('SELECT * FROM employees ORDER BY created_at ASC').all() as unknown as EmployeeRow[]
  res.json(rows.map(toSummary))
})

// POST /api/employees — ลงทะเบียนพนักงานใหม่พร้อม face descriptor
// ต้องแนบ consentGiven: true มาด้วยเสมอ (UI ฝั่ง frontend บังคับติ๊กยืนยันว่าขอความยินยอมจากพนักงานแล้วตาม PDPA
// ก่อนถึงจะกดลงทะเบียนได้) — ถ้าไม่มี/เป็น false ปฏิเสธคำขอทันที ไม่บันทึกข้อมูลชีวภาพโดยไม่มีหลักฐานความยินยอม
employeesRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as { name?: unknown; descriptor?: unknown; consentGiven?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    res.status(400).json({ error: 'ต้องระบุชื่อพนักงาน' })
    return
  }
  if (!isNumberArray(body.descriptor)) {
    res.status(400).json({ error: 'รูปแบบ face descriptor ไม่ถูกต้อง' })
    return
  }
  if (body.consentGiven !== true) {
    res.status(400).json({ error: 'ต้องยืนยันว่าได้ขอความยินยอมจากพนักงาน (PDPA) ก่อนลงทะเบียนใบหน้า' })
    return
  }

  const db = getDb()
  const now = Date.now()
  const employeeId = randomUUID()

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO employees (id, name, consent_given_at, created_at) VALUES (?, ?, ?, ?)').run(
      employeeId,
      name,
      now,
      now,
    )
    db.prepare('INSERT INTO face_descriptors (id, employee_id, descriptor, created_at) VALUES (?, ?, ?, ?)').run(
      randomUUID(),
      employeeId,
      JSON.stringify(body.descriptor),
      now,
    )
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err
  }

  const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as unknown as
    | EmployeeRow
    | undefined
  if (!created) {
    res.status(500).json({ error: 'บันทึกสำเร็จแต่อ่านข้อมูลที่เพิ่งสร้างกลับไม่ได้' })
    return
  }
  res.status(201).json(toSummary(created))
})

// DELETE /api/employees/:id — ลบพนักงาน + descriptor ทั้งหมดของคนนั้น (สิทธิ์ขอให้ลบข้อมูลตาม PDPA)
employeesRouter.delete('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const result = getDb().prepare('DELETE FROM employees WHERE id = ?').run(id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'ไม่พบพนักงานรายนี้' })
    return
  }
  res.status(204).end()
})

// PATCH /api/employees/:id — เปลี่ยนชื่อพนักงาน (เช่น จาก "คนที่ 3" ที่ระบบตั้งให้อัตโนมัติ เป็นชื่อจริง)
// ส่ง consentGiven: true มาด้วยได้ เพื่อบันทึกว่าขอความยินยอมจากคนนี้แล้วหลังจากถูกลงทะเบียนอัตโนมัติ
employeesRouter.patch('/:id', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const body = req.body as { name?: unknown; consentGiven?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    res.status(400).json({ error: 'ต้องระบุชื่อพนักงาน' })
    return
  }

  const db = getDb()
  const result =
    body.consentGiven === true
      ? db
          .prepare('UPDATE employees SET name = ?, consent_given_at = COALESCE(consent_given_at, ?) WHERE id = ?')
          .run(name, Date.now(), id)
      : db.prepare('UPDATE employees SET name = ? WHERE id = ?').run(name, id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'ไม่พบพนักงานรายนี้' })
    return
  }
  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as unknown as EmployeeRow
  res.json(toSummary(updated))
})

// POST /api/identify — รับ face descriptor ที่ตรวจพบจากกล้อง หาว่าตรงกับพนักงานคนไหนที่ลงทะเบียนไว้ไหม
// ทำการจับคู่ฝั่ง backend ทั้งหมด (ไม่ส่ง descriptor ของพนักงานคนอื่นกลับไปให้ client เลย)
// ถ้าส่ง autoEnroll: true มาด้วยและไม่ตรงกับใครเลย จะลงทะเบียนหน้านี้เป็นคนใหม่ชื่อ "คนที่ N" (N รันต่อไปเรื่อยๆ)
// ให้ทันที — ทั้งจับคู่และ INSERT อยู่ใน handler แบบ synchronous เดียวกัน (node:sqlite เป็น sync) จึงไม่มีทางที่
// 2 กล้องจะส่งหน้าคนเดียวกันมาพร้อมกันแล้วได้คนใหม่ซ้ำ 2 คนจากการแข่งกันระหว่าง "เช็ค" กับ "เพิ่ม"
employeesRouter.post('/identify', (req: Request, res: Response) => {
  const body = req.body as { descriptor?: unknown; autoEnroll?: unknown }
  if (!isNumberArray(body.descriptor)) {
    res.status(400).json({ error: 'รูปแบบ face descriptor ไม่ถูกต้อง' })
    return
  }

  const db = getDb()
  const rows = db
    .prepare(
      `SELECT fd.descriptor as descriptor, e.id as employee_id, e.name as employee_name
       FROM face_descriptors fd JOIN employees e ON e.id = fd.employee_id`,
    )
    .all() as unknown as { descriptor: string; employee_id: string; employee_name: string }[]

  const candidates: DescriptorCandidate[] = rows.map((r) => ({
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    descriptor: JSON.parse(r.descriptor) as number[],
  }))

  const match = findBestMatch(body.descriptor, candidates)
  if (match) {
    res.json({ matched: true, employeeId: match.employeeId, name: match.employeeName, distance: match.distance })
    return
  }
  if (body.autoEnroll !== true) {
    res.json({ matched: false })
    return
  }

  const now = Date.now()
  const employeeId = randomUUID()
  let name = ''
  db.exec('BEGIN')
  try {
    name = `คนที่ ${nextAutoPersonNumber(db)}`
    db.prepare(
      'INSERT INTO employees (id, name, consent_given_at, created_at, auto_enrolled) VALUES (?, ?, NULL, ?, 1)',
    ).run(employeeId, name, now)
    db.prepare('INSERT INTO face_descriptors (id, employee_id, descriptor, created_at) VALUES (?, ?, ?, ?)').run(
      randomUUID(),
      employeeId,
      JSON.stringify(body.descriptor),
      now,
    )
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as unknown as EmployeeRow
  res.json({ matched: true, employeeId, name, distance: 0, created: toSummary(created) })
})
