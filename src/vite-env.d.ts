/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ที่อยู่ของ camwell-backend เช่น http://localhost:4000 — ไม่ตั้งไว้ใช้ค่าเริ่มต้นนี้เลย (ดู services/apiConfig.ts) */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
