import { useState } from 'react'
import { setRemote, toast, useRemote, useWellnessSettings } from './store'
import { yoloService } from './yoloService'
import type { WellCategory, WellnessSettings } from './types'
import { CATEGORY_TEXT, TEST_MODE } from './wellness'

interface Field {
  key: string
  label: string
  unit: string
  step: number
  min: number
}

const GROUPS: { category: WellCategory; hint: string; fields: Field[] }[] = [
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
      { key: 'yawn_ratio', label: 'อ้าปากกว้างกว่า (นับว่าหาว)', unit: 'สูง/กว้าง', step: 0.05, min: 0.3 },
      { key: 'yawn_count', label: 'หาวถึง', unit: 'ครั้ง', step: 1, min: 1 },
      { key: 'yawn_window_minutes', label: 'ภายใน', unit: 'นาที', step: 1, min: 1 },
    ],
  },
  {
    category: 'fall',
    hint: 'แจ้งทันที ไม่รอสะสมเวลา',
    fields: [
      { key: 'fall_drop', label: 'ตัวร่วงลงอย่างน้อย', unit: 'เท่าของความสูงตัว', step: 0.05, min: 0.1 },
      { key: 'fall_angle', label: 'ลำตัวเอียงจากแนวตั้งเกิน', unit: 'องศา', step: 5, min: 20 },
    ],
  },
]
const FACE: Field = { key: 'min_face_px', label: 'หน้ากว้างอย่างน้อย (ระยะจอ/ความล้า)', unit: 'พิกเซล', step: 5, min: 20 }

function NumberField({ field, value, onChange }: { field: Field; value: number; onChange: (v: number) => void }) {
  return (
    <div className="yc-num-field">
      <label htmlFor={`wl-${field.key}`} className="dc-muted">{field.label}</label>
      <input
        id={`wl-${field.key}`}
        type="number"
        className="yc-input yc-num"
        step={field.step}
        min={field.min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
      <span className="dc-muted-12 yc-unit">{field.unit}</span>
    </div>
  )
}

export function WellnessSettingsCard() {
  const saved = useWellnessSettings()
  const defaults = useRemote<WellnessSettings>('wellness-defaults', yoloService.getWellnessDefaults)
  const [edited, setEdited] = useState<WellnessSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const draft = edited ?? saved.data
  if (!draft) return saved.error ? <p className="yc-error">{saved.error}</p> : null

  const set = (key: string, value: number | boolean) => setEdited({ ...draft, [key]: value })
  const all = [...GROUPS.flatMap((g) => g.fields), FACE]
  const invalid = all.some((f) => !Number.isFinite(draft[f.key] as number) || (draft[f.key] as number) < f.min)
  const save = async () => {
    setSaving(true)
    try {
      setRemote('wellness', await yoloService.putWellness(draft))
      setEdited(null)
      toast.success('บันทึกการตั้งค่าการแจ้งเตือนแล้ว มีผลทันที')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dc-card dc-pad" data-testid="wellness-settings">
      <div className="dc-card-head dc-col yc-stack-head">
        <h2 className="dc-h2">การแจ้งเตือน</h2>
        <span className="dc-muted-12">เปิดปิดแต่ละหมวดและปรับเกณฑ์ กดบันทึกแล้วมีผลกับกล้องที่กำลังวิเคราะห์ทันที</span>
      </div>
      <div className="yc-wl-grid">
        {GROUPS.map((g) => {
          const on = draft[`${g.category}_on`] as boolean
          return (
            <div key={g.category} className="yc-box">
              <label className="yc-switch">
                <input type="checkbox" role="switch" checked={on} onChange={(e) => set(`${g.category}_on`, e.target.checked)} />
                <strong>{CATEGORY_TEXT[g.category]}</strong>
                {!on && <span className="dc-muted-12">ปิดอยู่</span>}
              </label>
              <p className="dc-muted-12 yc-tight-p">{g.hint}</p>
              <div className={`yc-fields ${on ? '' : 'is-off'}`}>
                {g.fields.map((f) => (
                  <NumberField key={f.key} field={f} value={draft[f.key] as number} onChange={(v) => set(f.key, v)} />
                ))}
              </div>
            </div>
          )
        })}
        <div className="yc-box">
          <strong>ทั่วไป</strong>
          <p className="dc-muted-12 yc-tight-p">หน้าที่เล็กกว่านี้จะขึ้นว่าวัดไม่ได้ แทนการเดา</p>
          <div className="yc-fields">
            <NumberField field={FACE} value={draft[FACE.key] as number} onChange={(v) => set(FACE.key, v)} />
          </div>
        </div>
      </div>
      <div className="yc-savebar yc-row">
        <button type="button" className="dc-btn yc-btn-primary" disabled={!edited || invalid || saving} onClick={() => void save()}>
          บันทึก
        </button>
        <button type="button" className="dc-btn" disabled={!edited} onClick={() => setEdited(null)}>
          ยกเลิกการแก้ไข
        </button>
        <button type="button" className="dc-btn" disabled={!defaults.data} onClick={() => defaults.data && setEdited({ ...defaults.data })}>
          คืนค่าเริ่มต้น
        </button>
        <button
          type="button"
          className="dc-btn yc-btn-warn"
          onClick={() => setEdited({ ...draft, ...TEST_MODE })}
          title="ย่นเวลาทุกเกณฑ์ เพื่อลองให้เห็นการเตือนแต่ละแบบภายใน 1–2 นาที"
        >
          โหมดทดสอบ (ย่นเวลา)
        </button>
        {edited && <span className="dc-muted-12">ยังไม่ได้บันทึก</span>}
        {invalid && <span className="yc-error yc-inline">มีช่องที่ค่าไม่ถูกต้อง</span>}
      </div>
    </div>
  )
}
