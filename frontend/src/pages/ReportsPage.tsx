import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  type DailyReportPerson,
} from '../services/dailyReport'
import {
  downloadDailyReportCsv,
  downloadDailyReportJson,
  formatDateThai,
  formatDurationMs,
  formatTimeShort,
  RISK_LEVEL_LABELS_TH,
} from '../lib/dailyReportExport'
import {
  buildLineShareUrl,
  buildLineSummaryText,
  copyPersonCardImage,
  downloadPersonCardPng,
} from '../lib/personSummaryExport'
import {
  extractPersonDailySymptoms,
  extractPotentialConditions,
  NO_SYMPTOMS_TEXT,
  type UpperBodyZones,
  type ZoneSeverity,
} from '../lib/personSymptoms'
import '../App.css'
import './PeoplePage.css'
import './AlertsPage.css'
import './ReportsPage.css'

const CATEGORIES: AlertCategory[] = ['posture', 'fatigue', 'distance', 'fall']
type PeopleViewMode = 'cards' | 'table'
type RiskFilter = 'all' | 'high' | 'moderate' | 'low' | 'chronic'

// สีจุดอาการตามระดับ (token ของซองยา — เปลี่ยนตามธีมเอง): ไม่มี = เส้นจาง, ต่ำ = หมึก, ปานกลาง = แดงจาง, สูง = แดง
const ZONE_STROKE: Record<ZoneSeverity, string> = {
  none: 'var(--rx-rule-soft)',
  low: 'var(--rx-ink)',
  moderate: 'color-mix(in srgb, var(--rx-stamp) 55%, var(--rx-paper))',
  high: 'var(--rx-stamp)',
}

function UpperBodySymptomMap({ zones }: { zones: UpperBodyZones }) {
  return (
    <div className="reports-body-map" title="แผนภาพจุดเฝ้าระวังอาการส่วนบน (ศีรษะ/ตา · คอ · บ่า/ไหล่ · หลัง)">
      <svg viewBox="0 0 120 132" className="reports-body-svg" aria-label="แผนภาพจุดอาการ">
        <circle cx="60" cy="24" r="15" fill="none" style={{ stroke: 'var(--rx-ink)' }} strokeWidth="2.5" />
        <circle cx="60" cy="22" r="5" style={{ fill: ZONE_STROKE[zones.head] }} />
        <line x1="60" y1="39" x2="60" y2="54" style={{ stroke: ZONE_STROKE[zones.neck] }} strokeWidth="7" strokeLinecap="round" />
        <path
          d="M26 62 Q60 50 94 62"
          fill="none"
          style={{ stroke: ZONE_STROKE[zones.shoulders] }}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <rect x="44" y="64" width="32" height="52" rx="10" fill="none" style={{ stroke: ZONE_STROKE[zones.back] }} strokeWidth="4" />
        <line
          x1="60"
          y1="68"
          x2="60"
          y2="112"
          style={{ stroke: ZONE_STROKE[zones.back] }}
          strokeWidth="4"
          strokeDasharray="4 3"
        />
      </svg>
      <span className="reports-body-caption">จุดเฝ้าระวังหลัก</span>
    </div>
  )
}

