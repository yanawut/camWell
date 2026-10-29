import { useEffect, useState } from 'react'
import { getAlertSummary } from '../services/alertHistory'

// จำนวนการแจ้งเตือน "วันนี้" ของแต่ละคน (key = employeeId) จาก camwell-backend — นับรวมทุกกล้อง/ทุกเครื่อง
// ไม่ใช่แค่ที่เกิดในหน้านี้ ดึงใหม่ทุก POLL_MS และหลังมีเหตุการณ์ใหม่ในหน้านี้ (refreshKey เปลี่ยน) ไม่นาน
// "วันนี้" = ตั้งแต่เที่ยงคืนตามเวลาเครื่อง คำนวณใหม่ทุกรอบ จึงรีเซ็ตเองเมื่อข้ามวัน

const POLL_MS = 15_000
// รอให้ backendAlertReporter ส่งเหตุการณ์ใหม่ไปถึง backend ก่อนค่อยดึงจำนวนใหม่
const AFTER_ALERT_DELAY_MS = 1200

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function useTodayAlertCounts(enabled: boolean, refreshKey: number): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () => {
      getAlertSummary(startOfToday())
        .then((summary) => {
          if (!cancelled) setCounts(new Map(summary.map((s) => [s.employeeId, s.total])))
        })
        .catch((err: unknown) => {
          // backend ล่มชั่วคราว — คงตัวเลขเดิมไว้ ไม่ต้องล้างทิ้ง
          console.warn('[dashboard] ดึงจำนวนแจ้งเตือนวันนี้ไม่สำเร็จ:', err)
        })
    }
    const first = window.setTimeout(load, refreshKey === 0 ? 0 : AFTER_ALERT_DELAY_MS)
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [enabled, refreshKey])

  return counts
}
