import type { WellCategory, WellnessSettings } from '../yoloConsole/types'

// เกณฑ์การแจ้งเตือนแต่ละหมวด (พอร์ตจาก WellnessSettingsCard ของ ?yolo-console) — key ตรงกับ /api/wellness/settings

export interface AlertField {
  key: string
  label: string
  unit: string
  step: number
  min: number
}

export const ALERT_GROUPS: { category: WellCategory; hint: string; fields: AlertField[] }[] = [
  {
    category: 'posture',
    hint: 'ตัดสินเฉพาะตอนนั่ง จากจุดบนร่างกาย',
    fields: [
      { key: 'posture_seconds', label: 'ท่าไม่ดีต่อเนื่อง', unit: 'วินาที', step: 5, min: 1 },
      { key: 'neck_angle', label: 'คอยื่นเกิน (มองด้านข้าง)', unit: 'องศา', step: 1, min: 5 },
      { key: 'head_drop', label: 'ศีรษะสูงกว่าไหล่น้อยกว่า (มองด้านหน้า)', unit: 'เท่าของความกว้างไหล่', step: 0.05, min: 0 },
      { key: 'torso_angle', label: 'หลังโน้มเกิน (มองด้านข้าง)', unit: 'องศา', step: 1, min: 5 },
      { key: 'shoulder_tilt', label: 'ไหล่เอียงเกิน (มองด้านหน้า)', unit: 'องศา', step: 1, min: 2 },
      { key: 'side_lean', label: 'ลำตัวเอียงข้างเกิน (มองด้านหน้า)', unit: 'องศา', step: 1, min: 2 },
    ],
  },
  {
    category: 'distance',
    hint: 'เทียบขนาดหน้ากับตอนนั่งปกติของคนนั้น ต้องตั้งกล้องให้เห็นหน้าจากฝั่งจอ',
    fields: [
      { key: 'distance_ratio', label: 'หน้าใหญ่กว่าปกติ', unit: 'เท่า', step: 0.05, min: 1.05 },
      { key: 'distance_seconds', label: 'ใกล้จอต่อเนื่อง', unit: 'วินาที', step: 5, min: 1 },
      { key: 'distance_learn_seconds', label: 'เวลาเรียนรู้ระยะปกติ', unit: 'วินาที', step: 10, min: 10 },
    ],
  },
  {
    category: 'break',
    hint: 'นับเวลานั่งต่อเนื่อง ลุกยืนหรือออกไปนานพอจึงนับเป็นการพัก',
    fields: [
      { key: 'sit_minutes', label: 'นั่งต่อเนื่องเกิน', unit: 'นาที', step: 5, min: 1 },
      { key: 'break_seconds', label: 'ลุกนานเท่านี้นับเป็นการพัก', unit: 'วินาที', step: 10, min: 5 },
    ],
  },
  {
    category: 'fatigue',
    hint: 'ต้องเห็นหน้าชัด เทียบการลืมตากับปกติของคนนั้น',
    fields: [
      { key: 'eye_closed_seconds', label: 'หลับตาต่อเนื่อง', unit: 'วินาที', step: 0.5, min: 0.5 },
      { key: 'eye_ratio', label: 'ลืมตาน้อยกว่าปกติ (นับว่าหลับ)', unit: 'เท่า', step: 0.05, min: 0.1 },
      { key: 'yawn_open', label: 'ริมฝีปากห่างกว่า (นับว่าหาว)', unit: 'เท่าของความกว้างปาก', step: 0.05, min: 0.1 },
      { key: 'yawn_count', label: 'หาวถึง', unit: 'ครั้ง', step: 1, min: 1 },
      { key: 'yawn_window_minutes', label: 'ภายใน', unit: 'นาที', step: 1, min: 1 },
    ],
  },
  {
    category: 'fall',
    hint: 'แจ้งทันที ไม่รอสะสมเวลา',
    fields: [
      { key: 'fall_head_drop', label: 'ศีรษะร่วงลงหาเท้าอย่างน้อย', unit: 'เท่าของความสูงตัว', step: 0.05, min: 0.2 },
      { key: 'fall_angle', label: 'ลำตัวเอียงจากแนวตั้งเกิน', unit: 'องศา', step: 5, min: 20 },
    ],
  },
]

export const FACE_FIELD: AlertField = {
  key: 'min_face_px',
  label: 'หน้ากว้างอย่างน้อย (ระยะจอ/ความล้า)',
  unit: 'พิกเซล',
  step: 5,
  min: 20,
}

const ALL_FIELDS = [...ALERT_GROUPS.flatMap((g) => g.fields), FACE_FIELD]

/** ช่องว่าง (NaN) หรือต่ำกว่าค่าน้อยสุดของช่อง */
export const fieldInvalid = (field: AlertField, value: number) => !Number.isFinite(value) || value < field.min

/** ตรวจทุกช่องรวมหมวดที่ปิดอยู่ เพราะค่าของหมวดที่ปิดก็ถูกบันทึกไปด้วย และใช้ทันทีที่เปิดหมวดนั้น */
export const hasInvalidField = (settings: WellnessSettings) =>
  ALL_FIELDS.some((f) => fieldInvalid(f, settings[f.key] as number))
