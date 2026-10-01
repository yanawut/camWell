// ชั้นเข้าถึงฐานข้อมูล SQLite — ใช้ node:sqlite ที่มากับ Node.js เองตั้งแต่รุ่น 22.5+ (ยังมีสถานะ experimental
// แต่ API เสถียรพอสำหรับงานนี้) แทนที่จะใช้ไลบรารีภายนอกอย่าง better-sqlite3 ซึ่งเป็น native addon ที่ต้อง
// compile เฉพาะแพลตฟอร์ม — จากประสบการณ์กับโปรเจกต์นี้ (oxlint/rolldown) การ npm install native addon ผ่าน
// bridge คนละ OS แล้วเอาไปรันอีกเครื่องนึงมีปัญหาซ้ำๆ node:sqlite เป็นส่วนหนึ่งของ Node.js เองเลยไม่มีปัญหานี้

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface EmployeeRow {
  id: string
  name: string
  consent_given_at: number | null
  created_at: number
}

export interface FaceDescriptorRow {
  id: string
  employee_id: string
  descriptor: string // JSON array ของตัวเลข 128 มิติ เก็บเป็น TEXT (JSON) เพื่อความง่าย ขนาดเล็กพอไม่ต้องพึ่ง BLOB
  created_at: number
}

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db

  const dbPath = process.env.DB_PATH ?? './data/camwell.sqlite'
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }

  db = new DatabaseSync(dbPath)
  // SQLite ปิด foreign key enforcement ไว้เป็นค่าเริ่มต้นต่อการเชื่อมต่อ ต้องเปิดเองทุกครั้ง
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA journal_mode = WAL;') // เขียน/อ่านพร้อมกันได้ดีขึ้น เหมาะกับ backend ตัวเดียวที่เสิร์ฟหลายกล้อง

  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      consent_given_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS face_descriptors (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      descriptor TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_face_descriptors_employee ON face_descriptors(employee_id);
  `)

  return db
}
