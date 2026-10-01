// Camwell Phase 2 backend — REST API เล็กๆ สำหรับเก็บข้อมูลระบุตัวตนพนักงาน (face descriptor) และทำหน้าที่
// จับคู่ใบหน้าแทนฝั่ง browser (ดู README.md สำหรับวิธีรัน และ src/routes/employees.ts สำหรับ endpoint ทั้งหมด)

import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { employeesRouter } from './routes/employees.js'
import { getDb } from './db.js'

const PORT = Number(process.env.PORT ?? 4000)
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim())

const app = express()
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '1mb' })) // descriptor 128 ตัวเลข + ชื่อ เล็กมาก 1mb เผื่อไว้เกินพอ

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/employees', employeesRouter)

// error handler กลาง — กันเซิร์ฟเวอร์ล้มทั้งตัวเวลามี error ที่ไม่คาดคิดจาก route handler
// (express รู้จักว่าเป็น error-handling middleware จากการมีพารามิเตอร์ครบ 4 ตัวเท่านั้น แม้ _req/_next จะไม่ได้ใช้ก็ต้องคงไว้)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[camwell-backend] unhandled error:', err)
  res.status(500).json({ error: 'เกิดข้อผิดพลาดที่ backend' })
})

getDb() // สร้างไฟล์ฐานข้อมูล + ตารางตั้งแต่ตอนเริ่มเซิร์ฟเวอร์ ไม่ต้องรอ request แรกมาค่อยสร้าง

app.listen(PORT, () => {
  console.log(`[camwell-backend] กำลังรันที่ http://localhost:${PORT} (CORS origin ที่อนุญาต: ${CORS_ORIGIN.join(', ')})`)
})
