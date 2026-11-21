import { useMemo, useState } from 'react'
import { useRemote, useWellnessSettings } from '../yoloConsole/store'
import type { AlertRecord, LiveAlert, LivePerson } from '../yoloConsole/types'
import { useYoloLive } from '../yoloConsole/useYoloLive'
import { audioReady, CATEGORY_TEXT, isoDay, isTestMode, personName } from '../yoloConsole/wellness'
import { yoloService } from '../yoloConsole/yoloService'
import { fallMessage, setMuted, useAlertInbox } from './alertInbox'
import { useAutoStartCamera } from './browserCamera'
import FloorPlan from './FloorPlan'
import LiveCamera from './LiveCamera'
import { Glyph, LockGlyph, Mark, ZzMark } from './marks'
import { goTo, YOLO_PAGES } from './pages'
import {
  CHECK_MARK,
  CHECK_TEXT,
  checkNote,
  countLevel,
  isAlerting,
  personWhat,
  PHASES,
  roomPhase,
  roomStatus,
  rosterRows,
  todayCountOf,
  todayCounts,
  toRoomPeople,
  type RosterRow,
} from './roomPeople'
import { PrintedCheckbox } from './ui'
import { usePersistentState } from './usePersistentState'
import './yd-overview.css'

// ภาพรวม (/?yolo-dashboard): หน้าตาเดียวกับ /?dashboard — ผังห้องลายเส้นหมึกคู่กับตารางคนในห้อง
// แต่ทุกอย่างมาจาก yolo-backend แบบหน้าหลักของ /?yolo-console

const ROOM_TITLE = 'ห้องทำงานหลัก (MAIN OFFICE)'
const NO_PEOPLE: LivePerson[] = []
const NO_RECORDS: AlertRecord[] = []
const NO_ALERTS: LiveAlert[] = []
const DAY = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

function scrollToCameras() {
  window.requestAnimationFrame(() => document.getElementById('yd-cameras')?.scrollIntoView({ block: 'start' }))
}

