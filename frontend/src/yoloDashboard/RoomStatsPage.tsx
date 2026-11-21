import { useEffect, useState } from 'react'
import { useYoloLive } from '../yoloConsole/useYoloLive'
import { yoloService } from '../yoloConsole/yoloService'
import type { PersonState, Report, ReportPerson, ReportRow } from '../yoloConsole/types'
import { Phrases } from './marks'
import { goTo } from './pages'
import {
  axisTicks,
  clock,
  KIND_TEXT,
  OUTCOME_TEXT,
  PERSON_STATES,
  plotScale,
  sessionDateTime,
  sessionLength,
  share,
  STATE_TEXT,
  stateTotals,
  zoneTotals,
  type PlotBox,
} from './reportsFormat'
import { errorText } from './errorText'
import { LedgerCell, PageHead, SortTable, type Column } from './ui'
import './yd-reports.css'

// หมึกเดียว: สามท่าทางแยกด้วยลายเส้น ไม่ใช่สี
type LineStyle = 'solid' | 'dashed' | 'dotted'
const STATE_LINE: Record<PersonState, LineStyle> = { sitting: 'solid', standing: 'dashed', walking: 'dotted' }

const TIMELINE: PlotBox = { width: 640, height: 240, left: 36, right: 12, top: 12, bottom: 28 }

const PERSON_COLUMNS: Column<ReportPerson>[] = [
  { id: 'id', header: 'ID', sort: (p) => p.id, cell: (p) => `#${String(p.id).padStart(2, '0')}` },
  { id: 'first', header: 'เริ่มเห็น', sort: (p) => p.first_t, cell: (p) => clock(p.first_t) },
  { id: 'last', header: 'เห็นล่าสุด', sort: (p) => p.last_t, cell: (p) => clock(p.last_t) },
  { id: 'frames', header: 'เฟรม', sort: (p) => p.frames, cell: (p) => p.frames.toLocaleString('th-TH') },
  ...PERSON_STATES.map((state): Column<ReportPerson> => ({
    id: state,
    header: STATE_TEXT[state],
    sort: (p) => (p.frames ? p[state] / p.frames : 0),
    cell: (p) => share(p[state], p.frames),
  })),
]

function LineSample({ state }: { state: PersonState }) {
  return (
    <svg className="yd-reports-swatch is-line" viewBox="0 0 34 12" aria-hidden="true">
      <line x1="3" y1="6" x2="31" y2="6" className={`yd-reports-line is-${STATE_LINE[state]}`} />
    </svg>
  )
}

