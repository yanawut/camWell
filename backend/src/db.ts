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
  /** 1 = ระบบลงทะเบียนให้เองอัตโนมัติตอนเจอหน้าที่ไม่รู้จัก (ชื่อ "คนที่ N") ยังไม่มีบันทึกความยินยอม */
  auto_enrolled: number
}

export interface PresenceSessionRow {
  id: string
  employee_id: string | null
  person_name: string
  camera_id: string
  camera_label: string
  started_at: number
  ended_at: number | null
}

export interface AlertEventRow {
  id: string
  category: string
  type: string
  employee_id: string | null
  person_name: string | null
  camera_id: string | null
  camera_label: string | null
  started_at: number
  ended_at: number | null
  metrics: string // JSON object
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

    -- ค่าตั้งค่า/ตัวนับเล็กๆ ของระบบ เช่น เลขรันของชื่อ "คนที่ N" ที่ลงทะเบียนอัตโนมัติ
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- บันทึกการเข้า-ออก: 1 แถว = คน 1 คนอยู่หน้ากล้อง 1 ตัวต่อเนื่อง 1 ช่วง (ended_at = NULL คือยังอยู่)
    -- employee_id เป็น SET NULL ตอนลบพนักงาน — ประวัติยังอยู่ (ชื่อเก็บสำเนาไว้ใน person_name) แต่ตัดการเชื่อมกับข้อมูลใบหน้า
    CREATE TABLE IF NOT EXISTS presence_sessions (
      id TEXT PRIMARY KEY,
      employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
      person_name TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      camera_label TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_presence_started ON presence_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_presence_employee ON presence_sessions(employee_id);

    -- เหตุการณ์แจ้งเตือน (ท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ/หกล้ม) ผูกกับพนักงานที่ระบุตัวตนได้ตอนเกิดเหตุ
    -- id มาจากฝั่ง frontend (AlertEvent.id) เพื่อให้ส่งซ้ำตอนจบเหตุการณ์แล้ว upsert แถวเดิมได้
    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      type TEXT NOT NULL,
      employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
      person_name TEXT,
      camera_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      metrics TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_alert_events_started ON alert_events(started_at);
    CREATE INDEX IF NOT EXISTS idx_alert_events_employee ON alert_events(employee_id);
  `)

  // migration: ฐานข้อมูลที่สร้างก่อนมีฟีเจอร์ลงทะเบียนอัตโนมัติจะยังไม่มีคอลัมน์นี้
  const employeeColumns = db.prepare('PRAGMA table_info(employees)').all() as unknown as { name: string }[]
  if (!employeeColumns.some((c) => c.name === 'auto_enrolled')) {
    db.exec('ALTER TABLE employees ADD COLUMN auto_enrolled INTEGER NOT NULL DEFAULT 0;')
  }

  // migration: ชื่อกล้องที่อ่านออก (เช่น "กล้อง 1") — เดิมเก็บแค่ camera_id ภายในซึ่งเป็นรหัสยาวอ่านไม่ออก
  const alertColumns = db.prepare('PRAGMA table_info(alert_events)').all() as unknown as { name: string }[]
  if (!alertColumns.some((c) => c.name === 'camera_label')) {
    db.exec('ALTER TABLE alert_events ADD COLUMN camera_label TEXT;')
  }

  // เซิร์ฟเวอร์ปิดไปกลางคัน (เช่น restart) — ช่วงที่ยังเปิดค้างอยู่ปิดไม่ได้แล้ว ปิดให้ ณ ตอนเริ่มเซิร์ฟเวอร์ใหม่
  // กันไม่ให้มีคน "อยู่ตลอดกาล" ค้างในประวัติ (เวลาออกจะคลาดไปเท่ากับช่วงที่เซิร์ฟเวอร์ดับ)
  db.prepare('UPDATE presence_sessions SET ended_at = ? WHERE ended_at IS NULL').run(Date.now())

  return db
}

/**
 * ออกเลขรันถัดไปสำหรับชื่อ "คนที่ N" — เก็บตัวนับไว้ใน app_meta แทนการนับจากจำนวนแถว เพื่อไม่ให้เลขซ้ำของคนที่
 * เคยถูกลบไปแล้ว ต้องเรียกภายใน transaction เดียวกับการ INSERT พนักงาน
 */
export function nextAutoPersonNumber(database: DatabaseSync): number {
  const row = database.prepare("SELECT value FROM app_meta WHERE key = 'next_person_number'").get() as unknown as
    | { value: string }
    | undefined
  const current = row ? Number(row.value) : 1
  database
    .prepare(
      "INSERT INTO app_meta (key, value) VALUES ('next_person_number', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(String(current + 1))
  return current
}
