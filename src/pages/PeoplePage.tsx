import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnrolledPerson } from '../types/identity'
import { listEnrolledPeople, removePerson, renamePerson } from '../services/faceEnrollment'
import { API_BASE_URL } from '../services/apiConfig'
import { getAlertSummary, type AlertSummary } from '../services/alertHistory'
import { ALERT_CATEGORY_LABELS_TH, type AlertCategory } from '../types/alerts'
import '../App.css'
import './PeoplePage.css'

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

  const handleRemove = useCallback((person: EnrolledPerson) => {
    // ลบแล้วข้อมูลใบหน้าหายถาวร (สิทธิ์ขอลบตาม PDPA) — ยืนยันก่อนกันกดพลาด
    if (!window.confirm(`ลบ "${person.name}" และข้อมูลใบหน้าทั้งหมดของคนนี้ออกจากระบบ?`)) return
    setRemovingId(person.id)
    removePerson(person.id)
      .then(() => setPeople((prev) => prev.filter((p) => p.id !== person.id)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ'))
      .finally(() => setRemovingId(null))
  }, [])

  const handleRename = useCallback((person: EnrolledPerson) => {
    const name = window.prompt(`เปลี่ยนชื่อ "${person.name}" เป็น`, person.name)?.trim()
    if (!name || name === person.name) return
    // คนที่ลงทะเบียนอัตโนมัติยังไม่มีบันทึกความยินยอม — ถามไปพร้อมกันตอนตั้งชื่อจริง
    const consentGiven =
      person.consentGivenAt === null && window.confirm(`ได้ขอความยินยอม (PDPA) จาก "${name}" แล้วใช่หรือไม่?`)
    renamePerson(person.id, name, consentGiven)
      .then((updated) => setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'เปลี่ยนชื่อไม่สำเร็จ'))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...people].sort((a, b) => b.enrolledAt - a.enrolledAt)
    return q ? sorted.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : sorted
  }, [people, query])

  const withConsent = people.filter((p) => p.consentGivenAt !== null).length

  return (
    <div className="app-shell people-page">
      <header className="app-header people-header">
        <div>
          <h1>รายชื่อบุคคลที่บันทึกในระบบ</h1>
          <p>ข้อมูลจาก camwell-backend ({API_BASE_URL}) — รวมทุกกล้อง/ทุกเครื่องที่ต่อ backend ตัวนี้</p>
        </div>
        <a className="secondary-button people-back" href="./">
            ← กลับ Dashboard
        </a>
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
          <button type="button" className="secondary-button" onClick={handleRefresh} disabled={status === 'loading'}>
            {status === 'loading' ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>

        {error && <p className="panel-note panel-warning">{error}</p>}

        {status !== 'loading' && filtered.length === 0 ? (
          <p className="empty-state">{people.length === 0 ? 'ยังไม่มีใครลงทะเบียนไว้' : 'ไม่พบรายชื่อที่ค้นหา'}</p>
        ) : (
          <div className="people-table-wrap">
            <table>
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
                {filtered.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="people-muted">{idx + 1}</td>
                    <td className="people-name">
                      {p.name}
                      {p.autoEnrolled && <span className="people-tag">อัตโนมัติ</span>}
                    </td>
                    <td>{formatDateTime(p.enrolledAt)}</td>
                    <td className={p.consentGivenAt ? 'people-good' : 'people-warn'}>
                      {p.consentGivenAt ? `✓ ${formatDateTime(p.consentGivenAt)}` : 'ไม่มีบันทึก'}
                    </td>
                    <td>
                      <AlertCountCell summary={alertSummary.get(p.id)} employeeId={p.id} />
                    </td>
                    <td className="metrics-cell" title={p.id}>
                      {p.id.slice(0, 8)}
                    </td>
                    <td className="people-actions">
                      <button type="button" className="link-button people-link-primary" onClick={() => handleRename(p)}>
                        เปลี่ยนชื่อ
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => handleRemove(p)}
                        disabled={removingId === p.id}
                      >
                        {removingId === p.id ? 'กำลังลบ...' : 'ลบ'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="pdpa-note">
        ⚠️ Face descriptor เป็นข้อมูลชีวภาพตาม PDPA — หน้านี้ไม่แสดง descriptor ดิบ (อยู่บน backend ที่เดียว) การลบจะลบ
        ข้อมูลใบหน้าของคนนั้นทั้งหมดถาวร
      </p>
    </div>
  )
}
