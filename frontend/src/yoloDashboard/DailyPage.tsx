import { toBlob } from 'html-to-image'
import { useRef, useState, type ReactElement } from 'react'
import { toast, useRemote } from '../yoloConsole/store'
import { yoloService } from '../yoloConsole/yoloService'
import type { DailyPerson, DailyReport, RiskLevel, WellCategory } from '../yoloConsole/types'
import {
  addDays,
  CATEGORIES,
  CATEGORY_TEXT,
  clockTime,
  download,
  downloadCsv,
  formatSeconds,
  isoDay,
  LEVEL_TEXT,
  personText,
} from '../yoloConsole/wellness'
import {
  axisTicks,
  cardFileName,
  dailyCsv,
  filterPeople,
  hourText,
  plotScale,
  regionsText,
  RISK_LEVELS,
  stackHours,
  type PlotBox,
} from './reportsFormat'
import { errorText } from './errorText'
import { LedgerCell, PageHead, Segment, SortTable, type Column } from './ui'
import { usePersistentState } from './usePersistentState'
import './yd-reports.css'

// หมึกเดียว: แยกหมวดในกราฟด้วยลายพิมพ์ (DESIGN.md: Print Pattern Rule) แดงตรายางเฉพาะการล้ม
type PrintFill = 'solid' | 'hatch' | 'dots' | 'outline' | 'stamp'
const CATEGORY_FILL: Record<WellCategory, PrintFill> = {
  posture: 'solid',
  fatigue: 'hatch',
  distance: 'dots',
  break: 'outline',
  fall: 'stamp',
}
// ลายเส้นและลายจุดเป็น <pattern> ในกราฟรายชั่วโมง ตัวอย่างในคำอธิบายกราฟอ้าง id เดียวกัน
const PATTERN_URL: Partial<Record<PrintFill, string>> = {
  hatch: 'url(#yd-reports-hatch)',
  dots: 'url(#yd-reports-dots)',
}

type PeopleView = 'cards' | 'table'
const VIEW_OPTIONS = [['cards', 'แบบการ์ด'], ['table', 'แบบตาราง']] as const
const isPeopleView = (value: unknown): value is PeopleView => value === 'cards' || value === 'table'

const HOURLY: PlotBox = { width: 640, height: 240, left: 34, right: 8, top: 12, bottom: 28 }

const PERSON_COLUMNS: Column<DailyPerson>[] = [
  { id: 'label', header: 'บุคคล', sort: (p) => p.label, cell: (p) => <span className="yd-reports-name">{p.label}</span> },
  {
    id: 'risk',
    header: 'ความเสี่ยง',
    sort: (p) => p.risk.score,
    cell: (p) => <span className={`yd-level is-${p.risk.level}`}>{LEVEL_TEXT[p.risk.level]} {p.risk.score}</span>,
  },
  { id: 'present', header: 'อยู่หน้ากล้อง', sort: (p) => p.present_seconds, cell: (p) => formatSeconds(p.present_seconds) },
  { id: 'alerts', header: 'แจ้งเตือน', sort: (p) => p.alert_count, cell: (p) => p.alert_count },
  ...CATEGORIES.map((c): Column<DailyPerson> => ({
    id: c,
    header: CATEGORY_TEXT[c],
    sort: (p) => p.by_category[c],
    cell: (p) => p.by_category[c],
  })),
]

type CameraRow = DailyReport['cameras'][number]

const CAMERA_COLUMNS: Column<CameraRow>[] = [
  { id: 'camera', header: 'กล้อง', sort: (c) => c.camera, cell: (c) => c.camera },
  { id: 'segments', header: 'จำนวนช่วงที่พบ', sort: (c) => c.segments, cell: (c) => c.segments },
  { id: 'alerts', header: 'แจ้งเตือนรวม', sort: (c) => c.alerts, cell: (c) => c.alerts },
  ...CATEGORIES.map((cat): Column<CameraRow> => ({
    id: cat,
    header: CATEGORY_TEXT[cat],
    sort: (c) => c[cat],
    cell: (c) => <span className={cat === 'fall' && c[cat] > 0 ? 'yd-reports-bad' : undefined}>{c[cat]}</span>,
  })),
]

function Swatch({ category }: { category: WellCategory }) {
  const fill = CATEGORY_FILL[category]
  return (
    <svg className="yd-reports-swatch" viewBox="0 0 18 14" aria-hidden="true">
      <rect x="0.75" y="0.75" width="16.5" height="12.5" className={`yd-reports-seg is-${fill}`} fill={PATTERN_URL[fill]} />
    </svg>
  )
}

