// ตัวช่วยจัดรูปแบบสำหรับ Dev Console (สูตรเดียวกับ EventLog ของหน้าหลัก)

export function formatTime(epochMs: number) {
  return new Date(epochMs).toLocaleTimeString('th-TH', { hour12: false })
}

export function formatDuration(startedAt: number, endedAt?: number) {
  const end = endedAt ?? Date.now()
  const seconds = Math.max(0, Math.round((end - startedAt) / 1000))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} นาที ${s} วิ` : `${s} วิ`
}

export function formatMetrics(metrics: Record<string, number>) {
  const entries = Object.entries(metrics)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key}: ${value.toFixed(2)}`).join(', ')
}

/** ตัดเลขทศนิยมเกินออก: 0.2 → "0.2", 25 → "25" */
export function formatNumber(v: number) {
  return Number.isInteger(v) ? String(v) : String(+v.toFixed(2))
}

/**
 * AlertEvent ไม่มี cameraId — ตอนต่อหลายกล้อง CameraStage แปะ "กล้อง N • ชื่อ" ไว้ใน personName
 * จึงแยกกลับจากตรงนั้น ถ้าไม่มี prefix ใช้ชื่อกล้องเดียวที่ต่ออยู่ (fallbackCamera)
 */
export function splitPersonName(personName: string | undefined, fallbackCamera: string) {
  if (!personName) return { camera: fallbackCamera, person: '—' }
  const idx = personName.indexOf(' • ')
  if (idx === -1) return { camera: fallbackCamera, person: personName }
  return { camera: personName.slice(0, idx), person: personName.slice(idx + 3) }
}

export function downloadJson(filenamePrefix: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
