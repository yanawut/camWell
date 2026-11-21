import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

// สำเนาของ hooks/useTheme.ts สำหรับหน้า YOLO — ใช้ key และ <html data-theme> ตัวเดียวกับทั้งแอป ธีมจึงตรงกันทุกหน้า
// ธีมที่ใช้อยู่เก็บไว้ที่ <html data-theme> — index.html ตั้งค่าก่อนวาดหน้าแรกด้วยกติกาเดียวกับ resolveTheme()
// ผู้ใช้ที่ยังไม่เคยกดสลับธีมจะได้ธีมตามระบบปฏิบัติการ และเปลี่ยนตามเมื่อระบบเปลี่ยน
const THEME_STORAGE_KEY = 'camwell:theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function storedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    return saved === 'dark' || saved === 'light' ? saved : null
  } catch {
    return null
  }
}

function resolveTheme(): Theme {
  return storedTheme() ?? (systemDark.matches ? 'dark' : 'light')
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function syncTheme() {
  document.documentElement.dataset.theme = resolveTheme()
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void) {
  if (listeners.size === 0) {
    systemDark.addEventListener('change', syncTheme)
    // แท็บอื่นสลับธีม -> แท็บนี้เปลี่ยนตาม
    window.addEventListener('storage', syncTheme)
  }
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
    if (listeners.size === 0) {
      systemDark.removeEventListener('change', syncTheme)
      window.removeEventListener('storage', syncTheme)
    }
  }
}

function toggleTheme() {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // เก็บค่าไม่ได้ (เช่น โหมดส่วนตัว) — ยังสลับธีมของหน้านี้ได้
  }
  document.documentElement.dataset.theme = next
  listeners.forEach((notify) => notify())
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme)
  return { theme, toggleTheme }
}
