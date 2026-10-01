// ประเภทข้อมูล "เหตุการณ์แจ้งเตือน" แบบรวมศูนย์ ใช้ร่วมกันทุกหมวด (ท่านั่ง / ความเหนื่อยล้า / ระยะห่างจอ)
// เพื่อให้ EventLog และ alertReporter (Phase 2 - ส่งไป backend) จัดการได้ด้วยโค้ดชุดเดียว ไม่ต้องแยกตามหมวด

export type AlertCategory = 'posture' | 'fatigue' | 'distance' | 'fall'

export type AlertType =
  | 'forward_head' // posture
  | 'slouching' // posture
  | 'leaning' // posture
  | 'drowsy' // fatigue
  | 'frequent_yawning' // fatigue
  | 'too_close' // distance
  | 'fall_detected' // fall — ลำตัวร่วงลงเร็ว + เอียงใกล้แนวนอน ขณะยังเห็นตัวอยู่ในเฟรม
  | 'fall_suspected_left_frame' // fall — ร่วงลงเร็วแล้วหายไปจากเฟรมกะทันหัน (เช่น หกล้ม/ตกจากเก้าอี้จนหลุดมุมกล้อง)

export interface AlertEvent {
  id: string
  category: AlertCategory
  type: AlertType
  startedAt: number
  endedAt?: number
  /** ระบุตัวตนพนักงาน (ถ้าเปิดใช้ face recognition และรู้จักหน้า) ตอนเริ่มเหตุการณ์ */
  personName?: string
  /** ค่าตัวเลขที่แย่ที่สุด (สูงสุด) ที่วัดได้ระหว่างเกิดเหตุการณ์นี้ — ทุกหมวดออกแบบให้ "ค่ายิ่งสูง = ยิ่งแย่" เสมอ */
  metrics: Record<string, number>
}

export const ALERT_LABELS_TH: Record<AlertType, string> = {
  forward_head: 'ก้มคอ/ยื่นคอไปข้างหน้า',
  slouching: 'หลังค่อม/โน้มตัว',
  leaning: 'นั่งเอียงข้าง',
  drowsy: 'ง่วง/หลับตานาน',
  frequent_yawning: 'หาวถี่ผิดปกติ',
  too_close: 'นั่งใกล้จอเกินไป',
  fall_detected: 'ตรวจพบการหกล้ม/ตกจากเก้าอี้',
  fall_suspected_left_frame: 'สงสัยหกล้ม — หายไปจากเฟรมกะทันหันหลังร่วงตัวเร็ว',
}

export const ALERT_CATEGORY_LABELS_TH: Record<AlertCategory, string> = {
  posture: 'ท่านั่ง',
  fatigue: 'ความเหนื่อยล้า',
  distance: 'ระยะห่างจากจอ',
  fall: 'การหกล้ม',
}
