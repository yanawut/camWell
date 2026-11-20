import { useState } from 'react'
import type { EnrolledPerson } from '../types/identity'

interface Props {
  people: EnrolledPerson[]
  onRemove: (id: string) => void
  onRename: (id: string, name: string, consentGiven: boolean) => Promise<void>
}

export default function EnrollmentPanel({ people, onRemove, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftConsent, setDraftConsent] = useState(false)
  const [saving, setSaving] = useState(false)

  const startEdit = (person: EnrolledPerson) => {
    setEditingId(person.id)
    setDraftName(person.name)
    setDraftConsent(person.consentGivenAt !== null)
  }

  const saveEdit = (person: EnrolledPerson) => {
    if (!draftName.trim()) return
    setSaving(true)
    onRename(person.id, draftName, draftConsent && person.consentGivenAt === null)
      .then(() => setEditingId(null))
      .catch(() => {
        // App แสดงข้อความ error ให้แล้ว — คงช่องแก้ไขไว้ให้ลองใหม่
      })
      .finally(() => setSaving(false))
  }

  return (
    <div className="panel enrollment-panel">
      <h2>พนักงานที่ลงทะเบียนใบหน้าไว้ ({people.length})</h2>
      <p className="panel-note">
        ลงทะเบียนได้จากช่องใต้ภาพกล้อง (ต้องเห็นหน้าชัดเจนก่อน) หรือเปิด "ลงทะเบียนอัตโนมัติ" ในตั้งค่า ระบบจะเพิ่มคนที่ไม่
        รู้จักให้เองเป็น "คนที่ 1", "คนที่ 2", … แล้วกด "เปลี่ยนชื่อ" เป็นชื่อจริงทีหลังได้ ข้อมูลเก็บไว้ที่ camwell-backend
        (ฐานข้อมูล SQLite กลาง) — <strong>ต้องขอความยินยอมจากพนักงานก่อนใช้งานจริงเสมอ</strong> (ดูรายละเอียดเรื่อง
        PDPA ใน camwell-backend/README.md)
      </p>
      {people.length === 0 ? (
        <p className="empty-state">ยังไม่มีใครลงทะเบียนไว้</p>
      ) : (
        <ul className="enrolled-list">
          {people.map((p) =>
            editingId === p.id ? (
              <li key={p.id} className="enrolled-edit">
                <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
                {p.consentGivenAt === null && (
                  <label className="settings-checkbox">
                    <input type="checkbox" checked={draftConsent} onChange={(e) => setDraftConsent(e.target.checked)} />
                    <span>ขอความยินยอมจากคนนี้แล้ว (PDPA)</span>
                  </label>
                )}
                <span className="enrolled-actions">
                  <button
                    type="button"
                    className="link-button link-button-primary"
                    onClick={() => saveEdit(p)}
                    disabled={saving || !draftName.trim()}
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  <button type="button" className="link-button link-button-muted" onClick={() => setEditingId(null)}>
                    ยกเลิก
                  </button>
                </span>
              </li>
            ) : (
              <li key={p.id}>
                <span>
                  {p.name}
                  {p.consentGivenAt === null && <span className="tag-warning">ยังไม่ยืนยันความยินยอม</span>}
                </span>
                <span className="enrolled-actions">
                  <button type="button" className="link-button link-button-primary" onClick={() => startEdit(p)}>
                    เปลี่ยนชื่อ
                  </button>
                  <button type="button" className="link-button" onClick={() => onRemove(p.id)}>
                    ลบ
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
