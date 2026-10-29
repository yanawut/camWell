import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../services/apiConfig'

const HEALTH_INTERVAL_MS = 10_000

/** null = ยังไม่รู้ผล, 'offline' = ต่อไม่ได้, ตัวเลข = HTTP status ของ /health */
export type BackendHealth = number | 'offline' | null

export function useBackendHealth(): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>(null)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      fetch(`${API_BASE_URL}/health`)
        .then((res) => {
          if (!cancelled) setHealth(res.status)
        })
        .catch(() => {
          if (!cancelled) setHealth('offline')
        })
    }
    check()
    const id = window.setInterval(check, HEALTH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return health
}