function Roster({ rows, counts }: { rows: RosterRow[]; counts: ReadonlyMap<string, number> }) {
  return (
    <div className="yd-dash-roster">
      <table>
        <caption>คนในห้องนี้</caption>
        <thead className="yd-visually-hidden">
          <tr>
            <th scope="col">สถานะ</th>
            <th scope="col">ชื่อและอาการ</th>
            <th scope="col">แจ้งเตือนวันนี้</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'fall') {
              return (
                <tr key={`fall-${row.fall.alert.id}`} className="is-fall">
                  <td><Mark state="ring" label="ตรวจพบการล้ม" small /></td>
                  <th scope="row">
                    <span className="yd-dash-roster-name">ตรวจพบการล้ม</span>
                    <span className="yd-dash-roster-what">{fallMessage(row.fall.alert)}</span>
                  </th>
                  <td className="yd-hand yd-dash-roster-count is-many">ทันที</td>
                </tr>
              )
            }
            const p = row.person
            const alerting = isAlerting(p)
            const count = todayCountOf(p, counts)
            return (
              <tr key={p.id} className={alerting ? 'is-alert' : undefined}>
                <td>
                  <Mark state={alerting ? 'ring' : p.checks ? 'tick' : 'empty'} label={alerting ? 'มีอาการค้าง' : p.checks ? 'ปกติ' : 'ไม่ได้ตรวจ'} small />
                </td>
                <th scope="row">
                  <span className="yd-dash-roster-name">{p.label}</span>
                  <span className="yd-dash-roster-what">{personWhat(p)}</span>
                  {p.checks && (
                    <span className="yd-overview-checks">
                      {p.checks.map((c) => (
                        <span key={c.category} className="yd-overview-check" title={checkNote(c)}>
                          <Mark state={CHECK_MARK[c.check]} label="" small />
                          {CATEGORY_TEXT[c.category]}
                          <span className="yd-visually-hidden"> {CHECK_TEXT[c.check]}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </th>
                <td className={`yd-hand yd-dash-roster-count${count !== null && countLevel(count) === 'many' ? ' is-many' : ''}`}>
                  {count === null ? 'ยังไม่ระบุตัว' : `${count} ครั้ง`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="yd-dash-roster-empty">ยังไม่มีคนในห้องนี้</p>}
    </div>
  )
}

export default function OverviewPage() {
  const connected = useYoloLive((s) => s.connected)
  const state = useYoloLive((s) => s.status.state)
  const sourceLabel = useYoloLive((s) => s.status.source?.label ?? null)
  const panel = useYoloLive((s) => s.panel)
  const { falls, acked, muted } = useAlertInbox()
  const settings = useWellnessSettings()
  const [showCameras, setShowCameras] = usePersistentState('camwell:yolo-dashboard:show-cameras:v2', true)
  useAutoStartCamera(connected)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const today = isoDay(new Date())
  const alertLog = useRemote(`alerts:${today}:${today}`, () => yoloService.listAlerts(today, today), 15000)

  const phase = roomPhase(connected, state)
  const { badge, tone, active } = PHASES[phase]
  // session จบแล้วแผงสดยังค้างเฟรมสุดท้ายไว้ — ไม่ใช่คนที่อยู่ในห้องตอนนี้
  const snapshot = active ? panel : null
  const people = useMemo(() => toRoomPeople(snapshot?.people ?? NO_PEOPLE, acked), [snapshot, acked])
  const counts = useMemo(() => todayCounts(alertLog.data?.alerts ?? NO_RECORDS), [alertLog.data])
  const rows = rosterRows(falls, people)
  const status = roomStatus(falls.length, people)
  const fallen = falls.length > 0
  const breaks = (snapshot?.alerts ?? NO_ALERTS).filter((a) => a.category === 'break' && !dismissed.has(a.id))
  const stats = snapshot?.stats

  const openCameras = () => {
    setShowCameras(true)
    scrollToCameras()
  }

  return (
    <>
      <header className="yd-dash-head">
        <div className="yd-dash-head-title">
          <h1>ห้องที่กำลังตรวจสอบ</h1>
          {tone === 'live' ? (
            <span className="yd-dash-live">
              <span className="yd-dash-live-dot" aria-hidden="true" />
              {badge}
            </span>
          ) : (
            <span className={`yd-overview-badge${tone === 'alert' ? ' is-alert' : ''}`}>{badge}</span>
          )}
        </div>
        <div className="yd-dash-tally">
          <p className="yd-ruled"><span>พบในห้อง</span><span className="yd-hand">{people.length} คน</span></p>
          <p className="yd-ruled"><span>กล้อง</span><span className="yd-hand">{active ? 1 : 0} ตัว</span></p>
          <p className="yd-ruled"><span>วันที่</span><span className="yd-hand">{DAY.format(new Date())}</span></p>
        </div>
      </header>

      {phase === 'offline' && <p className="yd-callout is-warn">ไม่ได้เชื่อมต่อ yolo-backend — เปิดด้วย npm run dev:yolo ที่ root ของโปรเจกต์</p>}
      {phase === 'idle' && (
        <p className="yd-callout">
          ยังไม่ได้เปิดกล้อง เลือกแหล่งภาพในส่วน "ภาพจากกล้อง" ด้านล่างเพื่อเริ่มวิเคราะห์{' '}
          <button type="button" className="yd-linkbtn" onClick={scrollToCameras}>ไปเลือกแหล่งภาพ</button>
        </p>
      )}
      {isTestMode(settings.data) && (
        <p className="yd-callout is-warn">
          โหมดทดสอบ: เกณฑ์เวลาสั้นกว่าปกติ (นั่ง {String(settings.data?.sit_minutes)} นาที, ท่านั่ง {String(settings.data?.posture_seconds)} วินาที)
          คืนค่าเริ่มต้นได้ที่หน้า{YOLO_PAGES.camera}{' '}
          <button type="button" className="yd-linkbtn" onClick={() => goTo('camera')}>ไปที่{YOLO_PAGES.camera}</button>
        </p>
      )}

      <div className="yd-dash-controls">
        <div className="yd-dash-checks">
          <PrintedCheckbox checked={showCameras} onChange={setShowCameras}>แสดงภาพตัวอย่างกล้อง</PrintedCheckbox>
          <div className="yd-overview-sound">
            <PrintedCheckbox checked={!muted} onChange={(on) => setMuted(!on)}>เสียงเตือน</PrintedCheckbox>
            {!muted && !audioReady() && <span className="yd-fine">คลิกหน้าเว็บเพื่อเปิดเสียง</span>}
          </div>
        </div>
        <p className="yd-dash-legend" aria-label="ความหมายของเครื่องหมายบนผัง">
          <span><Mark state="ring" label="" small />เตือน (อาการค้างนาน)</span>
          <span><ZzMark />ความล้า</span>
          <span><span className="yd-plan-count is-some">3</span>แจ้งเตือนวันนี้</span>
          <span><span className="yd-plan-count is-many">12</span>เกิน 10 ครั้ง</span>
          <span>
            <svg className="yd-overview-swatch" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <rect className="yd-plan-chair yd-overview-chair is-occupied" x="3" y="3" width="18" height="18" />
            </svg>
            เก้าอี้มีคนนั่ง
          </span>
          <span>
            <svg className="yd-overview-swatch" width="29" height="22" viewBox="0 0 32 24" aria-hidden="true">
              <path className="yd-overview-trail" d="M3 16C10 16 13 8 20 8h9" />
            </svg>
            เส้นทางเดิน
          </span>
        </p>
      </div>

      <div className={`yd-dash-workspace yd-overview-workspace${showCameras && active ? ' is-split' : ''}`}>
        <section id="yd-room" className={`yd-dash-room${fallen ? ' is-fall' : ''}`} aria-labelledby="yd-room-title">
          <header className="yd-dash-room-head">
            <div className="yd-dash-room-heading">
              <h2 id="yd-room-title">{ROOM_TITLE}</h2>
              <p className={`yd-dash-room-status${status.alert ? ' is-alert' : ''}`}>
                <Mark state={status.mark} label="" small />
                {status.text}
              </p>
              {active && sourceLabel && <p className="yd-fine">แหล่งภาพ: {sourceLabel}</p>}
              {stats && (
                <p className="yd-fine">
                  นั่ง {stats.sitting} · ยืน {stats.standing} · เดิน {stats.walking} · เก้าอี้มีคนนั่ง {stats.chairsOccupied}/{stats.chairs}
                </p>
              )}
            </div>
            <button type="button" className={fallen ? 'yd-dash-open-live is-fall' : 'yd-secondary is-small'} onClick={openCameras}>
              {fallen ? 'เปิดภาพสดทันที' : 'ดูภาพสด'}
            </button>
          </header>
          <div className="yd-dash-room-body">
            <FloorPlan title={ROOM_TITLE} floor={snapshot?.floor ?? null} objects={snapshot?.objects ?? []} people={people} counts={counts} />
            <Roster rows={rows} counts={counts} />
          </div>
        </section>

        {(showCameras || !active) && <LiveCamera active={active} />}
      </div>

      <section className="yd-dash-notes" aria-label="การแจ้งเตือนและข้อมูลระบบ">
        {breaks.map((a) => (
          <article className="yd-dash-break" role="status" key={a.id}>
            <Glyph size={26}><circle cx="12" cy="13.5" r="7" /><path d="M12 10v3.5l2.5 2M10 3h4M12 3v3.5" /></Glyph>
            <div>
              <strong>ถึงเวลาพัก</strong>
              <p>{personName(a.name, a.person)} · {a.text}</p>
            </div>
            <button
              type="button"
              className="yd-dash-break-dismiss"
              onClick={() => setDismissed((s) => new Set(s).add(a.id))}
              aria-label="ปิดการแจ้งเตือนเวลาพัก"
              title="ปิด"
            >
              <Glyph><path d="M6 6l12 12M18 6 6 18" /></Glyph>
            </button>
          </article>
        ))}
        <aside className="yd-promise yd-dash-promise" aria-label="ความเป็นส่วนตัว">
          <LockGlyph />
          <p><strong>ความเป็นส่วนตัว:</strong> ระบบวิเคราะห์ภาพที่ yolo-backend บนเครื่องนี้ โดยไม่ส่งภาพหรือวิดีโอขึ้นคลาวด์</p>
        </aside>
      </section>
    </>
  )
}
