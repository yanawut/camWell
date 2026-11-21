import { useSyncExternalStore } from 'react'

// หน้าทั้งหมดของ /?yolo-dashboard — ตารางนี้เป็นที่เดียวที่กำหนดชื่อเมนู ลำดับ และ URL ของแต่ละหน้า
// ภาพรวมอยู่ที่ ?yolo-dashboard หน้าอื่นอยู่ที่ ?yolo-dashboard=<id>
// id "camera" คงไว้เพื่อให้ลิงก์เดิมยังเปิดได้ แต่หน้านี้มีแค่เกณฑ์การแจ้งเตือน (แหล่งภาพอยู่หน้าภาพรวม) จึงตั้งชื่อตามสิ่งที่อยู่ในหน้า
export const YOLO_PAGES = {
  overview: 'ภาพรวม',
  camera: 'เกณฑ์แจ้งเตือน',
  floor: 'พื้นห้องและโซน',
  people: 'รายชื่อบุคคล',
  alerts: 'ประวัติแจ้งเตือน',
  report: 'รายงานประจำวัน',
  rooms: 'สถิติการใช้ห้อง',
} as const satisfies Record<string, string>

export type YoloPage = keyof typeof YOLO_PAGES

export const YOLO_PAGE_IDS = Object.keys(YOLO_PAGES) as YoloPage[]

const PARAM = 'yolo-dashboard'

export const isYoloPage = (value: unknown): value is YoloPage => typeof value === 'string' && Object.hasOwn(YOLO_PAGES, value)

export const hrefFor = (page: YoloPage) => (page === 'overview' ? `?${PARAM}` : `?${PARAM}=${page}`)

export function pageFromSearch(search: string): YoloPage {
  const value = new URLSearchParams(search).get(PARAM)
  return isYoloPage(value) ? value : 'overview'
}

// เปลี่ยนหน้าในเบราว์เซอร์โดยไม่โหลดใหม่ — WebSocket, กล้อง browser ที่กำลังส่งเฟรม และเสียงเตือนการล้มจึงทำงานต่อระหว่างเปลี่ยนหน้า
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('popstate', notify)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('popstate', notify)
  }
}

export function useYoloPage(): YoloPage {
  return useSyncExternalStore(subscribe, () => pageFromSearch(window.location.search))
}

export function goTo(page: YoloPage, anchor?: string) {
  if (pageFromSearch(window.location.search) !== page) {
    window.history.pushState(null, '', hrefFor(page))
    notify()
    window.scrollTo(0, 0)
  }
  if (anchor) window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'center' }))
}
