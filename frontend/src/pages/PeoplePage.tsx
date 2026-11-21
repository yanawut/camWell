import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EnrolledPerson } from '../types/identity'
import { listEnrolledPeople, removePerson, renamePerson } from '../services/faceEnrollment'
import { getAlertSummary, type AlertSummary } from '../services/alertHistory'
import { ALERT_CATEGORY_LABELS_TH, type AlertCategory } from '../types/alerts'
import '../App.css'
import './PeoplePage.css'
import AppNavigation from '../components/AppNavigation'
import { useConfirm } from '../components/ConfirmDialog'
import { WarnGlyph } from '../envelope/marks'

// หน้ารายชื่อบุคคลที่ลงทะเบียนใบหน้าไว้ใน DB (camwell-backend) — เปิดผ่าน /?people แยกจากหน้ากล้อง
// ไม่โหลดโมเดล AI/กล้องเลย จึงเปิดดู/จัดการรายชื่อจากเครื่องไหนก็ได้ที่ต่อ backend ตัวเดียวกัน

function formatDateTime(epochMs: number) {
  return new Date(epochMs).toLocaleString('th-TH', { hour12: false, dateStyle: 'medium', timeStyle: 'short' })
}

function AlertCountCell({ summary, employeeId }: { summary: AlertSummary | undefined; employeeId: string }) {
  if (!summary) return <span className="people-muted">0</span>
  const detail = (Object.entries(summary.byCategory) as [AlertCategory, number][])
    .map(([category, count]) => `${ALERT_CATEGORY_LABELS_TH[category] ?? category} ${count}`)
    .join(' · ')
  return (
    <a className="people-alert-link" href={`?alerts&employee=${encodeURIComponent(employeeId)}`} title={detail}>
      {summary.total} รายการ →
    </a>
  )
}

