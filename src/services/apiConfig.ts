// ที่อยู่ของ camwell-backend (Phase 2) — ตั้งค่าได้ผ่าน .env (VITE_API_BASE_URL) ไม่ตั้งไว้ใช้ค่าเริ่มต้น
// localhost:4000 (ตาม PORT เริ่มต้นใน camwell-backend/.env.example)

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

/** เรียก backend แล้ว throw พร้อมข้อความภาษาไทยที่อ่านได้ ถ้าตอบกลับไม่ใช่ 2xx — ใช้ร่วมกันทุก service ที่คุย API */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (err) {
    throw new Error(`เชื่อมต่อ backend (${API_BASE_URL}) ไม่สำเร็จ — ตรวจสอบว่า camwell-backend รันอยู่หรือไม่`, {
      cause: err,
    })
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `backend ตอบกลับผิดพลาด (HTTP ${res.status})`
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