export default function ReportsPage() {
  const [date, setDate] = useState(() => {
    const param = new URLSearchParams(window.location.search).get('date')
    return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : getTodayDateInputValue()
  })
  const [report, setReport] = useState<DailyReport | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [peopleView, setPeopleView] = useState<PeopleViewMode>('cards')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [personQuery, setPersonQuery] = useState('')
  const [cardFeedback, setCardFeedback] = useState<Record<string, string>>({})
  const feedbackTimersRef = useRef<Record<string, number>>({})

  const today = getTodayDateInputValue()

  useEffect(() => {
    const timers = feedbackTimersRef.current
    return () => {
      for (const timerId of Object.values(timers)) {
        window.clearTimeout(timerId)
      }
    }
  }, [])

  const showCardFeedback = useCallback((personKey: string, message: string) => {
    const prevTimer = feedbackTimersRef.current[personKey]
    if (prevTimer) window.clearTimeout(prevTimer)
    setCardFeedback((prev) => ({ ...prev, [personKey]: message }))
    feedbackTimersRef.current[personKey] = window.setTimeout(() => {
      setCardFeedback((prev) => {
        const next = { ...prev }
        delete next[personKey]
        return next
      })
      delete feedbackTimersRef.current[personKey]
    }, 2200)
  }, [])

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

  const filteredPeople = useMemo(() => {
    if (!report) return []
    const q = personQuery.trim().toLowerCase()
    return report.people.filter((person) => {
      if (q && !person.personName.toLowerCase().includes(q)) return false
      if (riskFilter === 'chronic') return person.riskTrend7d.chronicPattern
      if (riskFilter !== 'all') return person.officeSyndromeRisk.level === riskFilter
      return true
    })
  }, [report, personQuery, riskFilter])

  const handleDownloadPng = useCallback(
    async (person: DailyReportPerson) => {
      try {
        await downloadPersonCardPng(person, date)
        showCardFeedback(person.key, 'ดาวน์โหลดรูปแล้ว ✓')
      } catch {
        showCardFeedback(person.key, 'สร้างรูปไม่สำเร็จ')
      }
    },
    [date, showCardFeedback],
  )

  const handleCopyImage = useCallback(
    async (person: DailyReportPerson) => {
      try {
        const ok = await copyPersonCardImage(person, date)
        showCardFeedback(person.key, ok ? 'คัดลอกรูปแล้ว ✓' : 'เบราว์เซอร์ไม่รองรับคัดลอกรูป')
      } catch {
        showCardFeedback(person.key, 'คัดลอกรูปไม่สำเร็จ')
      }
    },
    [date, showCardFeedback],
  )

  const handleCopyLineText = useCallback(
    async (person: DailyReportPerson) => {
      try {
        await navigator.clipboard.writeText(buildLineSummaryText(person, date))
        showCardFeedback(person.key, 'คัดลอกข้อความ LINE แล้ว ✓')
      } catch {
        showCardFeedback(person.key, 'คัดลอกข้อความไม่สำเร็จ')
      }
    },
    [date, showCardFeedback],
  )

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

          <section className="panel reports-risk-panel">
            <div className="reports-panel-head">
              <div>
                <h2>คัดกรองความเสี่ยง Office Syndrome (จากพฤติกรรมหน้ากล้อง)</h2>
                <p className="reports-risk-note">
                  ประเมินจากเวลาการนั่งต่อเนื่อง (30%) + ท่านั่งผิดปกติ (45%) + ระยะห่างจอและความล้า (25%) —
                  เป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัยโรคทางการแพทย์
                </p>
              </div>
              <div className="reports-risk-pills">
                <button
                  type="button"
                  className={`reports-risk-filter-btn ${riskFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setRiskFilter('all')}
                >
                  ทั้งหมด {report.people.length} คน
                </button>
                <button
                  type="button"
                  className={`reports-risk-badge is-high reports-risk-filter-btn ${riskFilter === 'high' ? 'is-active' : ''}`}
                  onClick={() => setRiskFilter((prev) => (prev === 'high' ? 'all' : 'high'))}
                >
                  เสี่ยงสูง {report.summary.riskSummary.high} คน
                </button>
                <button
                  type="button"
                  className={`reports-risk-badge is-moderate reports-risk-filter-btn ${riskFilter === 'moderate' ? 'is-active' : ''}`}
                  onClick={() => setRiskFilter((prev) => (prev === 'moderate' ? 'all' : 'moderate'))}
                >
                  เสี่ยงปานกลาง {report.summary.riskSummary.moderate} คน
                </button>
                <button
                  type="button"
                  className={`reports-risk-badge is-low reports-risk-filter-btn ${riskFilter === 'low' ? 'is-active' : ''}`}
                  onClick={() => setRiskFilter((prev) => (prev === 'low' ? 'all' : 'low'))}
                >
                  เสี่ยงต่ำ {report.summary.riskSummary.low} คน
                </button>
                {report.summary.riskSummary.chronicRiskPeople > 0 && (
                  <button
                    type="button"
                    className={`reports-risk-badge is-chronic reports-risk-filter-btn ${riskFilter === 'chronic' ? 'is-active' : ''}`}
                    onClick={() => setRiskFilter((prev) => (prev === 'chronic' ? 'all' : 'chronic'))}
                  >
                    เสี่ยงต่อเนื่องใน 7 วัน {report.summary.riskSummary.chronicRiskPeople} คน
                  </button>
                )}
              </div>
            </div>
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
            <div className="reports-panel-head reports-people-head">
              <h2>
                สรุปรายบุคคล ({filteredPeople.length}
                {filteredPeople.length !== report.people.length ? ` / ${report.people.length}` : ''} คน)
              </h2>
              <div className="reports-people-controls no-print">
                <input
                  type="search"
                  className="reports-search-input"
                  placeholder="ค้นหาชื่อบุคคล..."
                  aria-label="ค้นหาชื่อบุคคล"
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                />
                <div className="reports-view-toggle" role="group" aria-label="รูปแบบการแสดงผลรายบุคคล">
                  <button
                    type="button"
                    className={`reports-pill-btn ${peopleView === 'cards' ? 'is-active' : ''}`}
                    onClick={() => setPeopleView('cards')}
                  >
                    แบบการ์ด
                  </button>
                  <button
                    type="button"
                    className={`reports-pill-btn ${peopleView === 'table' ? 'is-active' : ''}`}
                    onClick={() => setPeopleView('table')}
                  >
                    แบบตาราง
                  </button>
                </div>
              </div>
            </div>

            {report.people.length === 0 ? (
              <p className="people-muted">ยังไม่มีข้อมูลบุคคลในวันที่เลือก</p>
            ) : filteredPeople.length === 0 ? (
              <p className="people-muted">ไม่พบบุคคลที่ตรงกับเงื่อนไขการกรอง</p>
            ) : peopleView === 'cards' ? (
              <div className="reports-person-cards">
                {filteredPeople.map((person) => {
                  const risk = person.officeSyndromeRisk
                  const trend = person.riskTrend7d
                  const feedback = cardFeedback[person.key]
                  const lineUrl = buildLineShareUrl(buildLineSummaryText(person, date))
                  const { zones, symptoms } = extractPersonDailySymptoms(person)
                  const conditions = extractPotentialConditions(person)
                  return (
                    <article
                      key={person.key}
                      className={`reports-person-card is-${risk.level} ${person.byCategory.fall > 0 ? 'has-fall' : ''}`}
                    >
                      <div className="reports-person-card-head">
                        <div>
                          <div className="reports-person-title">
                            {person.employeeId ? (
                              <a
                                className="alerts-person-link"
                                href={`?alerts&employee=${encodeURIComponent(person.employeeId)}`}
                              >
                                {person.personName}
                              </a>
                            ) : (
                              <span>{person.personName}</span>
                            )}
                            {trend.chronicPattern && (
                              <span className="reports-chronic-tag" title="เสี่ยงปานกลาง-สูง >= 3 วันในรอบ 7 วัน">
                                สะสม 7 วัน
                              </span>
                            )}
                          </div>
                          <span className="reports-risk-sub">
                            {person.cameras.length > 0 ? person.cameras.join(', ') : '—'} · เข้า–ออก{' '}
                            {formatTimeShort(person.firstSeenAt)} – {formatTimeShort(person.lastSeenAt)} · อยู่หน้ากล้อง{' '}
                            {formatDurationMs(person.presenceDurationMs)}
                          </span>
                        </div>
                        <div className="reports-score-pill-wrap">
                          <span className={`reports-risk-badge is-${risk.level}`}>
                            {RISK_LEVEL_LABELS_TH[risk.level]} · {risk.score}/100
                          </span>
                          <span className="reports-trend-sub">
                            7 วัน: {trend.elevatedRiskDays}/{trend.activeDays} วัน
                          </span>
                        </div>
                      </div>

                      <div className="reports-symptom-layout">
                        <UpperBodySymptomMap zones={zones} />
                        <div className="reports-symptom-list">
                          <div className="reports-symptom-heading">อาการที่ตรวจพบวันนี้</div>
                          {symptoms.length === 0 && <p className="reports-conditions-empty">{NO_SYMPTOMS_TEXT}</p>}
                          {symptoms.map((item) => (
                            <div key={item.key} className="reports-symptom-row">
                              <span className="reports-symptom-name">
                                <span className={`reports-symptom-dot is-${item.severity}`} />
                                {item.label}
                              </span>
                              <strong className={`reports-symptom-val is-${item.severity}`}>{item.valueText}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="reports-conditions-box">
                        <div className="reports-conditions-title">แนวโน้มอาการที่อาจเกิดขึ้นได้</div>
                        {conditions.length === 0 ? (
                          <p className="reports-conditions-empty">ยังไม่พบแนวโน้มอาการป่วยเด่นจากพฤติกรรมวันนี้</p>
                        ) : (
                          <ul className="reports-conditions-list">
                            {conditions.map((cond) => (
                              <li key={cond.key} className={`reports-condition-item is-${cond.severity}`}>
                                <span className={`reports-symptom-dot is-${cond.severity}`} />
                                <div>
                                  <strong>{cond.title}</strong>
                                  <span className="reports-condition-reason"> — {cond.reason}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {risk.recommendations.length > 0 && (
                        <div className="reports-person-notes">
                          <p className="reports-risk-rec">
                            <strong>แนวทางดูแล:</strong> {risk.recommendations[0]}
                          </p>
                        </div>
                      )}

                      <div className="reports-card-actions no-print">
                        <button
                          type="button"
                          className="reports-card-btn"
                          onClick={() => void handleDownloadPng(person)}
                        >
                          บันทึกรูป PNG
                        </button>
                        <button
                          type="button"
                          className="reports-card-btn"
                          onClick={() => void handleCopyImage(person)}
                        >
                          คัดลอกรูป
                        </button>
                        <button
                          type="button"
                          className="reports-card-btn"
                          onClick={() => void handleCopyLineText(person)}
                        >
                          คัดลอกข้อความ LINE
                        </button>
                        <a
                          className="reports-card-btn is-line"
                          href={lineUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ส่งเข้า LINE
                        </a>
                        {feedback && <span className="reports-card-feedback">{feedback}</span>}
                      </div>
                    </article>
                  )
                })}
              </div>
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
                      <th className="is-center">ความเสี่ยง Office Syndrome</th>
                      <th className="is-center">แนวโน้ม 7 วัน</th>
                      <th className="is-left">ปัจจัยเสี่ยงหลัก</th>
                      <th className="is-center no-print">ส่งออก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.map((person) => {
                      const risk = person.officeSyndromeRisk
                      return (
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
                          <td className="is-center">
                            <span
                              className={`reports-risk-badge is-${risk.level}`}
                              title={`นั่งนาน ${risk.breakdown.sedentary}/30 · ท่านั่ง ${risk.breakdown.posture}/45 · สายตา/ล้า ${risk.breakdown.visualFatigue}/25`}
                            >
                              {RISK_LEVEL_LABELS_TH[risk.level]} · {risk.score}
                            </span>
                          </td>
                          <td className="is-center">
                            <span>
                              {person.riskTrend7d.elevatedRiskDays}/{person.riskTrend7d.activeDays} วัน
                            </span>
                            {person.riskTrend7d.chronicPattern && (
                              <span className="reports-chronic-tag" title="เสี่ยงปานกลาง-สูง >= 3 วันในรอบ 7 วัน">
                                สะสม
                              </span>
                            )}
                          </td>
                          <td className="is-left reports-factors-cell">
                            {risk.factors.length > 0 ? risk.factors.join(', ') : '—'}
                          </td>
                          <td className="is-center no-print">
                            <div className="reports-table-actions">
                              <button
                                type="button"
                                className="reports-card-btn"
                                onClick={() => void handleDownloadPng(person)}
                              >
                                PNG
                              </button>
                              <a
                                className="reports-card-btn is-line"
                                href={buildLineShareUrl(buildLineSummaryText(person, date))}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                LINE
                              </a>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