/** แท่งซ้อนตามหมวด 24 ชั่วโมง — ชี้ที่แท่งเพื่ออ่านตัวเลขของชั่วโมงนั้น */
function HourlyChart({ hourly }: { hourly: DailyReport['hourly'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const { max, bars } = stackHours(hourly)
  const { x, y } = plotScale(HOURLY, bars.length, max)
  const slot = x(1) - x(0)
  return (
    <div className="yd-reports-chart-block">
      <div className="yd-reports-chart-wrap">
        <svg
          className="yd-reports-chart"
          viewBox={`0 0 ${HOURLY.width} ${HOURLY.height}`}
          role="img"
          aria-label="จำนวนการแจ้งเตือนแต่ละชั่วโมง แยกตามหมวด"
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="yd-reports-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" className="yd-reports-pattern-ground" />
              <line x1="2.5" y1="0" x2="2.5" y2="5" className="yd-reports-pattern-ink" />
            </pattern>
            <pattern id="yd-reports-dots" width="5" height="5" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" className="yd-reports-pattern-ground" />
              <circle cx="2.5" cy="2.5" r="1.2" className="yd-reports-pattern-dot" />
            </pattern>
          </defs>
          {axisTicks(max).map((v) => (
            <g key={v}>
              <line x1={HOURLY.left} x2={HOURLY.width - HOURLY.right} y1={y(v)} y2={y(v)} className={v ? 'yd-reports-grid-line' : 'yd-reports-baseline'} />
              <text x={HOURLY.left - 8} y={y(v)} className="yd-reports-tick" textAnchor="end" dominantBaseline="middle">{v}</text>
            </g>
          ))}
          {bars.map((bar, i) => (
            <g key={bar.hour} onPointerEnter={() => setHover(i)}>
              <rect
                x={x(i)}
                y={HOURLY.top}
                width={slot}
                height={y(0) - HOURLY.top}
                className={`yd-reports-hit${hover === i ? ' is-on' : ''}`}
              />
              {bar.segments.map((s) => {
                const fill = CATEGORY_FILL[s.category]
                return (
                  <rect
                    key={s.category}
                    x={x(i) + slot * 0.15}
                    width={slot * 0.7}
                    y={y(s.to)}
                    height={y(s.from) - y(s.to)}
                    className={`yd-reports-seg is-${fill}`}
                    fill={PATTERN_URL[fill]}
                  />
                )
              })}
              {i % 2 === 0 && (
                <text x={x(i) + slot / 2} y={HOURLY.height - 8} className="yd-reports-tick" textAnchor="middle">
                  {String(bar.hour).padStart(2, '0')}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <ul className="yd-reports-legend" aria-label="ลายของแต่ละหมวด">
        {CATEGORIES.map((c) => (
          <li key={c}>
            <Swatch category={c} />
            {CATEGORY_TEXT[c]}
          </li>
        ))}
      </ul>
      <p className="yd-fine yd-reports-readout yd-noprint">
        {hover === null ? 'ชี้ที่แท่งเพื่อดูตัวเลขของชั่วโมงนั้น' : hourText(hourly[hover])}
      </p>
    </div>
  )
}

// ส่วนของรูปคน: region = ชื่อจุดจาก yolo-backend (app/daily.py) ที่ทำให้ส่วนนั้นเป็นสีแดง null = วาดเป็นเส้นเสมอ
const BODY_PARTS: { key: string; region: string | null; shape: ReactElement }[] = [
  { key: 'head', region: null, shape: <circle cx="40" cy="16" r="12" /> },
  { key: 'neck', region: 'neck', shape: <rect x="35" y="28" width="10" height="8" rx="2" /> },
  { key: 'upper', region: 'upper_back', shape: <path d="M22 38 Q40 33 58 38 L56 62 L24 62 Z" /> },
  { key: 'lower', region: 'lower_back', shape: <path d="M24 63 L56 63 L54 88 L26 88 Z" /> },
  { key: 'arm-l', region: null, shape: <rect x="12" y="40" width="8" height="42" rx="4" /> },
  { key: 'arm-r', region: null, shape: <rect x="60" y="40" width="8" height="42" rx="4" /> },
  { key: 'leg-l', region: 'legs', shape: <rect x="27" y="90" width="11" height="52" rx="5" /> },
  { key: 'leg-r', region: 'legs', shape: <rect x="42" y="90" width="11" height="52" rx="5" /> },
]

/**
 * รูปคนมองด้านหน้า: จุดที่เฝ้าระวังเป็นแดงตรายาง ส่วนอื่นเป็นเส้นหมึก
 * วาดสองชั้น (เส้นหมึก / จุดแดง) ด้วย currentColor ของ svg แต่ละชั้น เพราะ html-to-image คัดลอกสไตล์ให้แค่ svg ราก
 * ไม่พา CSS ของรูปข้างในไปด้วย รูป PNG ที่บันทึกจึงได้สีเดียวกับบนจอ
 */
function BodyFigure({ regions }: { regions: string[] }) {
  const whole = regions.includes('whole')
  const on = (region: string | null) => region !== null && (whole || regions.includes(region))
  return (
    <span className="yd-reports-body" role="img" aria-label={`จุดเฝ้าระวังหลัก: ${regionsText(regions)}`}>
      <svg viewBox="0 0 80 150" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {BODY_PARTS.map((p) => <g key={p.key}>{p.shape}</g>)}
      </svg>
      <svg viewBox="0 0 80 150" className="yd-reports-body-on" fill="currentColor" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {BODY_PARTS.filter((p) => on(p.region)).map((p) => <g key={p.key}>{p.shape}</g>)}
        {(whole || regions.includes('eyes')) && (
          <>
            <circle cx="35" cy="15" r="2.4" />
            <circle cx="45" cy="15" r="2.4" />
          </>
        )}
        {whole && <rect x="2" y="1" width="76" height="146" rx="8" fill="none" strokeWidth="2" strokeDasharray="4 3" />}
      </svg>
    </span>
  )
}

function PersonReportCard({ person: p, date }: { person: DailyPerson; date: string }) {
  const card = useRef<HTMLElement>(null)

  const capture = async () => {
    const node = card.current
    if (!node) throw new Error('ไม่พบการ์ด')
    const blob = await toBlob(node, {
      pixelRatio: 2,
      // พื้นรูปเป็นสีกระดาษของธีมที่เปิดอยู่ (กระดาษอยู่ที่ .yd ไม่ใช่ body)
      backgroundColor: getComputedStyle(node).getPropertyValue('--yd-paper').trim(),
      filter: (n: HTMLElement) => !n.dataset?.noexport,
    })
    if (!blob) throw new Error('สร้างรูปไม่ได้')
    return blob
  }
  const savePng = async () => {
    try {
      download(cardFileName(p.label, date), await capture())
    } catch (e) {
      toast.error(`บันทึกรูปไม่ได้: ${errorText(e)}`)
    }
  }
  const copyImage = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await capture() })])
      toast.success('คัดลอกรูปแล้ว วางใน LINE หรือแชตได้เลย')
    } catch (e) {
      toast.error(`คัดลอกรูปไม่ได้: ${errorText(e)}`)
    }
  }
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(personText(p, date))
      toast.success('คัดลอกข้อความแล้ว')
    } catch (e) {
      toast.error(`คัดลอกไม่ได้: ${errorText(e)}`)
    }
  }

  return (
    <article ref={card} className={`yd-reports-card is-${p.risk.level}${p.fell ? ' is-fell' : ''}`}>
      <header className="yd-reports-card-head">
        <div className="yd-reports-card-who">
          <h3>{p.label}</h3>
          <p className="yd-fine">
            <span className="yd-ph">{p.cameras.join(', ')}</span>{' '}· <span className="yd-ph">{clockTime(p.first_at)}–{clockTime(p.last_at)}</span>
            {' '}· <span className="yd-ph">อยู่หน้ากล้อง {formatSeconds(p.present_seconds)}</span>
          </p>
        </div>
        <div className="yd-reports-card-risk">
          <span className={`yd-level is-${p.risk.level}`}>{LEVEL_TEXT[p.risk.level]} · {p.risk.score}/100</span>
          {p.week && (
            <span className="yd-fine" title="จำนวนวันที่มีการแจ้งเตือน / วันที่พบใน 7 วัน">
              7 วัน: เตือน {p.week.days_alerted}/{p.week.days_seen} วัน
            </span>
          )}
          {!p.risk.enough && <span className="yd-fine">ข้อมูลน้อย (&lt;10 นาที)</span>}
        </div>
      </header>

      <div className="yd-reports-card-body">
        <figure className="yd-reports-figure">
          <BodyFigure regions={p.regions} />
          <figcaption>จุดเฝ้าระวังหลัก</figcaption>
        </figure>
        <div className="yd-reports-card-found">
          <h4>อาการที่ตรวจพบวันนี้</h4>
          {p.types.length ? (
            <ul className="yd-reports-symptoms">
              {p.types.map((t) => (
                <li key={t.type} className={t.category === 'fall' ? 'is-fall' : undefined}>
                  <span>{t.text}</span>
                  <span className="yd-reports-num">{t.count} ครั้ง</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="yd-fine">ไม่พบอาการผิดปกติวันนี้</p>
          )}
          {p.longest_sit_minutes !== null && (
            <p className="yd-fine">นั่งต่อเนื่องนานสุด {Math.floor(p.longest_sit_minutes)} นาที</p>
          )}
        </div>
      </div>

      <section className="yd-reports-box">
        <h4>แนวโน้มอาการที่อาจเกิดขึ้นได้</h4>
        {p.symptoms.length ? (
          <ul className="yd-reports-bullets">{p.symptoms.map((s) => <li key={s}>{s}</li>)}</ul>
        ) : (
          <p className="yd-fine">ยังไม่พบแนวโน้มอาการจากพฤติกรรมวันนี้</p>
        )}
      </section>
      <section className="yd-reports-box">
        <h4>แนวทางดูแล</h4>
        <ul className="yd-reports-bullets">{p.advice.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>

      <div className="yd-reports-card-actions yd-noprint" data-noexport="1">
        <button type="button" className="yd-btn-line is-small" onClick={() => void savePng()}>บันทึกรูป PNG</button>
        <button type="button" className="yd-btn-line is-small" onClick={() => void copyImage()}>คัดลอกรูป</button>
        <button type="button" className="yd-btn-line is-small" onClick={() => void copyText()}>คัดลอกข้อความ</button>
      </div>
    </article>
  )
}

export default function DailyPage() {
  const [today] = useState(() => isoDay(new Date()))
  const [date, setDate] = useState(today)
  const [level, setLevel] = useState<RiskLevel | ''>('')
  const [search, setSearch] = useState('')
  const [view, setView] = usePersistentState<PeopleView>('camwell:yolo-dashboard:report-view:v1', 'cards', isPeopleView)
  const report = useRemote<DailyReport>(`daily:${date}`, () => yoloService.getDaily(date), 30000)
  const r = report.data
  const people = r ? filterPeople(r.people, level, search) : []
  const dayText = new Date(`${date}T12:00:00`).toLocaleDateString('th-TH', { dateStyle: 'full' })

  const exportJson = (data: DailyReport) =>
    download(`daily_${data.date}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))

  return (
    <>
      <PageHead title="รายงานประจำวัน" lead={`สรุปการอยู่หน้ากล้องและการแจ้งเตือนสุขภาพของ${dayText}`}>
        <button type="button" className="yd-btn-line yd-noprint" onClick={report.reload} disabled={report.fetching}>
          รีเฟรช
        </button>
        <button type="button" className="yd-btn-line yd-noprint" disabled={!r} onClick={() => r && downloadCsv(`daily_${r.date}.csv`, dailyCsv(r))}>
          ส่งออก CSV
        </button>
        <button type="button" className="yd-btn-line yd-noprint" disabled={!r} onClick={() => r && exportJson(r)}>
          ส่งออก JSON
        </button>
        <button type="button" className="yd-btn yd-noprint" disabled={!r} onClick={() => window.print()}>
          พิมพ์รายงาน
        </button>
      </PageHead>

      <div className="yd-reports-datebar yd-noprint" role="group" aria-label="เลือกวันที่รายงาน">
        <button type="button" className="yd-btn-line" onClick={() => setDate(addDays(date, -1))}>‹ วันก่อนหน้า</button>
        <input
          type="date"
          className="yd-input"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="วันที่"
        />
        <button type="button" className="yd-btn-line" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>
          วันถัดไป ›
        </button>
        <button type="button" className="yd-btn-line yd-reports-today" onClick={() => setDate(today)} disabled={date === today}>
          วันนี้
        </button>
      </div>

      {report.error && <p className="yd-error">{report.error}</p>}
      {report.loading && <p className="yd-fine">กำลังโหลดรายงาน...</p>}
      {r && (
        <>
          <div className="yd-ledger">
            <LedgerCell value={`${r.totals.people} คน`} label={`บุคคลที่พบในวันนี้ (${r.totals.segments} ช่วง)`} />
            <LedgerCell value={formatSeconds(r.totals.present_seconds)} label="เวลาอยู่หน้ากล้องรวม" />
            <LedgerCell value={r.totals.alerts} label="แจ้งเตือนทั้งหมด" />
            {CATEGORIES.map((c) => (
              <LedgerCell key={c} value={r.totals[c]} label={CATEGORY_TEXT[c]} alert={c === 'fall' && r.totals[c] > 0} />
            ))}
          </div>

          <section className="yd-panel yd-reports-keep">
            <div className="yd-panel-head">
              <h2>คัดกรองความเสี่ยง Office Syndrome (จากพฤติกรรมหน้ากล้อง)</h2>
            </div>
            <div className="yd-panel-body">
              <p className="yd-fine">{r.formula} · {r.disclaimer}</p>
              <div className="yd-reports-levels yd-noprint" role="group" aria-label="กรองตามระดับความเสี่ยง">
                <button type="button" className="yd-btn-line is-small" aria-pressed={level === ''} onClick={() => setLevel('')}>
                  ทั้งหมด {r.people.length} คน
                </button>
                {RISK_LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`yd-btn-line is-small yd-reports-level is-${l}`}
                    aria-pressed={level === l}
                    onClick={() => setLevel(level === l ? '' : l)}
                  >
                    เสี่ยง{LEVEL_TEXT[l]} {r.risk_counts[l]} คน
                  </button>
                ))}
              </div>
              <p className="yd-reports-print-only">
                {RISK_LEVELS.map((l) => `เสี่ยง${LEVEL_TEXT[l]} ${r.risk_counts[l]} คน`).join(' · ')}
              </p>
            </div>
          </section>

          <div className="yd-reports-grid">
            <section className="yd-panel yd-reports-keep">
              <div className="yd-panel-head">
                <h2>การแจ้งเตือนรายชั่วโมง (00:00–23:00)</h2>
              </div>
              <div className="yd-panel-body">
                <HourlyChart hourly={r.hourly} />
              </div>
            </section>
            <section className="yd-panel yd-reports-keep">
              <div className="yd-panel-head">
                <h2>แยกตามประเภทการแจ้งเตือน</h2>
              </div>
              <div className="yd-panel-body">
                {r.types.length === 0 ? (
                  <p className="yd-fine">ไม่มีการแจ้งเตือน</p>
                ) : (
                  <ul className="yd-reports-bars">
                    {r.types.map((t) => (
                      <li key={t.type}>
                        <div className="yd-reports-bar-head">
                          <span>{t.text}</span>
                          <span className="yd-reports-num">{t.count} ครั้ง ({t.percent}%)</span>
                        </div>
                        <div className={`yd-meter${t.category === 'fall' ? ' is-alert' : ''}`} aria-hidden="true">
                          <i style={{ width: `${t.percent}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <section className="yd-panel">
            <div className="yd-panel-head">
              <h2>สรุปรายบุคคล ({people.length} คน)</h2>
            </div>
            <div className="yd-toolbar yd-noprint">
              <input
                type="search"
                className="yd-input"
                placeholder="ค้นหาบุคคล..."
                aria-label="ค้นหาบุคคล"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Segment options={VIEW_OPTIONS} value={view} onChange={setView} label="รูปแบบการแสดง" />
            </div>
            {people.length === 0 ? (
              <p className="yd-empty">
                {r.people.length === 0 ? 'ไม่มีข้อมูลบุคคลในวันนี้' : 'ไม่พบบุคคลที่ตรงกับคำค้นหรือระดับที่เลือก'}
              </p>
            ) : view === 'cards' ? (
              <div className="yd-reports-cards">
                {people.map((p) => (
                  <PersonReportCard key={p.key} person={p} date={r.date} />
                ))}
              </div>
            ) : (
              <SortTable
                rows={people}
                columns={PERSON_COLUMNS}
                rowKey={(p) => p.key}
                initialSort={{ id: 'risk', desc: true }}
                rowClass={(p) => (p.fell ? 'is-fall' : undefined)}
                caption="สรุปรายบุคคล"
              />
            )}
          </section>

          <section className="yd-panel yd-reports-keep">
            <div className="yd-panel-head">
              <h2>สรุปตามกล้อง ({r.cameras.length} ตัว)</h2>
            </div>
            {r.cameras.length === 0 ? (
              <p className="yd-empty">ไม่มีข้อมูลกล้องในวันนี้</p>
            ) : (
              <SortTable rows={r.cameras} columns={CAMERA_COLUMNS} rowKey={(c) => c.camera} initialSort={{ id: 'alerts', desc: true }} caption="สรุปตามกล้อง" />
            )}
          </section>
        </>
      )}
    </>
  )
}