function TimelineChart({ timeline }: { timeline: Report['timeline'] }) {
  const tMax = Math.max(1, ...timeline.map((p) => p.t))
  const yMax = Math.max(1, ...timeline.map((p) => p.people))
  const { x, y } = plotScale(TIMELINE, tMax, yMax)
  return (
    <div className="yd-reports-chart-block">
      <div className="yd-reports-chart-wrap">
        <svg className="yd-reports-chart" viewBox={`0 0 ${TIMELINE.width} ${TIMELINE.height}`} role="img" aria-label="จำนวนคนที่นั่ง ยืน และเดิน ตลอดช่วงเวลาของรอบนี้">
          {axisTicks(yMax).map((v) => (
            <g key={v}>
              <line x1={TIMELINE.left} x2={TIMELINE.width - TIMELINE.right} y1={y(v)} y2={y(v)} className={v ? 'yd-reports-grid-line' : 'yd-reports-baseline'} />
              <text x={TIMELINE.left - 8} y={y(v)} className="yd-reports-tick" textAnchor="end" dominantBaseline="middle">{v}</text>
            </g>
          ))}
          {[0, tMax / 2, tMax].map((t) => (
            <text key={t} x={x(t)} y={TIMELINE.height - 8} className="yd-reports-tick" textAnchor="middle">{clock(t)}</text>
          ))}
          {PERSON_STATES.map((state) => (
            <polyline
              key={state}
              className={`yd-reports-line is-${STATE_LINE[state]}`}
              points={timeline.map((p) => `${x(p.t)},${y(p[state])}`).join(' ')}
            />
          ))}
        </svg>
      </div>
      <ul className="yd-reports-legend" aria-label="ลายเส้นของแต่ละท่าทาง">
        {PERSON_STATES.map((state) => (
          <li key={state}>
            <LineSample state={state} />
            {STATE_TEXT[state]}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Bars({ items }: { items: [string, number][] }) {
  if (!items.length) return <p className="yd-fine">ไม่มีข้อมูล</p>
  const max = Math.max(1, ...items.map(([, v]) => v))
  return (
    <ul className="yd-reports-bars">
      {items.map(([name, seconds]) => (
        <li key={name}>
          <div className="yd-reports-bar-head">
            <span>{name}</span>
            <span className="yd-reports-num">{clock(seconds)}</span>
          </div>
          <div className="yd-meter" aria-hidden="true">
            <i style={{ width: `${(seconds / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function SessionDetail({ report }: { report: Report }) {
  const { summary } = report
  return (
    <>
      <section className="yd-reports-detail" aria-label="รายละเอียดของรอบที่เลือก">
        <header className="yd-reports-detail-head">
          <div>
            <h2>{report.source.label}</h2>
            <p className="yd-fine">
              {KIND_TEXT[report.source.kind]} · เริ่ม {sessionDateTime(report.started_at)} · ยาว {clock(sessionLength(report))} ·{' '}
              {report.frames.toLocaleString('th-TH')} เฟรม
            </p>
          </div>
          {report.has_csv && (
            <a className="yd-btn-line is-small" href={yoloService.csvUrl(report.id)} download>
              ดาวน์โหลด tracks.csv
            </a>
          )}
        </header>
        <div className="yd-ledger">
          <LedgerCell value={summary.unique_people} label="จำนวนคน (ID ไม่ซ้ำ)" />
          <LedgerCell value={summary.peak_people} label="พร้อมกันสูงสุด" />
          <LedgerCell value={summary.max_walking_speed_mps.toFixed(2)} label="เดินเร็วสุด (m/s)" />
        </div>
      </section>

      <div className="yd-reports-room-grid">
        <section className="yd-panel">
          <div className="yd-panel-head">
            <h2>จำนวนคนตามท่าทาง ตลอดช่วงเวลา</h2>
          </div>
          <div className="yd-panel-body">
            <TimelineChart timeline={report.timeline} />
          </div>
        </section>
        <section className="yd-panel">
          <div className="yd-panel-head">
            <h2>เวลารวมตามท่าทาง</h2>
            <span className="yd-fine">รวมทุกคน · นาที:วินาที</span>
          </div>
          <div className="yd-panel-body">
            <Bars items={stateTotals(summary).map(([state, seconds]) => [STATE_TEXT[state], seconds])} />
          </div>
        </section>
        <section className="yd-panel">
          <div className="yd-panel-head">
            <h2>เวลารวมตามโซน</h2>
            <span className="yd-fine">รวมทุกคน · นาที:วินาที</span>
          </div>
          <div className="yd-panel-body">
            <Bars items={zoneTotals(summary)} />
          </div>
        </section>
      </div>

      <section className="yd-panel">
        <div className="yd-panel-head">
          <h2>รายคน</h2>
          <span className="yd-fine">{report.people.length} คน · เวลานับจากเริ่มรอบ · ท่าทางเป็นสัดส่วนของเฟรมที่เห็นคนนั้น</span>
        </div>
        {report.people.length === 0 ? (
          <p className="yd-empty">ไม่พบคนในรอบนี้</p>
        ) : (
          <SortTable rows={report.people} columns={PERSON_COLUMNS} rowKey={(p) => String(p.id)} initialSort={{ id: 'id', desc: false }} caption="รายคน" />
        )}
      </section>
    </>
  )
}

export default function RoomStatsPage() {
  // รอบที่จบใหม่จะได้รายงานใหม่ — โหลดรายการใหม่เมื่อ reportIds ใน WebSocket เปลี่ยน
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
        setError(null)
        setSelected((current) => (current && list.some((r) => r.id === current) ? current : (list[0]?.id ?? null)))
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
    <>
      <PageHead
        title="สถิติการใช้ห้อง"
        lead={<Phrases text="สรุปของแต่ละรอบที่กล้องวิเคราะห์จบแล้ว: จำนวนคน ช่วงที่คนเยอะที่สุด เวลาที่ใช้ในแต่ละท่าทางและแต่ละโซน" />}
      />
      {error && <p className="yd-error">{error}</p>}

      <section className="yd-panel">
        <div className="yd-panel-head">
          <h2>รอบการวิเคราะห์ทั้งหมด</h2>
          <span className="yd-fine">{rows ? `${rows.length} รายการ · คลิกแถวเพื่อดูรายละเอียด` : 'กำลังโหลด...'}</span>
        </div>
        {rows?.length === 0 && (
          <p className="yd-empty">
            ยังไม่มีรายงาน — กดจบการวิเคราะห์ที่
            <button type="button" className="yd-linkbtn" onClick={() => goTo('overview')}>หน้าภาพรวม</button>
            {' '}แล้วรายงานจะมาที่นี่
          </p>
        )}
        {rows && rows.length > 0 && (
          <div className="yd-table-wrap yd-reports-pick-wrap">
            <table className="yd-table yd-reports-pick">
              <caption className="yd-visually-hidden">รอบการวิเคราะห์ทั้งหมด เลือกแถวเพื่อดูรายละเอียดด้านล่าง</caption>
              <thead>
                <tr>
                  <th scope="col">เริ่มเมื่อ</th>
                  <th scope="col">แหล่งภาพ</th>
                  <th scope="col">ชื่อ</th>
                  <th scope="col">ความยาว</th>
                  <th scope="col">จำนวนคน (ID ไม่ซ้ำ)</th>
                  <th scope="col">พร้อมกันสูงสุด</th>
                  <th scope="col">ผล</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={r.id === selected ? 'is-selected' : undefined}
                    tabIndex={0}
                    aria-current={r.id === selected ? 'true' : undefined}
                    onClick={() => setSelected(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(r.id)
                      }
                    }}
                  >
                    <td>{sessionDateTime(r.started_at)}</td>
                    <td>{KIND_TEXT[r.source.kind]}</td>
                    <td>{r.source.label}</td>
                    <td>{clock(sessionLength(r))}</td>
                    <td>{r.summary.unique_people}</td>
                    <td>{r.summary.peak_people}</td>
                    <td className={r.outcome === 'error' ? 'yd-reports-bad' : undefined}>{OUTCOME_TEXT[r.outcome] ?? r.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && report?.id === selected && <SessionDetail report={report} />}
      {selected && report?.id !== selected && <p className="yd-fine">กำลังโหลดรายงาน...</p>}
    </>
  )
}
