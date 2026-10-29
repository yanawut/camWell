import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EnrolledPerson } from '../types/identity'
import { ALERT_CATEGORY_LABELS_TH, ALERT_LABELS_TH, type AlertCategory } from '../types/alerts'
import { listEnrolledPeople } from '../services/faceEnrollment'
import { listAlertRecords, type AlertRecord } from '../services/alertHistory'
import '../App.css'
import './PeoplePage.css'
import './AlertsPage.css'

// ตารางผลการแจ้งเตือนที่เก็บใน DB (camwell-backend ตาราง alert_events) — เปิดผ่าน /?alerts
// กรองรายคนได้ (/?alerts&employee=<id> — หน้ารายชื่อลิงก์มาแบบนี้) และหมวด ไม่โหลดกล้อง/โมเดล AI

const FETCH_LIMIT = 1000
const ALL = 'all'
const UNKNOWN_PERSON = 'unknown'
const CATEGORIES: AlertCategory[] = ['posture', 'fatigue', 'distance', 'fall']

function formatDateTime(epochMs: number) {
  return new Date(epochMs).toLocaleString('th-TH', { hour12: false, dateStyle: 'short', timeStyle: 'medium' })
}

function formatDuration(record: AlertRecord) {
  if (record.endedAt === null) return null
  const seconds = Math.max(0, Math.round((record.endedAt - record.startedAt) / 1000))
  if (seconds === 0) return 'ทันที'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} นาที ${s} วิ` : `${s} วิ`
}

function formatMetrics(metrics: Record<string, number>) {
  const entries = Object.entries(metrics)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key}: ${+value.toFixed(2)}`).join(', ')
}

function personLabel(record: AlertRecord) {
  return record.personName ?? 'ไม่ทราบตัวตน'
}

function cameraLabel(record: AlertRecord) {
  return record.cameraLabel ?? record.cameraId ?? '—'
}

