// ข้อมูลที่หลายหน้าของ YOLO Console ใช้ร่วมกัน — แทน react-query และ sonner ของต้นแบบ
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { yoloService } from './yoloService'
import type { WellnessSettings } from './types'

// ---------------------------------------------------------------- remote data

const cache = new Map<string, unknown>()
const versions = new Map<string, number>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** แทนข้อมูลที่จำไว้ของ key นี้ — ทุก component ที่ใช้ key เดียวกันเห็นค่าใหม่ทันที */
export function setRemote<T>(key: string, data: T) {
  cache.set(key, data)
  notify()
}

/** ให้ทุก key ที่ขึ้นต้นด้วย prefix โหลดใหม่ */
export function invalidate(prefix: string) {
  for (const key of new Set([...cache.keys(), ...versions.keys()])) {
    if (key.startsWith(prefix)) versions.set(key, (versions.get(key) ?? 0) + 1)
  }
  notify()
}

export interface Remote<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  fetching: boolean
  reload: () => void
}

/** โหลดข้อมูลตาม key (null = ยังไม่โหลด) และโหลดซ้ำทุก intervalMs ถ้าให้มา */
export function useRemote<T>(key: string | null, fetcher: () => Promise<T>, intervalMs?: number): Remote<T> {
  const data = useSyncExternalStore(subscribe, () => (key === null ? undefined : (cache.get(key) as T | undefined)))
  const version = useSyncExternalStore(subscribe, () => (key === null ? 0 : (versions.get(key) ?? 0)))
  const [tick, setTick] = useState(0)
  const [settled, setSettled] = useState<{ request: string; error: string | null } | null>(null)
  const reload = useCallback(() => setTick((n) => n + 1), [])
  // fetcher เป็นฟังก์ชันใหม่ทุก render — key บอกแล้วว่าโหลดอะไร จึงเก็บตัวล่าสุดไว้ใน ref แทนการโหลดซ้ำทุก render
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })
  const request = key === null ? null : `${key}|${version}|${tick}`

  useEffect(() => {
    if (key === null || request === null) return
    let alive = true
    fetcherRef.current()
      .then((value) => {
        if (!alive) return
        setRemote(key, value)
        setSettled({ request, error: null })
      })
      .catch((err: unknown) => alive && setSettled({ request, error: err instanceof Error ? err.message : String(err) }))
    return () => {
      alive = false
    }
  }, [key, request])

  useEffect(() => {
    if (key === null || !intervalMs) return
    const timer = setInterval(reload, intervalMs)
    return () => clearInterval(timer)
  }, [key, intervalMs, reload])

  const error = key !== null && settled?.request.startsWith(`${key}|`) ? settled.error : null
  return {
    data,
    error,
    loading: data === undefined && error === null && key !== null,
    fetching: request !== null && settled?.request !== request,
    reload,
  }
}

// ---------------------------------------------------------------- toasts

type ToastKind = 'success' | 'warning' | 'error'
export interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}
let toasts: ToastItem[] = []
export const getToasts = () => toasts
let nextToast = 0
export const toastListeners = new Set<() => void>()

function push(kind: ToastKind, text: string) {
  const id = (nextToast += 1)
  toasts = [...toasts, { id, kind, text }]
  toastListeners.forEach((listener) => listener())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    toastListeners.forEach((listener) => listener())
  }, kind === 'error' ? 6000 : 4000)
}

export const toast = {
  success: (text: string) => push('success', text),
  warning: (text: string) => push('warning', text),
  error: (text: string) => push('error', text),
}

export const useWellnessSettings = () => useRemote<WellnessSettings>('wellness', yoloService.getWellness, 10000)
