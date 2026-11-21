import { toBlob } from 'html-to-image'
import { useRef, useState } from 'react'
import { toast, useRemote } from './store'
import { SortTable, type Column } from './ui'
import { yoloService } from './yoloService'
import type { DailyPerson, DailyReport, RiskLevel, WellCategory } from './types'
import {
  addDays,
  CATEGORIES,
  CATEGORY_TEXT,
  clockTime,
  download,
  downloadCsv,
  formatSeconds,
  isoDay,
  LEVEL_CLASS,
  LEVEL_TEXT,
  personText,
} from './wellness'

const CATEGORY_COLOR: Record<WellCategory, string> = {
  posture: '#1F9E95',
  distance: '#2B96C2',
  break: '#D07A08',
  fatigue: '#8B6FD6',
  fall: '#DC3B3B',
}

const PERSON_COLUMNS: Column<DailyPerson>[] = [
  { id: 'label', header: 'บุคคล', sort: (p) => p.label, cell: (p) => p.label },
  {
    id: 'risk',
    header: 'ความเสี่ยง',
    sort: (p) => p.risk.score,
    cell: (p) => <span className={`yc-level ${LEVEL_CLASS[p.risk.level]}`}>{LEVEL_TEXT[p.risk.level]} {p.risk.score}</span>,
  },
  { id: 'present', header: 'อยู่หน้ากล้อง', sort: (p) => p.present_seconds, cell: (p) => formatSeconds(p.present_seconds) },
  { id: 'alerts', header: 'แจ้งเตือน', sort: (p) => p.alert_count, cell: (p) => p.alert_count },
  ...CATEGORIES.map((cat): Column<DailyPerson> => ({
    id: cat,
    header: CATEGORY_TEXT[cat],
    sort: (p) => p.by_category[cat],
    cell: (p) => p.by_category[cat],
  })),
]

function Tile({ value, label, danger }: { value: string; label: string; danger?: boolean }) {
  return (
    <div className="dc-stat yc-tile">
      <span className={`dc-stat-value ${danger ? 'yc-bad' : ''}`}>{value}</span>
      <span className="dc-muted-12">{label}</span>
    </div>
  )
}

function exportCsv(r: DailyReport) {
  downloadCsv(`daily_${r.date}.csv`, [
    ['บุคคล', 'กล้อง', 'อยู่หน้ากล้อง (นาที)', 'ความเสี่ยง', 'คะแนน', 'แจ้งเตือน', ...CATEGORIES.map((c) => CATEGORY_TEXT[c]), 'อาการที่ตรวจพบ'],
    ...r.people.map((p) => [
      p.label,
      p.cameras.join(' '),
      Math.round(p.present_seconds / 60),
      LEVEL_TEXT[p.risk.level],
      p.risk.score,
      p.alert_count,
      ...CATEGORIES.map((c) => p.by_category[c]),
      p.types.map((t) => `${t.text} ${t.count}`).join('; '),
    ]),
  ])
}