/** ส่งออกเป็น CSV (มี BOM ให้ Excel อ่านภาษาไทยถูก) */
function downloadCsv(records: AlertRecord[]) {
  const header = ['เวลาเริ่ม', 'เวลาจบ', 'บุคคล', 'employeeId', 'กล้อง', 'หมวด', 'ประเภท', 'ระยะเวลา(วินาที)', 'ค่าที่วัดได้']
  const rows = records.map((r) => [
    new Date(r.startedAt).toISOString(),
    r.endedAt ? new Date(r.endedAt).toISOString() : '',
    personLabel(r),
    r.employeeId ?? '',
    cameraLabel(r),
    ALERT_CATEGORY_LABELS_TH[r.category] ?? r.category,
    ALERT_LABELS_TH[r.type] ?? r.type,
    r.endedAt ? String(Math.round((r.endedAt - r.startedAt) / 1000)) : '',
    formatMetrics(r.metrics),
  ])
  const csv = [header, ...rows].map((cols) => cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `camwell-alerts-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function AlertsPage() {
  const [records, setRecords] = useState<AlertRecord[]>([])
  const [people, setPeople] = useState<EnrolledPerson[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState(
    () => new URLSearchParams(window.location.search).get('employee') ?? ALL,
  )
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | typeof ALL>(ALL)

  // ดึงทั้งหมดครั้งเดียวแล้วกรองฝั่ง browser — รองรับตัวกรอง "ไม่ทราบตัวตน" ที่ backend กรองให้ไม่ได้
  const fetchAll = useCallback(() => {
    Promise.all([listAlertRecords({ limit: FETCH_LIMIT }), listEnrolledPeople()])
      .then(([rows, enrolled]) => {
        setRecords(rows)
        setPeople(enrolled)
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'โหลดประวัติการแจ้งเตือนไม่สำเร็จ')
        setStatus('error')
      })
  }, [])

  // status เริ่มต้นเป็น 'loading' อยู่แล้ว — โหลดครั้งแรกไม่ต้อง set ซ้ำ
  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleRefresh = useCallback(() => {
    setStatus('loading')
    fetchAll()
  }, [fetchAll])

  const handlePersonFilterChange = useCallback((value: string) => {
    setPersonFilter(value)
    // จำตัวกรองไว้ใน URL ให้ส่งลิงก์ต่อ/รีเฟรชแล้วได้มุมมองเดิม
    const params = new URLSearchParams(window.location.search)
    if (value === ALL) params.delete('employee')
    else params.set('employee', value)
    window.history.replaceState(null, '', `?${params.toString().replace(/=(&|$)/g, '$1')}`)
  }, [])

  const byPerson = useMemo(() => {
    if (personFilter === ALL) return records
    if (personFilter === UNKNOWN_PERSON) return records.filter((r) => r.employeeId === null)
    return records.filter((r) => r.employeeId === personFilter)
  }, [records, personFilter])

  const filtered = useMemo(
    () => (categoryFilter === ALL ? byPerson : byPerson.filter((r) => r.category === categoryFilter)),
    [byPerson, categoryFilter],
  )

  // ตัวเลขการ์ดสรุปคิดจากตัวกรองบุคคล (ไม่สนตัวกรองหมวด) เพื่อให้เห็นสัดส่วนทุกหมวดของคนนั้นพร้อมกัน
  const countByCategory = useMemo(() => {
    const counts: Record<AlertCategory, number> = { posture: 0, fatigue: 0, distance: 0, fall: 0 }
    for (const r of byPerson) counts[r.category] = (counts[r.category] ?? 0) + 1
    return counts
  }, [byPerson])

  const selectedPersonName =
    personFilter === ALL
      ? null
      : personFilter === UNKNOWN_PERSON
        ? 'ไม่ทราบตัวตน'
        : (people.find((p) => p.id === personFilter)?.name ?? 'บุคคลที่ถูกลบไปแล้ว')

  return (
    <div className="app-shell people-page">
      <header className="app-header people-header">
        <div>
          <h1>ผลการแจ้งเตือนในฐานข้อมูล{selectedPersonName ? ` — ${selectedPersonName}` : ''}</h1>
          <p>ทุกเหตุการณ์ที่ระบบแจ้งเตือน บันทึกใน camwell-backend พร้อมบุคคลที่ระบุตัวตนได้ (รวมทุกกล้อง/ทุกเครื่อง)</p>
        </div>
        <nav className="alerts-nav">
          <a className="secondary-button people-back" href="?people">
            รายชื่อบุคคล
          </a>
          <a className="secondary-button people-back" href="./">
            ← กลับหน้ากล้อง
          </a>
        </nav>
      </header>

      <div className="people-stats">
        <div className="panel people-stat">
          <span className="people-stat-value">{byPerson.length}</span>
          <span className="people-stat-label">การแจ้งเตือนทั้งหมด</span>
        </div>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`panel people-stat alerts-stat-button ${categoryFilter === c ? 'is-active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === c ? ALL : c)}
            title="กดเพื่อกรองเฉพาะหมวดนี้"
          >
            <span className={`people-stat-value ${c === 'fall' && countByCategory.fall > 0 ? 'is-danger' : ''}`}>
              {countByCategory[c]}
            </span>
            <span className="people-stat-label">{ALERT_CATEGORY_LABELS_TH[c]}</span>
          </button>
        ))}
      </div>

      <div className="panel event-log">
        <div className="people-toolbar alerts-filters">
          <select value={personFilter} onChange={(e) => handlePersonFilterChange(e.target.value)} aria-label="บุคคล">
            <option value={ALL}>ทุกคน</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={UNKNOWN_PERSON}>ไม่ทราบตัวตน</option>
            {personFilter !== ALL &&
              personFilter !== UNKNOWN_PERSON &&
              !people.some((p) => p.id === personFilter) && <option value={personFilter}>บุคคลที่ถูกลบไปแล้ว</option>}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as AlertCategory | typeof ALL)}
            aria-label="หมวด"
          >
            <option value={ALL}>ทุกหมวด</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ALERT_CATEGORY_LABELS_TH[c]}
              </option>
            ))}
          </select>
          <span className="alerts-spacer" />
          <button type="button" className="secondary-button" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
            ส่งออก CSV
          </button>
          <button type="button" className="secondary-button" onClick={handleRefresh} disabled={status === 'loading'}>
            {status === 'loading' ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>

        {error && <p className="panel-note panel-warning">{error}</p>}
        {records.length >= FETCH_LIMIT && (
          <p className="panel-note">แสดง {FETCH_LIMIT} รายการล่าสุด — รายการเก่ากว่านี้ยังอยู่ใน DB</p>
        )}

        {status !== 'loading' && filtered.length === 0 ? (
          <p className="empty-state">{records.length === 0 ? 'ยังไม่มีการแจ้งเตือนในฐานข้อมูล' : 'ไม่พบรายการตามตัวกรอง'}</p>
        ) : (
          <div className="people-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เวลาเริ่ม</th>
                  <th>บุคคล</th>
                  <th>กล้อง</th>
                  <th>หมวด</th>
                  <th>ประเภท</th>
                  <th>ระยะเวลา</th>
                  <th>ค่าที่แย่ที่สุด</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const duration = formatDuration(r)
                  return (
                    <tr key={r.id} className={r.category === 'fall' ? 'alerts-row-fall' : ''}>
                      <td>{formatDateTime(r.startedAt)}</td>
                      <td className={r.employeeId ? 'people-name' : 'people-muted'}>
                        {r.employeeId ? (
                          <a className="alerts-person-link" href={`?alerts&employee=${encodeURIComponent(r.employeeId)}`}>
                            {personLabel(r)}
                          </a>
                        ) : (
                          personLabel(r)
                        )}
                      </td>
                      <td>{cameraLabel(r)}</td>
                      <td>{ALERT_CATEGORY_LABELS_TH[r.category] ?? r.category}</td>
                      <td>{ALERT_LABELS_TH[r.type] ?? r.type}</td>
                      <td className={duration ? '' : 'people-muted'}>{duration ?? 'ไม่มีเวลาจบ'}</td>
                      <td className="metrics-cell">{formatMetrics(r.metrics)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
