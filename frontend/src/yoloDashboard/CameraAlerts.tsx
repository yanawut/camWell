import { useState } from 'react'
import { setRemote, toast, useRemote, useWellnessSettings } from '../yoloConsole/store'
import type { WellnessSettings } from '../yoloConsole/types'
import { CATEGORY_TEXT, TEST_MODE } from '../yoloConsole/wellness'
import { yoloService } from '../yoloConsole/yoloService'
import { ALERT_GROUPS, FACE_FIELD, fieldInvalid, hasInvalidField, type AlertField } from './cameraAlertFields'
import { Phrases } from './marks'
import { errorText } from './errorText'
import { PrintedCheckbox } from './ui'

function NumberField({ field, value, onChange }: { field: AlertField; value: number; onChange: (v: number) => void }) {
  const id = `yd-cam-${field.key}`
  return (
    <div className="yd-cam-num">
      <label htmlFor={id}>{field.label}</label>
      <input
        id={id}
        type="number"
        className="yd-input"
        step={field.step}
        min={field.min}
        value={Number.isFinite(value) ? value : ''}
        aria-invalid={fieldInvalid(field, value)}
        aria-describedby={`${id}-unit`}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
      <span id={`${id}-unit`} className="yd-cam-num-unit">{field.unit}</span>
    </div>
  )
}

/** แผง "การแจ้งเตือน": เปิดปิดแต่ละหมวดและเกณฑ์ของ yolo-backend (/api/wellness/settings) */
export default function CameraAlerts() {
  const saved = useWellnessSettings()
  const defaults = useRemote<WellnessSettings>('wellness-defaults', yoloService.getWellnessDefaults)
  const [edited, setEdited] = useState<WellnessSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const draft = edited ?? saved.data

  const set = (key: string, value: number | boolean) => draft && setEdited({ ...draft, [key]: value })
  const invalid = draft ? hasInvalidField(draft) : false
  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      setRemote('wellness', await yoloService.putWellness(draft))
      setEdited(null)
      toast.success('บันทึกการตั้งค่าการแจ้งเตือนแล้ว มีผลทันที')
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="yd-panel" aria-labelledby="yd-cam-alerts-title">
      <div className="yd-panel-head">
        <h2 id="yd-cam-alerts-title">การแจ้งเตือน</h2>
      </div>
      <div className="yd-panel-body">
        <p className="yd-fine">
          <Phrases text="เปิดปิดแต่ละหมวดและปรับเกณฑ์ กดบันทึกแล้วมีผลกับกล้องที่กำลังวิเคราะห์ทันที" />
        </p>
        {!draft && (saved.error ? <p className="yd-error">{saved.error}</p> : <p className="yd-empty">กำลังโหลดเกณฑ์การแจ้งเตือน...</p>)}
        {draft && (
          <>
            <div className="yd-cam-wl-grid">
              {ALERT_GROUPS.map((g) => {
                const on = draft[`${g.category}_on`] as boolean
                return (
                  <div key={g.category} className={`yd-cam-wl-box${on ? '' : ' is-off'}`}>
                    <div className="yd-cam-wl-head">
                      <PrintedCheckbox checked={on} onChange={(checked) => set(`${g.category}_on`, checked)}>
                        {CATEGORY_TEXT[g.category]}
                      </PrintedCheckbox>
                      {!on && <span className="yd-cam-wl-off">ปิดอยู่</span>}
                    </div>
                    <p className="yd-fine">
                      <Phrases text={g.hint} />
                    </p>
                    <div className="yd-cam-wl-fields">
                      {g.fields.map((f) => (
                        <NumberField key={f.key} field={f} value={draft[f.key] as number} onChange={(v) => set(f.key, v)} />
                      ))}
                    </div>
                  </div>
                )
              })}
              <div className="yd-cam-wl-box">
                <div className="yd-cam-wl-head">
                  <h3 className="yd-cam-wl-title">ทั่วไป</h3>
                </div>
                <p className="yd-fine">
                  <Phrases text="หน้าที่เล็กกว่านี้จะขึ้นว่าวัดไม่ได้ แทนการเดา" />
                </p>
                <div className="yd-cam-wl-fields">
                  <NumberField field={FACE_FIELD} value={draft[FACE_FIELD.key] as number} onChange={(v) => set(FACE_FIELD.key, v)} />
                </div>
              </div>
            </div>
            <div className="yd-cam-bar">
              <button type="button" className="yd-btn" disabled={!edited || invalid || saving} onClick={() => void save()}>
                บันทึก
              </button>
              <button type="button" className="yd-btn-line" disabled={!edited} onClick={() => setEdited(null)}>
                ยกเลิกการแก้ไข
              </button>
              <button
                type="button"
                className="yd-btn-line"
                disabled={!defaults.data}
                onClick={() => defaults.data && setEdited({ ...defaults.data })}
              >
                คืนค่าเริ่มต้น
              </button>
              <button
                type="button"
                className="yd-btn-line yd-cam-test"
                onClick={() => setEdited({ ...draft, ...TEST_MODE })}
                title="ย่นเวลาทุกเกณฑ์ เพื่อลองให้เห็นการเตือนแต่ละแบบภายใน 1–2 นาที"
              >
                โหมดทดสอบ (ย่นเวลา)
              </button>
              <p className="yd-cam-bar-note" role="status">
                {edited && <span>ยังไม่ได้บันทึก</span>}
                {invalid && <span className="yd-error">มีช่องที่ค่าไม่ถูกต้อง</span>}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
