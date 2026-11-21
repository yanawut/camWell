import { isConvexQuad } from '../yoloConsole/homography'
import type { FloorSettings, Point, Zone } from '../yoloConsole/types'

// การแก้พื้นและโซนก่อนกดบันทึก (พอร์ตจาก FloorTab ของ ?yolo-console) รวมเป็น reducer เดียว
// เพื่อให้กติกาการย้อนกลับ "ลากหนึ่งครั้ง = ย้อนกลับหนึ่งขั้น" อยู่ที่เดียวและทดสอบได้

/** ชื่อมุมตามลำดับของ floor_pts — backend ใช้ลำดับนี้ตรวจว่ากรอบไม่ไขว้กัน */
export const CORNERS = ['1 ไกล-ซ้าย', '2 ไกล-ขวา', '3 ใกล้-ขวา', '4 ใกล้-ซ้าย'] as const

export const sizeValid = (size: Point) => size.every((v) => v > 0 && v <= 200)

/** เงื่อนไขเดียวกับที่ backend ตรวจก่อนรับการตั้งค่า */
export const floorValid = (settings: FloorSettings) => isConvexQuad(settings.floor_pts) && sizeValid(settings.floor_size_m)

export const SAVED_TEXT = 'บันทึกแล้ว มีผลกับแหล่งภาพที่เปิดอยู่ทันที'

export interface FloorEdit {
  saved: FloorSettings
  /** null = ตรงกับที่บันทึกไว้ */
  edited: FloorSettings | null
  /** ร่างก่อนการแก้แต่ละขั้น ล่าสุดอยู่ท้าย */
  history: FloorSettings[]
  /** การเปลี่ยนที่ตามมาเป็นส่วนของการลากเดิม จึงไม่เพิ่มขั้นย้อนกลับ */
  inGesture: boolean
  saving: boolean
  message: { ok: boolean; text: string } | null
}

export type FloorEditAction =
  | { type: 'change'; change: Partial<FloorSettings>; gesture: boolean }
  | { type: 'endGesture' }
  | { type: 'undo' }
  | { type: 'discard' }
  | { type: 'save' }
  | { type: 'saved'; settings: FloorSettings }
  | { type: 'saveFailed'; text: string }

export const startFloorEdit = (saved: FloorSettings): FloorEdit => ({
  saved,
  edited: null,
  history: [],
  inGesture: false,
  saving: false,
  message: null,
})

export const draftOf = (state: FloorEdit) => state.edited ?? state.saved
export const isDirty = (state: FloorEdit) => state.edited !== null
export const canUndo = (state: FloorEdit) => state.history.length > 0

export function floorEdit(state: FloorEdit, action: FloorEditAction): FloorEdit {
  switch (action.type) {
    case 'change': {
      const draft = draftOf(state)
      return {
        ...state,
        history: state.inGesture ? state.history : [...state.history, draft],
        inGesture: action.gesture,
        edited: { ...draft, ...action.change },
        message: null,
      }
    }
    case 'endGesture':
      return state.inGesture ? { ...state, inGesture: false } : state
    case 'undo': {
      const previous = state.history.at(-1)
      if (!previous) return state
      // ขั้นแรกสุดคือค่าที่บันทึกไว้เอง ย้อนถึงขั้นนั้นแล้วจึงไม่มีอะไรค้างให้บันทึก
      return { ...state, edited: previous === state.saved ? null : previous, history: state.history.slice(0, -1) }
    }
    case 'discard':
      return { ...state, edited: null, history: [], message: null }
    case 'save':
      return { ...state, saving: true }
    case 'saved':
      return { ...startFloorEdit(action.settings), message: { ok: true, text: SAVED_TEXT } }
    case 'saveFailed':
      return { ...state, saving: false, message: { ok: false, text: action.text } }
  }
}

/** ชื่อซ้ำกับโซนอื่น (`own` = ชื่อเดิมของโซนที่กำลังเปลี่ยนชื่อ ไม่นับว่าซ้ำกับตัวเอง) */
export const nameTaken = (zones: Zone[], name: string, own?: string) => zones.some((z) => z.name === name && z.name !== own)

export const renameZone = (zones: Zone[], from: string, to: string): Zone[] =>
  zones.map((z) => (z.name === from ? { ...z, name: to } : z))
