import { useEffect, useState } from 'react'
import { COLORS } from './drawLive'
import { useYoloLive } from './useYoloLive'
import { yoloService } from './yoloService'
import type { PersonState, Report, ReportRow, SourceKind } from './types'

const KIND_TEXT: Record<SourceKind, string> = {
  sim: 'Simulator',
  video: 'วิดีโอ',
  image: 'รูปภาพ',
  browser: 'กล้อง browser',
  go2rtc: 'go2rtc',
}
const OUTCOME_TEXT: Record<string, string> = { ended: 'จบปกติ', error: 'มีปัญหา' }
const STATES: [PersonState, string][] = [['sitting', 'Sitting'], ['standing', 'Standing'], ['walking', 'Walking']]

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const dateTime = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

/** วินาที → m:ss หรือ h:mm:ss */
function clock(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`
}

const share = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '–')

function TimelineChart({ timeline }: { timeline: Report['timeline'] }) {
  const W = 640
  const H = 220
  const pad = { left: 34, right: 12, top: 12, bottom: 26 }
  const tMax = Math.max(1, ...timeline.map((p) => p.t))
  const yMax = Math.max(1, ...timeline.map((p) => p.people))
  const X = (t: number) => pad.left + (t / tMax) * (W - pad.left - pad.right)
  const Y = (v: number) => H - pad.bottom - (v / yMax) * (H - pad.top - pad.bottom)
  const yTicks = [...new Set([0, Math.round(yMax / 2), yMax])]
  const xTicks = [0, tMax / 2, tMax]
  return (
    <div>
      <svg className="yc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="จำนวนคนตามท่าทางตลอดช่วงเวลา">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={Y(v)} y2={Y(v)} className="yc-chart-grid" />
            <text x={pad.left - 8} y={Y(v)} className="yc-chart-tick" textAnchor="end" dominantBaseline="middle">{v}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={X(t)} y={H - 6} className="yc-chart-tick" textAnchor="middle">{clock(t)}</text>
        ))}
        {STATES.map(([key]) => (
          <polyline
            key={key}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            stroke={COLORS[key]}
            points={timeline.map((p) => `${X(p.t)},${Y(p[key])}`).join(' ')}
          />
        ))}
      </svg>
      <div className="yc-chart-legend">
        {STATES.map(([key, text]) => (
          <span key={key}><i style={{ background: COLORS[key] }} />{text}</span>
        ))}
      </div>
    </div>
  )
}

function Bars({ items, color }: { items: [string, number][]; color?: (name: string) => string }) {
  const max = Math.max(1, ...items.map(([, v]) => v))
  if (!items.length) return <p className="dc-empty">ไม่มีข้อมูล</p>
  return (
    <div className="yc-bars">
      {items.map(([name, value]) => (
        <div key={name} className="yc-bar">
          <div className="yc-bar-head">
            <span>{name}</span>
            <span className="dc-mono dc-muted">{clock(value)}</span>
          </div>
          <div className="yc-meter"><i style={{ width: `${(value / max) * 100}%`, background: color?.(name) }} /></div>
        </div>
      ))}
    </div>
  )
}

function ReportDetail({ report }: { report: Report }) {
  const { summary } = report
  const byState = STATES.map(([key, text]): [string, number] => [text, summary.person_seconds_by_state[key] ?? 0])
  const stateColor = (text: string) => COLORS[STATES.find(([, t]) => t === text)?.[0] ?? 'sitting']
  const byZone = Object.entries(summary.person_seconds_by_zone).sort((a, b) => a[0].localeCompare(b[0]))
  return (
    <>
      <div className="dc-card dc-pad">
        <div className="dc-card-head yc-wrap-head">
          <div className="dc-col">
            <h2 className="dc-h2">{report.source.label}</h2>
            <span className="dc-muted-12">
              {KIND_TEXT[report.source.kind]} · เริ่ม {dateTime(report.started_at)} · ยาว {clock(report.ended_at - report.started_at)} · {report.frames.toLocaleString('th-TH')} เฟรม
            </span>
          </div>
          {report.has_csv && (
            <a className="dc-btn yc-link-btn" href={yoloService.csvUrl(report.id)} download>
              ⤓ ดาวน์โหลด tracks.csv
            </a>
          )}
        </div>
        <div className="dc-statbar yc-statbar">
          <div className="dc-stat"><span className="dc-muted-12">ID ไม่ซ้ำ</span><span className="dc-stat-value">{summary.unique_people}</span></div>
          <div className="dc-stat"><span className="dc-muted-12">พร้อมกันสูงสุด</span><span className="dc-stat-value">{summary.peak_people}</span></div>
          <div className="dc-stat">
            <span className="dc-muted-12">เดินเร็วสุด</span>
            <span className="dc-stat-value">{summary.max_walking_speed_mps.toFixed(2)}<span className="dc-stat-unit"> m/s</span></span>
          </div>
          {summary.state_accuracy !== undefined && (
            <div className="dc-stat"><span className="dc-muted-12">state_accuracy</span><span className="dc-stat-value">{summary.state_accuracy.toFixed(4)}</span></div>
          )}
        </div>
      </div>

      <div className="yc-report-grid">
        <div className="dc-card dc-pad">
          <div className="dc-card-head"><h2 className="dc-h2">จำนวนคนตามท่าทาง ตลอดช่วงเวลา</h2></div>
          <TimelineChart timeline={report.timeline} />
        </div>
        <div className="dc-card dc-pad">
          <div className="dc-card-head dc-col yc-stack-head"><h2 className="dc-h2">เวลารวมตามท่าทาง</h2><span className="dc-muted-12">รวมทุกคน · นาที:วินาที</span></div>
          <Bars items={byState} color={stateColor} />
        </div>
        <div className="dc-card dc-pad">
          <div className="dc-card-head dc-col yc-stack-head"><h2 className="dc-h2">เวลารวมตามโซน</h2><span className="dc-muted-12">รวมทุกคน · นาที:วินาที</span></div>
          <Bars items={byZone} />
        </div>
      </div>

      <div className="dc-card">
        <div className="dc-pad dc-card-head yc-flush-head"><h2 className="dc-h2">รายคน</h2><span className="dc-muted-12">{report.people.length} คน</span></div>
        <div className="yc-table-scroll">
          <table className="dc-table">
            <thead>
              <tr><th>ID</th><th>เริ่มเห็น (วินาที)</th><th>เห็นล่าสุด (วินาที)</th><th>เฟรม</th><th>Sitting</th><th>Standing</th><th>Walking</th></tr>
            </thead>
            <tbody>
              {report.people.map((p) => (
                <tr key={p.id}>
                  <td className="dc-mono">#{String(p.id).padStart(2, '0')}</td>
                  <td>{p.first_t.toFixed(1)}</td>
                  <td>{p.last_t.toFixed(1)}</td>
                  <td>{p.frames.toLocaleString('th-TH')}</td>
                  <td>{share(p.sitting, p.frames)}</td>
                  <td>{share(p.standing, p.frames)}</td>
                  <td>{share(p.walking, p.frames)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default function ReportsTab() {
  // session จบแล้วได้รายงานใหม่ — โหลดรายการใหม่ตาม reportIds
  const reportIds = useYoloLive((s) => s.status.reportIds)
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    yoloService
      .listReports()
      .then((list) => {
        if (!alive) return
        setRows(list)
        setSelected((current) => (current && list.some((r) => r.id === current) ? current : list[0]?.id ?? null))
      })
      .catch((err: unknown) => alive && setError(errorText(err)))
    return () => {
      alive = false
    }
  }, [reportIds])

  useEffect(() => {
    if (!selected) return
    let alive = true
    yoloService
      .getReport(selected)
      .then((r) => alive && setReport(r))
      .catch((err: unknown) => alive && setError(errorText(err)))
    return () => {
      alive = false
    }
  }, [selected])

  return (
    <div className="dc-stack">
      {error && <p className="yc-error">{error}</p>}
      <div className="dc-card">
        <div className="dc-pad dc-card-head yc-flush-head">
          <h2 className="dc-h2">รายงานทั้งหมด</h2>
          <span className="dc-muted-12">{rows ? `${rows.length} รายการ · คลิกแถวเพื่อดูรายละเอียด` : 'กำลังโหลด...'}</span>
        </div>
        {rows && rows.length === 0 && <p className="dc-empty dc-empty-pad">ยังไม่มีรายงาน — จบ session ในหน้า Live แล้วรายงานจะมาที่นี่</p>}
        {rows && rows.length > 0 && (
          <div className="yc-table-scroll">
            <table className="dc-table">
              <thead>
                <tr><th>เริ่มเมื่อ</th><th>แหล่งภาพ</th><th>ชื่อ</th><th>เฟรม</th><th>ID ไม่ซ้ำ</th><th>พร้อมกันสูงสุด</th><th>state_accuracy</th><th>ผล</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`yc-row-link ${r.id === selected ? 'is-selected' : ''}`}
                    tabIndex={0}
                    aria-selected={r.id === selected}
                    onClick={() => setSelected(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(r.id)
                      }
                    }}
                  >
                    <td>{dateTime(r.started_at)}</td>
                    <td>{KIND_TEXT[r.source.kind]}</td>
                    <td>{r.source.label}</td>
                    <td>{r.frames.toLocaleString('th-TH')}</td>
                    <td>{r.summary.unique_people}</td>
                    <td>{r.summary.peak_people}</td>
                    <td className="dc-mono">{r.summary.state_accuracy?.toFixed(4) ?? '–'}</td>
                    <td>{OUTCOME_TEXT[r.outcome] ?? r.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selected && report?.id === selected && <ReportDetail report={report} />}
      {selected && report?.id !== selected && <p className="dc-muted-12">กำลังโหลดรายงาน...</p>}
    </div>
  )
}