/** แท่งซ้อนตามหมวด 24 ชั่วโมง — ชี้แท่งเพื่อดูตัวเลขของชั่วโมงนั้น */
function HourlyChart({ hourly }: { hourly: DailyReport['hourly'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 220
  const pad = { left: 28, right: 6, top: 10, bottom: 24 }
  const totals = hourly.map((h) => CATEGORIES.reduce((n, c) => n + h[c], 0))
  const yMax = Math.max(1, ...totals)
  const slot = (W - pad.left - pad.right) / Math.max(1, hourly.length)
  const Y = (v: number) => H - pad.bottom - (v / yMax) * (H - pad.top - pad.bottom)
  const yTicks = [...new Set([0, Math.round(yMax / 2), yMax])]
  const shown = hover === null ? null : hourly[hover]
  return (
    <div>
      <svg className="yc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="จำนวนการแจ้งเตือนแต่ละชั่วโมง แยกตามหมวด" onPointerLeave={() => setHover(null)}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={Y(v)} y2={Y(v)} className="yc-chart-grid" />
            <text x={pad.left - 6} y={Y(v)} className="yc-chart-tick" textAnchor="end" dominantBaseline="middle">{v}</text>
          </g>
        ))}
        {hourly.map((h, i) => {
          let base = 0
          const x = pad.left + i * slot
          return (
            <g key={h.hour} onPointerEnter={() => setHover(i)}>
              <rect x={x} y={pad.top} width={slot} height={H - pad.top - pad.bottom} fill="transparent" />
              {CATEGORIES.map((c) => {
                if (!h[c]) return null
                const y0 = Y(base)
                base += h[c]
                return <rect key={c} x={x + slot * 0.15} width={slot * 0.7} y={Y(base)} height={y0 - Y(base)} fill={CATEGORY_COLOR[c]} />
              })}
              {i % 2 === 0 && (
                <text x={x + slot / 2} y={H - 6} className="yc-chart-tick" textAnchor="middle">{String(h.hour).padStart(2, '0')}</text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="yc-chart-legend">
        {shown ? (
          <span className="dc-mono">
            {String(shown.hour).padStart(2, '0')}:00 · {CATEGORIES.map((c) => `${CATEGORY_TEXT[c]} ${shown[c]}`).join(' · ')}
          </span>
        ) : (
          CATEGORIES.map((c) => (
            <span key={c}><i style={{ background: CATEGORY_COLOR[c] }} />{CATEGORY_TEXT[c]}</span>
          ))
        )}
      </div>
    </div>
  )
}

export default function DailyTab() {
  const [today] = useState(() => isoDay(new Date()))
  const [date, setDate] = useState(today)
  const [level, setLevel] = useState<RiskLevel | ''>('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const report = useRemote<DailyReport>(`daily:${date}`, () => yoloService.getDaily(date), 30000)
  const r = report.data
  const people = (r?.people ?? []).filter(
    (p) => (!level || p.risk.level === level) && (!search || p.label.toLowerCase().includes(search.toLowerCase())),
  )
  const dayText = new Date(`${date}T12:00:00`).toLocaleDateString('th-TH', { dateStyle: 'full' })

  return (
    <div className="dc-stack yc-daily">
      <div className="yc-toolbar">
        <span className="dc-muted-12">สรุปการอยู่หน้ากล้องและการแจ้งเตือนสุขภาพของ{dayText}</span>
        <div className="yc-push yc-row yc-tight yc-noprint">
          <button type="button" className="dc-btn" onClick={report.reload} disabled={report.fetching}>↻ รีเฟรช</button>
          <button type="button" className="dc-btn" disabled={!r} onClick={() => r && exportCsv(r)}>ส่งออก CSV</button>
          <button
            type="button"
            className="dc-btn"
            disabled={!r}
            onClick={() => r && download(`daily_${r.date}.json`, new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }))}
          >
            ส่งออก JSON
          </button>
          <button type="button" className="dc-btn yc-btn-primary" onClick={() => window.print()}>🖶 พิมพ์รายงาน</button>
        </div>
      </div>

      <div className="dc-card dc-pad yc-row yc-tight yc-noprint">
        <button type="button" className="dc-btn" onClick={() => setDate(addDays(date, -1))}>‹ วันก่อนหน้า</button>
        <input type="date" className="yc-input" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="วันที่" />
        <button type="button" className="dc-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today}>วันถัดไป ›</button>
        <button type="button" className="dc-btn yc-btn-primary yc-push" onClick={() => setDate(today)} disabled={date === today}>วันนี้</button>
      </div>

      {report.error && <p className="yc-error">{report.error}</p>}
      {r && (
        <>
          <div className="dc-statbar yc-tiles">
            <Tile value={`${r.totals.people} คน`} label={`บุคคลที่พบในวันนี้ (${r.totals.segments} ช่วง)`} />
            <Tile value={formatSeconds(r.totals.present_seconds)} label="เวลาอยู่หน้ากล้องรวม" />
            <Tile value={String(r.totals.alerts)} label="แจ้งเตือนทั้งหมด" danger={r.totals.alerts > 0} />
            {CATEGORIES.map((c) => (
              <Tile key={c} value={String(r.totals[c])} label={CATEGORY_TEXT[c]} danger={c === 'fall' && r.totals[c] > 0} />
            ))}
          </div>

          <div className="dc-card dc-pad yc-avoid-break">
            <div className="dc-card-head yc-wrap-head yc-flush-head">
              <div className="dc-col yc-grow-col">
                <h2 className="dc-h2">คัดกรองความเสี่ยง Office Syndrome (จากพฤติกรรมหน้ากล้อง)</h2>
                <span className="dc-muted-12">{r.formula} · {r.disclaimer}</span>
              </div>
              <div className="yc-row yc-tight yc-noprint">
                <button type="button" className={`dc-btn ${level === '' ? 'yc-btn-primary' : ''}`} onClick={() => setLevel('')}>
                  ทั้งหมด {r.people.length} คน
                </button>
                {(['high', 'medium', 'low'] as RiskLevel[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`dc-btn ${level === l ? `yc-level ${LEVEL_CLASS[l]}` : ''}`}
                    onClick={() => setLevel(level === l ? '' : l)}
                  >
                    เสี่ยง{LEVEL_TEXT[l]} {r.risk_counts[l]} คน
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="yc-daily-grid">
            <div className="dc-card dc-pad yc-avoid-break">
              <div className="dc-card-head"><h2 className="dc-h2">การแจ้งเตือนรายชั่วโมง (00:00–23:00)</h2></div>
              <HourlyChart hourly={r.hourly} />
            </div>
            <div className="dc-card dc-pad yc-avoid-break">
              <div className="dc-card-head"><h2 className="dc-h2">แยกตามประเภทการแจ้งเตือน</h2></div>
              {r.types.length === 0 && <p className="dc-empty">ไม่มีการแจ้งเตือน</p>}
              <div className="yc-bars">
                {r.types.map((t) => (
                  <div key={t.type} className="yc-bar">
                    <div className="yc-bar-head">
                      <span>{t.text}</span>
                      <span className="dc-mono dc-muted">{t.count} ครั้ง ({t.percent}%)</span>
                    </div>
                    <div className="yc-meter"><i style={{ width: `${t.percent}%`, background: CATEGORY_COLOR[t.category] }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dc-card dc-pad">
            <div className="dc-card-head yc-wrap-head">
              <h2 className="dc-h2">สรุปรายบุคคล ({people.length} คน)</h2>
              <div className="yc-row yc-tight yc-noprint">
                <input className="yc-input" placeholder="ค้นหาบุคคล..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหาบุคคล" />
                <div className="dc-segment" role="tablist" aria-label="รูปแบบการแสดง">
                  <button type="button" role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>แบบการ์ด</button>
                  <button type="button" role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>แบบตาราง</button>
                </div>
              </div>
            </div>
            {people.length === 0 ? (
              <p className="dc-empty dc-empty-pad">ไม่มีข้อมูลบุคคลในวันนี้</p>
            ) : view === 'cards' ? (
              <div className="yc-person-cards">
                {people.map((p) => (
                  <PersonReportCard key={p.key} person={p} date={r.date} />
                ))}
              </div>
            ) : (
              <SortTable rows={people} columns={PERSON_COLUMNS} rowKey={(p) => p.key} initialSort={{ id: 'risk', desc: true }} />
            )}
          </div>

          <div className="dc-card yc-avoid-break">
            <div className="dc-pad dc-card-head yc-flush-head"><h2 className="dc-h2">สรุปตามกล้อง ({r.cameras.length} ตัว)</h2></div>
            <div className="yc-table-scroll">
              <table className="dc-table">
                <thead>
                  <tr>
                    <th>กล้อง</th>
                    <th>จำนวนช่วงที่พบ</th>
                    <th>แจ้งเตือนรวม</th>
                    {CATEGORIES.map((c) => <th key={c}>{CATEGORY_TEXT[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.cameras.map((c) => (
                    <tr key={c.camera}>
                      <td>{c.camera}</td>
                      <td>{c.segments}</td>
                      <td>{c.alerts}</td>
                      {CATEGORIES.map((cat) => (
                        <td key={cat} className={cat === 'fall' && c[cat] ? 'yc-bad' : ''}>{c[cat]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** รูปคนมองด้านหน้า จุดที่ล้าเป็นสีแดง */
function BodyFigure({ regions }: { regions: string[] }) {
  const on = (r: string) => regions.includes(r) || regions.includes('whole')
  const fill = (r: string) => (on(r) ? '#ef4444' : 'currentColor')
  const opacity = (r: string) => (on(r) ? 0.9 : 0.18)
  return (
    <svg viewBox="0 0 80 150" className="yc-body" role="img" aria-label="จุดเฝ้าระวังหลัก">
      <circle cx="40" cy="16" r="12" fill="currentColor" opacity="0.18" />
      {on('eyes') && (
        <>
          <circle cx="35" cy="15" r="2.2" fill="#ef4444" />
          <circle cx="45" cy="15" r="2.2" fill="#ef4444" />
        </>
      )}
      <rect x="35" y="28" width="10" height="8" rx="2" fill={fill('neck')} opacity={opacity('neck')} />
      <path d="M22 38 Q40 33 58 38 L56 62 L24 62 Z" fill={fill('upper_back')} opacity={opacity('upper_back')} />
      <path d="M24 63 L56 63 L54 88 L26 88 Z" fill={fill('lower_back')} opacity={opacity('lower_back')} />
      <rect x="12" y="40" width="8" height="42" rx="4" fill="currentColor" opacity="0.18" />
      <rect x="60" y="40" width="8" height="42" rx="4" fill="currentColor" opacity="0.18" />
      <rect x="27" y="90" width="11" height="52" rx="5" fill={fill('legs')} opacity={opacity('legs')} />
      <rect x="42" y="90" width="11" height="52" rx="5" fill={fill('legs')} opacity={opacity('legs')} />
      {regions.includes('whole') && (
        <rect x="2" y="1" width="76" height="146" rx="8" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 3" />
      )}
    </svg>
  )
}

function PersonReportCard({ person: p, date }: { person: DailyPerson; date: string }) {
  const card = useRef<HTMLDivElement>(null)
  const options = () => ({
    pixelRatio: 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: (node: HTMLElement) => !node.dataset?.noexport,
  })
  const fileName = `${p.label}_${date}.png`.replace(/[\\/:*?"<>|]/g, '_')

  const savePng = async () => {
    if (!card.current) return
    const blob = await toBlob(card.current, options())
    if (blob) download(fileName, blob)
  }
  const copyImage = async () => {
    if (!card.current) return
    try {
      const blob = await toBlob(card.current, options())
      if (!blob) throw new Error('สร้างรูปไม่ได้')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('คัดลอกรูปแล้ว วางใน LINE หรือแชตได้เลย')
    } catch (e) {
      toast.error(`คัดลอกรูปไม่ได้: ${(e as Error).message}`)
    }
  }
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(personText(p, date))
      toast.success('คัดลอกข้อความแล้ว')
    } catch (e) {
      toast.error(`คัดลอกไม่ได้: ${(e as Error).message}`)
    }
  }

  return (
    <div ref={card} className={`yc-report-card yc-avoid-break ${p.fell ? 'is-fell' : ''}`}>
      <div className="yc-report-card-head">
        <div className="dc-col yc-grow-col">
          <strong className="yc-truncate">{p.label}</strong>
          <span className="dc-muted-12">
            {p.cameras.join(', ')} · {clockTime(p.first_at)}–{clockTime(p.last_at)} · อยู่หน้ากล้อง {formatSeconds(p.present_seconds)}
          </span>
        </div>
        <div className="dc-col yc-end-col">
          <span className={`yc-level ${LEVEL_CLASS[p.risk.level]}`}>{LEVEL_TEXT[p.risk.level]} · {p.risk.score}/100</span>
          {p.week && (
            <span className="dc-muted-12" title="จำนวนวันที่มีการแจ้งเตือน / วันที่พบใน 7 วัน">
              7 วัน: เตือน {p.week.days_alerted}/{p.week.days_seen} วัน
            </span>
          )}
          {!p.risk.enough && <span className="dc-muted-12">ข้อมูลน้อย (&lt;10 นาที)</span>}
        </div>
      </div>

      <div className="yc-report-card-body">
        <div className="yc-body-box">
          <BodyFigure regions={p.regions} />
          <span className="dc-muted-12">จุดเฝ้าระวังหลัก</span>
        </div>
        <div className="yc-grow-col">
          <span className="dc-w500">อาการที่ตรวจพบวันนี้</span>
          {p.types.length ? (
            <ul className="yc-symptoms">
              {p.types.map((t) => (
                <li key={t.type} className={t.category === 'fall' ? 'yc-bad' : ''}>
                  <span>■ {t.text}</span>
                  <span className="dc-mono">{t.count} ครั้ง</span>
                </li>
              ))}
              {p.longest_sit_minutes !== null && (
                <li className="dc-muted-12">นั่งต่อเนื่องนานสุด {Math.floor(p.longest_sit_minutes)} นาที</li>
              )}
            </ul>
          ) : (
            <p className="dc-muted-12 yc-tight-p">ไม่พบอาการผิดปกติวันนี้</p>
          )}
        </div>
      </div>

      <div className="yc-box">
        <span className="dc-w500">แนวโน้มอาการที่อาจเกิดขึ้นได้</span>
        {p.symptoms.length ? (
          <ul className="yc-bullets">{p.symptoms.map((s) => <li key={s}>{s}</li>)}</ul>
        ) : (
          <p className="dc-muted-12 yc-tight-p">ยังไม่พบแนวโน้มอาการจากพฤติกรรมวันนี้</p>
        )}
      </div>
      <div className="yc-box">
        <span className="dc-w500">แนวทางดูแล</span>
        <ul className="yc-bullets">{p.advice.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>

      <div className="yc-row yc-tight yc-noprint" data-noexport="1">
        <button type="button" className="dc-btn" onClick={() => void savePng()}>⤓ บันทึกรูป PNG</button>
        <button type="button" className="dc-btn" onClick={() => void copyImage()}>⧉ คัดลอกรูป</button>
        <button type="button" className="dc-btn" onClick={() => void copyText()}>คัดลอกข้อความ</button>
      </div>
    </div>
  )
}