export default function PeoplePage() {
  const [people, setPeople] = useState<EnrolledPerson[]>([])
  // จำนวนการแจ้งเตือนรายคนจาก DB (key = employeeId) — คนที่ไม่เคยถูกแจ้งเตือนจะไม่มีใน map
  const [alertSummary, setAlertSummary] = useState<Map<string, AlertSummary>>(new Map())
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftConsent, setDraftConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const lastEditedRef = useRef<string | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [confirm, confirmDialog] = useConfirm()

  const fetchPeople = useCallback(() => {
    Promise.all([listEnrolledPeople(), getAlertSummary()])
      .then(([rows, summary]) => {
        setPeople(rows)
        setAlertSummary(new Map(summary.map((s) => [s.employeeId, s])))
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'โหลดรายชื่อไม่สำเร็จ')
        setStatus('error')
      })
  }, [])

  // status เริ่มต้นเป็น 'loading' อยู่แล้ว — โหลดครั้งแรกไม่ต้อง set ซ้ำ
  useEffect(() => {
    fetchPeople()
  }, [fetchPeople])

  const handleRefresh = useCallback(() => {
    setStatus('loading')
    fetchPeople()
  }, [fetchPeople])

  const handleRemove = useCallback(
    async (person: EnrolledPerson) => {
      // ลบแล้วข้อมูลใบหน้าหายถาวร (สิทธิ์ขอลบตาม PDPA) — ยืนยันก่อนกันกดพลาด
      const confirmed = await confirm({
        title: 'ลบข้อมูลใบหน้า',
        message: (
          <>
            <p>
              ข้อมูลใบหน้าทั้งหมดของ <strong>{person.name}</strong> จะถูกลบออกจากระบบ
            </p>
            <p>ลบแล้วกู้คืนไม่ได้ ถ้าต้องการให้ระบบจำคนนี้อีกต้องลงทะเบียนใหม่</p>
          </>
        ),
        confirmLabel: 'ลบถาวร',
        danger: true,
      })
      if (!confirmed) return
      setRemovingId(person.id)
      removePerson(person.id)
        .then(() => setPeople((prev) => prev.filter((p) => p.id !== person.id)))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ'))
        .finally(() => setRemovingId(null))
    },
    [confirm],
  )

  // เปลี่ยนชื่อในแถวนั้นเลย: ช่องชื่อกลายเป็นช่องกรอก และช่อง PDPA กลายเป็นช่องติ๊ก
  // ติ๊กเพื่อบันทึกความยินยอม (เช่น คนที่ลงทะเบียนอัตโนมัติ) หรือเอาติ๊กออกเมื่อเผลอติ๊กผิด
  const startEdit = (person: EnrolledPerson) => {
    setEditingId(person.id)
    setDraftName(person.name)
    setDraftConsent(person.consentGivenAt !== null)
  }

  const closeEdit = () => {
    lastEditedRef.current = editingId
    setEditingId(null)
  }

  const saveEdit = async (person: EnrolledPerson) => {
    const name = draftName.trim()
    if (!name || saving) return
    // undefined = ไม่เปลี่ยนบันทึกความยินยอม
    const consentGiven = draftConsent === (person.consentGivenAt !== null) ? undefined : draftConsent
    if (name === person.name && consentGiven === undefined) {
      closeEdit()
      return
    }
    if (consentGiven === false) {
      const confirmed = await confirm({
        title: 'ล้างบันทึกความยินยอม',
        message: (
          <>
            <p>
              บันทึกความยินยอม (PDPA) ของ <strong>{person.name}</strong> จะถูกล้าง และกลับเป็น "ไม่มีบันทึก"
            </p>
            <p>ใช้กรณีติ๊กผิดเท่านั้น ถ้าพนักงานขอถอนความยินยอมเอง ให้กด "ลบ" ข้อมูลใบหน้าของคนนี้แทน</p>
          </>
        ),
        confirmLabel: 'ล้างบันทึก',
      })
      if (!confirmed) return
    }
    setSaving(true)
    renamePerson(person.id, name, consentGiven)
      .then((updated) => {
        setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        setError(null)
        closeEdit()
      })
      // คงช่องแก้ไขไว้ให้ลองใหม่
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'เปลี่ยนชื่อไม่สำเร็จ'))
      .finally(() => setSaving(false))
  }

  // ปิดช่องแก้ไขแล้วคืนโฟกัสให้ปุ่ม "เปลี่ยนชื่อ" ของแถวเดิม (ผู้ใช้คีย์บอร์ดไม่หลุดไปต้นหน้า)
  useEffect(() => {
    const id = lastEditedRef.current
    if (editingId !== null || id === null) return
    lastEditedRef.current = null
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-rename-id="${CSS.escape(id)}"]`)?.focus()
  }, [editingId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...people].sort((a, b) => b.enrolledAt - a.enrolledAt)
    return q ? sorted.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : sorted
  }, [people, query])

  const withConsent = people.filter((p) => p.consentGivenAt !== null).length

  return (
    <>
      <AppNavigation active="people" />
      <div className="app-shell people-page directory-page">
      <header className="page-heading people-header">
        <div>
          <h1>ฐานข้อมูลรายชื่อบุคคล</h1>
          <p>จัดการการลงทะเบียนใบหน้าและความยินยอมในการตรวจสอบ</p>
        </div>
        <div className="page-heading-actions">
          <button type="button" className="secondary-button" onClick={handleRefresh} disabled={status === 'loading'}>
            {status === 'loading' ? 'กำลังโหลด...' : 'อัปเดตรายชื่อ'}
          </button>
          <a className="primary-button people-register-link" href="?camera">ลงทะเบียนใหม่</a>
        </div>
      </header>

      <div className="people-stats">
        <div className="panel people-stat">
          <span className="people-stat-value">{people.length}</span>
          <span className="people-stat-label">ลงทะเบียนทั้งหมด</span>
        </div>
        <div className="panel people-stat">
          <span className="people-stat-value">{withConsent}</span>
          <span className="people-stat-label">ยืนยันความยินยอมแล้ว</span>
        </div>
        <div className="panel people-stat">
          <span className={`people-stat-value ${people.length - withConsent > 0 ? 'is-warn' : ''}`}>
            {people.length - withConsent}
          </span>
          <span className="people-stat-label">ยังไม่มีบันทึกความยินยอม</span>
        </div>
      </div>

      <div className="panel event-log">
        <div className="people-toolbar">
          <input
            type="search"
            placeholder="ค้นหาชื่อหรือ ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <p className="panel-note panel-warning">{error}</p>}

        {status !== 'loading' && filtered.length === 0 ? (
          <p className="empty-state">{people.length === 0 ? 'ยังไม่มีใครลงทะเบียนไว้' : 'ไม่พบรายชื่อที่ค้นหา'}</p>
        ) : (
          <div className="people-table-wrap">
            <table ref={tableRef}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>ชื่อ</th>
                  <th>ลงทะเบียนเมื่อ</th>
                  <th>ความยินยอม (PDPA)</th>
                  <th>การแจ้งเตือน</th>
                  <th>ID</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const editing = editingId === p.id
                  return (
                    <tr key={p.id} className={editing ? 'is-editing' : undefined}>
                      <td className="people-muted">{idx + 1}</td>
                      <td className="people-name">
                        {editing ? (
                          <input
                            type="text"
                            className="people-name-input"
                            aria-label={`ชื่อใหม่ของ ${p.name}`}
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit(p)
                              if (e.key === 'Escape' && !saving) closeEdit()
                            }}
                            autoFocus
                          />
                        ) : (
                          <>
                            {p.name}
                            {p.autoEnrolled && <span className="people-tag">อัตโนมัติ</span>}
                          </>
                        )}
                      </td>
                      <td>{formatDateTime(p.enrolledAt)}</td>
                      <td className={editing ? undefined : p.consentGivenAt ? 'people-good' : 'people-warn'}>
                        {editing ? (
                          <label className="people-consent-check">
                            <input type="checkbox" checked={draftConsent} onChange={(e) => setDraftConsent(e.target.checked)} />
                            <span>ขอความยินยอมแล้ว</span>
                          </label>
                        ) : p.consentGivenAt ? (
                          `✓ ${formatDateTime(p.consentGivenAt)}`
                        ) : (
                          'ไม่มีบันทึก'
                        )}
                      </td>
                      <td>
                        <AlertCountCell summary={alertSummary.get(p.id)} employeeId={p.id} />
                      </td>
                      <td className="metrics-cell" title={p.id}>
                        {p.id.slice(0, 8)}
                      </td>
                      <td className="people-actions">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              className="link-button people-link-primary"
                              onClick={() => void saveEdit(p)}
                              disabled={saving || !draftName.trim()}
                            >
                              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                            <button type="button" className="link-button link-button-muted" onClick={closeEdit} disabled={saving}>
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="link-button people-link-primary"
                              data-rename-id={p.id}
                              onClick={() => startEdit(p)}
                            >
                              เปลี่ยนชื่อ
                            </button>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => void handleRemove(p)}
                              disabled={removingId === p.id}
                            >
                              {removingId === p.id ? 'กำลังลบ...' : 'ลบ'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="pdpa-note">
        <WarnGlyph /> Face descriptor เป็นข้อมูลชีวภาพตาม PDPA — หน้านี้ไม่แสดง descriptor ดิบ (อยู่บน backend ที่เดียว) การลบจะลบ
        ข้อมูลใบหน้าของคนนั้นทั้งหมดถาวร
      </p>
      </div>
      {confirmDialog}
    </>
  )
}
