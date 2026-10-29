// ตัวส่งเหตุการณ์แจ้งเตือนออกไปนอกแอป — ตอนนี้ (Phase 1, MVP) แค่ log ไว้ในเครื่อง
// ออกแบบ interface ไว้ล่วงหน้าให้ตรงกับสิ่งที่ Phase 2 (backend) จะต้องรับ เพื่อสลับ implementation
// ได้โดยไม่ต้องแก้โค้ดฝั่ง UI เลย — ดูสัญญา (contract) ที่แนะนำไว้ท้ายไฟล์
//
// Phase 2 (แนวทาง B) แผนคร่าวๆ:
//   - เปิด WebSocket ไปที่ backend (Node/Express หรือ Spring Boot) ตอนแอปเริ่มทำงาน
//   - ทุกครั้งที่มี AlertEvent เริ่ม/จบ (ไม่ว่าจะหมวดท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ) ส่งเป็น JSON
//     message ผ่าน WebSocket นั้น — โครงสร้างเดียวกันหมดเพราะใช้ AlertEvent กลาง (ดู types/alerts.ts)
//   - backend เก็บลง Oracle/Postgres พร้อม employeeId/cameraId แล้ว broadcast ต่อไปยัง
//     dashboard ของ HR/หัวหน้างาน + ยิงแจ้งเตือนผ่าน LINE Messaging API เมื่อเข้าเงื่อนไข (เช่น
//     สะสมเกิน N ครั้ง/วัน)

import type { AlertEvent } from '../types/alerts'
import { apiFetch } from './apiConfig'

export interface AlertReporter {
  reportStart(event: AlertEvent): void
  reportEnd(event: AlertEvent): void
}

/** Reporter เริ่มต้น: log ลง console เท่านั้น ใช้สำหรับ Phase 1 ที่ยังไม่มี backend */
export const consoleAlertReporter: AlertReporter = {
  reportStart(event) {
    console.info('[alertReporter] เริ่มแจ้งเตือน (จะส่งไป backend ใน Phase 2):', event)
  },
  reportEnd(event) {
    console.info('[alertReporter] จบการแจ้งเตือน (จะส่งไป backend ใน Phase 2):', event)
  },
}

/**
 * Reporter ที่ใช้อยู่ตอนนี้ (Phase 2): ส่งเหตุการณ์ไปเก็บที่ camwell-backend (POST /api/alerts) พร้อม employeeId
 * ของคนที่ระบุตัวตนได้ — ส่งทั้งตอนเริ่มและตอนจบด้วย id เดิม backend จะ upsert แถวเดียวกัน
 * backend ล่ม/เชื่อมต่อไม่ได้แค่ log เตือนไว้ ไม่ให้กระทบการตรวจจับ/แจ้งเตือนบนหน้าจอ
 */
export const backendAlertReporter: AlertReporter = {
  reportStart(event) {
    sendToBackend(event)
  },
  reportEnd(event) {
    // keepalive: เหตุการณ์ที่ปิดตอนปิดแท็บ/รีเฟรช (CameraStage ปิดให้ตอน pagehide) ต้องส่งถึง backend แม้หน้าถูกปิดไปแล้ว
    sendToBackend(event, true)
  },
}

function sendToBackend(event: AlertEvent, keepalive = false) {
  apiFetch<void>('/api/alerts', { method: 'POST', body: JSON.stringify(event), keepalive }).catch((err: unknown) => {
    console.warn('[alertReporter] ส่งเหตุการณ์แจ้งเตือนไป backend ไม่สำเร็จ:', err)
  })
}

/**
 * ตัวอย่าง reporter แบบ WebSocket — ยังไม่ได้ใช้งานจริง เตรียมโครงไว้ให้แก้ URL แล้วสลับมาใช้ได้เลย
 * ตัวอย่างการใช้: setActiveReporter(createWebSocketAlertReporter('wss://camwell-backend.example.com/ws/alerts'))
 */
export function createWebSocketAlertReporter(wsUrl: string, meta: { employeeId?: string; cameraId?: string } = {}): AlertReporter {
  let socket: WebSocket | null = null
  const ensureSocket = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      socket = new WebSocket(wsUrl)
    }
    return socket
  }
  const send = (type: 'alert_start' | 'alert_end', event: AlertEvent) => {
    try {
      const ws = ensureSocket()
      const payload = JSON.stringify({ type, ...meta, event })
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload)
      } else {
        ws.addEventListener('open', () => ws.send(payload), { once: true })
      }
    } catch (err) {
      console.warn('[alertReporter] ส่งข้อมูลไป backend ไม่สำเร็จ:', err)
    }
  }
  return {
    reportStart: (event) => send('alert_start', event),
    reportEnd: (event) => send('alert_end', event),
  }
}
