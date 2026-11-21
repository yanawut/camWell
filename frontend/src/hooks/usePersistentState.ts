import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function restoreValue<T>(value: unknown, fallback: T, isValid?: (value: unknown) => value is T): T {
  if (isValid) return isValid(value) ? value : fallback

  if (isRecord(fallback)) {
    if (!isRecord(value)) return fallback
    return Object.fromEntries(
      Object.entries(fallback).map(([key, defaultValue]) => {
        const savedValue = value[key]
        const valid = typeof savedValue === typeof defaultValue &&
          (typeof defaultValue !== 'number' || Number.isFinite(savedValue))
        return [key, valid ? savedValue : defaultValue]
      }),
    ) as T
  }

  return typeof value === typeof fallback ? value as T : fallback
}

export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid?: (value: unknown) => value is T,
): readonly [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key)
      return saved === null ? fallback : restoreValue(JSON.parse(saved), fallback, isValid)
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // localStorage may be unavailable or full; keep the in-memory setting usable.
    }
  }, [key, value])

  return [value, setValue] as const
}
