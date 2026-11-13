import { useCallback, useEffect, useMemo, useState } from 'react'
import AppNavigation from '../components/AppNavigation'
import {
  ALERT_CATEGORY_LABELS_TH,
  ALERT_LABELS_TH,
  type AlertCategory,
  type AlertType,
} from '../types/alerts'
import {
  fetchDailyReport,
  getTodayDateInputValue,
  shiftDateInputValue,
  type DailyReport,
} from '../services/dailyReport'
import {
  downloadDailyReportCsv,
  downloadDailyReportJson,
  formatDateThai,
  formatDurationMs,
  formatTimeShort,
} from '../lib/dailyReportExport'
import '../App.css'
import './PeoplePage.css'
import './AlertsPage.css'
import './ReportsPage.css'

const CATEGORIES: AlertCategory[] = ['posture', 'fatigue', 'distance', 'fall']

export default function ReportsPage() {
  const [date, setDate] = useState(() => {
    const param = new URLSearchParams(window.location.search).get('date')
    return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : getTodayDateInputValue()
  })
  const [report, setReport] = useState<DailyReport | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  const today = getTodayDateInputValue()

  const handleRefresh = useCallback(() => {
    setStatus('loading')
    fetchDailyReport(date)
      .then((data) => {
        setReport(data)
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'โหลดรายงานประจำวันไม่สำเร็จ')
        setStatus('error')
      })
  }, [date])

  useEffect(() => {
    let cancelled = false
    fetchDailyReport(date)
      .then((data) => {
        if (cancelled) return
        setReport(data)
        setError(null)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'โหลดรายงานประจำวันไม่สำเร็จ')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [date])

  const maxHourlyTotal = useMemo(() => {
    if (!report) return 1
    return Math.max(1, ...report.hourly.map((b) => b.total))
  }, [report])

  const sortedByType = useMemo(() => {
    if (!report) return []
    return Object.entries(report.summary.byType).sort((a, b) => b[1] - a[1])
  }, [report])

  const handleDateChange = (nextDate: string) => {
    if (!nextDate || nextDate === date) return
    setStatus('loading')
    setDate(nextDate)
  }

  return (
    <>
      <AppNavigation active="report" />
      <div className="app-shell people-page reports-page">
      <header className="page-heading people-header">
        <div>
          <h1>รายงานประจำวัน</h1>
          <p>
            สรุปการอยู่หน้ากล้องและการแจ้งเตือนสุขภาพของ {formatDateThai(date)}
          </p>
        </div>
        <div className="page-heading-actions reports-actions no-print">
          <button type="button" className="secondary-button" onClick={handleRefresh} disabled={status === 'loading'}>
            {status === 'loading' ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!report}
            onClick={() => report && downloadDailyReportCsv(report)}
          >
            ส่งออก CSV
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!report}
            onClick={() => report && downloadDailyReportJson(report)}
          >
            ส่งออก JSON
          </button>
          <button type="button" className="primary-button" disabled={!report} onClick={() => window.print()}>
            พิมพ์รายงาน
          </button>
        </div>
      </header>

      <section className="panel reports-toolbar no-print">
        <div className="reports-date-nav">
          <button
            type="button"
            className="reports-pill-btn"
            onClick={() => handleDateChange(shiftDateInputValue(date, -1))}
          >
            ‹ วันก่อนหน้า
          </button>
          <input
            type="date"
            aria-label="เลือกวันที่รายงาน"
            value={date}
            max={today}
            onChange={(e) => handleDateChange(e.target.value)}
          />
          <button
            type="button"
            className="reports-pill-btn"
            disabled={date >= today}
            onClick={() => handleDateChange(shiftDateInputValue(date, 1))}
          >
            วันถัดไป ›
          </button>
        </div>
        <button
          type="button"
          className={`reports-pill-btn reports-today-btn ${date === today ? 'is-active' : ''}`}
          disabled={date === today}
          onClick={() => handleDateChange(today)}
        >
          วันนี้
        </button>
      </section>

      {status === 'error' && (
        <section className="panel people-error">
          <strong>ไม่สามารถโหลดรายงานได้:</strong> {error ?? 'กรุณาตรวจสอบว่าเปิด camwell-backend อยู่'}
        </section>
      )}

      {report && (
        <>
          <section className="people-stats">
            <div className="panel people-stat">
              <span className="people-stat-value">{report.summary.totalPeople} คน</span>
              <span className="people-stat-label">บุคคลที่พบในวันนี้ ({report.summary.totalSessions} ช่วง)</span>
            </div>
            <div className="panel people-stat">
              <span className="people-stat-value">{formatDurationMs(report.summary.totalPresenceMs)}</span>
              <span className="people-stat-label">เวลาอยู่หน้ากล้องรวม</span>
            </div>
            <div className="panel people-stat">
              <span className={`people-stat-value ${report.summary.totalAlerts > 0 ? 'is-warn' : ''}`}>
                {report.summary.totalAlerts}
              </span>
              <span className="people-stat-label">
                แจ้งเตือนทั้งหมด (รวม {formatDurationMs(report.summary.totalAlertDurationMs)})
              </span>
            </div>
            {CATEGORIES.map((cat) => (
              <div key={cat} className="panel people-stat">
                <span
                  className={`people-stat-value ${
                    cat === 'fall' && report.summary.byCategory[cat] > 0 ? 'is-danger' : ''
                  }`}
                >
                  {report.summary.byCategory[cat]}
                </span>
                <span className="people-stat-label">{ALERT_CATEGORY_LABELS_TH[cat]}</span>
              </div>
            ))}
          </section>

          <div className="reports-grid">
            <section className="panel reports-chart-panel">
              <div className="reports-panel-head">
                <h2>การแจ้งเตือนรายชั่วโมง (00:00 – 23:00)</h2>
                <div className="reports-legend">
                  {CATEGORIES.map((cat) => (
                    <span key={cat} className="reports-legend-item">
                      <span className={`reports-dot is-${cat}`} />
                      {ALERT_CATEGORY_LABELS_TH[cat]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="reports-hourly-chart" role="img" aria-label="กราฟแท่งการแจ้งเตือนรายชั่วโมง">
                {report.hourly.map((bucket) => {
                  const totalPct = Math.round((bucket.total / maxHourlyTotal) * 100)
                  const title = `${String(bucket.hour).padStart(2, '0')}:00 — ${bucket.total} ครั้ง (ท่านั่ง ${bucket.byCategory.posture}, เหนื่อยล้า ${bucket.byCategory.fatigue}, ระยะห่าง ${bucket.byCategory.distance}, หกล้ม ${bucket.byCategory.fall})`
                  return (
                    <div key={bucket.hour} className="reports-hour-col" title={title}>
                      <span className="reports-hour-count">{bucket.total > 0 ? bucket.total : ''}</span>
                      <div className="reports-hour-bar-track">
                        <div className="reports-hour-bar" style={{ height: `${totalPct}%` }}>
                          {CATEGORIES.map((cat) => {
                            const count = bucket.byCategory[cat]
                            if (count === 0 || bucket.total === 0) return null
                            return (
                              <span
                                key={cat}
                                className={`reports-hour-seg is-${cat}`}
                                style={{ height: `${(count / bucket.total) * 100}%` }}
                              />
                            )
                          })}
                        </div>
                      </div>
                      <span className="reports-hour-label">{String(bucket.hour).padStart(2, '0')}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="panel reports-types-panel">
              <h2>แยกตามประเภทการแจ้งเตือน</h2>
              {sortedByType.length === 0 ? (
                <p className="people-muted">ไม่มีเหตุการณ์แจ้งเตือนในวันที่เลือก</p>
              ) : (
                <ul className="reports-type-list">
                  {sortedByType.map(([type, count]) => {
                    const pct = report.summary.totalAlerts > 0 ? Math.round((count / report.summary.totalAlerts) * 100) : 0
                    const label = ALERT_LABELS_TH[type as AlertType] ?? type
                    return (
                      <li key={type} className="reports-type-item">
                        <div className="reports-type-row">
                          <span>{label}</span>
                          <strong>
                            {count} ครั้ง ({pct}%)
                          </strong>
                        </div>
                        <div className="reports-type-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="panel">
            <h2>สรุปรายบุคคล ({report.people.length} คน)</h2>
            {report.people.length === 0 ? (
              <p className="people-muted">ยังไม่มีข้อมูลบุคคลในวันที่เลือก</p>
            ) : (
              <div className="people-table-wrap">
                <table className="people-table reports-table">
                  <thead>
                    <tr>
                      <th className="is-left">บุคคล</th>
                      <th className="is-left">กล้อง</th>
                      <th className="is-center">เวลาเข้า–ออก</th>
                      <th className="is-center">อยู่หน้ากล้อง</th>
                      <th className="is-center">ช่วงที่พบ</th>
                      <th className="is-center">แจ้งเตือนรวม</th>
                      <th className="is-center">ท่านั่ง</th>
                      <th className="is-center">เหนื่อยล้า</th>
                      <th className="is-center">ระยะห่าง</th>
                      <th className="is-center">หกล้ม</th>
                      <th className="is-center">เวลาแจ้งเตือนรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.people.map((person) => (
                      <tr key={person.key} className={person.byCategory.fall > 0 ? 'alerts-row-fall' : undefined}>
                        <td className="people-name is-left">
                          {person.employeeId ? (
                            <a className="alerts-person-link" href={`?alerts&employee=${encodeURIComponent(person.employeeId)}`}>
                              {person.personName}
                            </a>
                          ) : (
                            person.personName
                          )}
                        </td>
                        <td className="is-left">{person.cameras.length > 0 ? person.cameras.join(', ') : '—'}</td>
                        <td className="is-center">
                          {formatTimeShort(person.firstSeenAt)} – {formatTimeShort(person.lastSeenAt)}
                        </td>
                        <td className="is-center">{formatDurationMs(person.presenceDurationMs)}</td>
                        <td className="is-center">{person.sessionCount}</td>
                        <td className="is-center">
                          <strong>{person.totalAlerts}</strong>
                        </td>
                        <td className="is-center">{person.byCategory.posture}</td>
                        <td className="is-center">{person.byCategory.fatigue}</td>
                        <td className="is-center">{person.byCategory.distance}</td>
                        <td className="is-center">{person.byCategory.fall}</td>
                        <td className="is-center">{formatDurationMs(person.alertDurationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>สรุปตามกล้อง ({report.cameras.length} ตัว)</h2>
            {report.cameras.length === 0 ? (
              <p className="people-muted">ยังไม่มีข้อมูลกล้องในวันที่เลือก</p>
            ) : (
              <div className="people-table-wrap">
                <table className="people-table reports-table">
                  <thead>
                    <tr>
                      <th className="is-left">กล้อง</th>
                      <th className="is-center">จำนวนช่วงที่พบ</th>
                      <th className="is-center">แจ้งเตือนรวม</th>
                      <th className="is-center">ท่านั่ง</th>
                      <th className="is-center">ความเหนื่อยล้า</th>
                      <th className="is-center">ระยะห่างจอ</th>
                      <th className="is-center">หกล้ม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cameras.map((cam) => (
                      <tr key={cam.cameraId}>
                        <td className="people-name is-left">{cam.cameraLabel}</td>
                        <td className="is-center">{cam.sessionCount}</td>
                        <td className="is-center">
                          <strong>{cam.totalAlerts}</strong>
                        </td>
                        <td className="is-center">{cam.byCategory.posture}</td>
                        <td className="is-center">{cam.byCategory.fatigue}</td>
                        <td className="is-center">{cam.byCategory.distance}</td>
                        <td className="is-center">{cam.byCategory.fall}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      </div>
    </>
  )
}
