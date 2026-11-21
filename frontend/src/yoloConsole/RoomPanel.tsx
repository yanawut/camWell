import { useEffect, useRef, useState } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { useWellnessSettings } from './store'
import { useYoloLive } from './useYoloLive'
import type { LiveAlert, LivePerson, WellCheck, WellnessSettings } from './types'
import { alarm, audioReady, CATEGORIES, CATEGORY_TEXT, chime, isTestMode, liveDuration, personName, unlockAudio } from './wellness'

const STATE_TEXT: Record<string, string> = { sitting: 'นั่ง', standing: 'ยืน', walking: 'เดิน' }
const POSTURE_TEXT: Record<string, string> = { neck: 'ก้มคอ/ยื่นคอ', hunch: 'หลังค่อม', lean: 'นั่งเอียง' }
const CHECK_MARK: Record<WellCheck, string> = { alert: '!', ok: '✓', na: '–', off: '–' }
const ALARM_REPEAT_MS = 5000
const NO_ALERTS: LiveAlert[] = []
const NO_PEOPLE: LivePerson[] = []


/** เสียงเมื่อมีการเตือนใหม่: เสียงสั้นสองโน้ต หรือถ้าเป็นการล้ม เสียงเตือนดังซ้ำจนกว่าจะกดรับทราบ */
function useAlertSounds(alerts: LiveAlert[], acked: Set<string>, muted: boolean) {
  const seen = useRef(new Set<string>())
  useEffect(() => {
    let fall = false
    let other = false
    for (const a of alerts) {
      if (seen.current.has(a.id)) continue
      seen.current.add(a.id)
      if (a.category === 'fall') fall = true
      else other = true
    }
    if (muted) return
    if (fall) alarm()
    else if (other) chime()
  }, [alerts, muted])

  const urgent = !muted && alerts.some((a) => a.category === 'fall' && !acked.has(a.id))
  useEffect(() => {
    if (!urgent) return
    const timer = setInterval(alarm, ALARM_REPEAT_MS)
    return () => clearInterval(timer)
  }, [urgent])
}

export function RoomPanel() {
  const alerts = useYoloLive((s) => s.panel?.alerts ?? NO_ALERTS)
  const rawPeople = useYoloLive((s) => s.panel?.people ?? NO_PEOPLE)
  const [muted, setMuted] = usePersistentState('camwell:yolo-console:sound-muted:v1', false)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const [, setTick] = useState(0) // render ใหม่หลังเบราว์เซอร์ยอมเปิดเสียง
  const settings = useWellnessSettings()
  useAlertSounds(alerts, acked, muted)

  useEffect(() => {
    const unlock = () => void unlockAudio().then(() => setTick((n) => n + 1))
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const falls = alerts.filter((a) => a.category === 'fall' && !acked.has(a.id))
  // เรียงตาม ID คงที่ — ถ้าเรียงตามการเตือน แถวจะกระโดดหนีเมาส์ตอนการเตือนเกิด/หาย
  const people = [...rawPeople].sort((a, b) => a.id - b.id)

  return (
    <div className="dc-card dc-pad" data-testid="room-panel">
      <div className="dc-card-head">
        <h2 className="dc-h2">คนในห้องนี้ ({people.length})</h2>
        <div className="yc-row yc-tight">
          {/* อยู่ในบรรทัดหัว: ถ้าอยู่เหนือรายการ ตอนข้อความหายแถวจะเลื่อนหนีเมาส์ระหว่างคลิก */}
          {!muted && !audioReady() && <span className="yc-warn-text">คลิกหน้าเว็บเพื่อเปิดเสียง</span>}
          <button
            type="button"
            className="dc-btn yc-icon-btn"
            aria-label={muted ? 'เปิดเสียงเตือน' : 'ปิดเสียงเตือน'}
            title={muted ? 'เปิดเสียงเตือน' : 'ปิดเสียงเตือน'}
            onClick={() => {
              void unlockAudio().then(() => setTick((n) => n + 1))
              setMuted(!muted)
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {isTestMode(settings.data) && (
        <p className="yc-callout is-warn">
          โหมดทดสอบ: เกณฑ์เวลาสั้นกว่าปกติ (นั่ง {String(settings.data?.sit_minutes)} นาที, ท่านั่ง {String(settings.data?.posture_seconds)} วินาที) คืนค่าเริ่มต้นได้ที่หน้าตั้งค่า
        </p>
      )}

      {falls.map((a) => (
        <div key={a.id} className="yc-fall" data-testid="room-fall">
          <div className="yc-grow-col">
            <strong>ตรวจพบการล้ม</strong>
            <span>
              {a.type === 'fall_vanish'
                ? `${personName(a.name, a.person)} ร่วงลงแล้วหายจากภาพ อาจหกล้ม`
                : `สงสัยว่า ${personName(a.name, a.person)} หกล้มหรือตกจากเก้าอี้`}{' '}
              กรุณาตรวจสอบด่วน
            </span>
          </div>
          <div className="yc-fall-side">
            <em>ทันที</em>
            <button type="button" className="dc-btn yc-btn-danger" onClick={() => setAcked((s) => new Set(s).add(a.id))}>
              รับทราบ
            </button>
          </div>
        </div>
      ))}

      {people.length === 0 && <p className="dc-empty">ยังไม่มีคนในภาพ</p>}
      <div className="yc-people">
        {people.map((p) => (
          <PersonStatus key={p.id} person={p} acked={acked} settings={settings.data} />
        ))}
      </div>
    </div>
  )
}

function PersonStatus({ person: p, acked, settings }: { person: LivePerson; acked: Set<string>; settings?: WellnessSettings }) {
  const w = p.wellness
  const name = p.face?.status === 'known' ? p.face.name : null
  const alerts = (w?.alerts ?? []).filter((a) => !acked.has(a.id))
  const [open, setOpen] = useState(false)
  const na = w ? CATEGORIES.filter((c) => w.checks[c] === 'na' && w.notes[c]) : []
  return (
    <div className={`yc-person ${w?.alerts.length ? 'is-alert' : ''}`} data-testid="room-person">
      <div className="yc-person-head">
        <strong>{name ?? `คนที่ ${p.id}`}</strong>
        <span className="dc-muted-12">
          {STATE_TEXT[p.state] ?? p.state}
          {w?.sitMinutes != null && p.state === 'sitting' ? ` · นั่งมา ${Math.floor(w.sitMinutes)} นาที` : ''}
        </span>
        {!name && <em className="yc-push dc-muted-12">ยังไม่ระบุตัว</em>}
        {w && (
          <button
            type="button"
            className={`yc-link ${name ? 'yc-push' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? '▾' : '▸'} ค่าที่วัดได้
          </button>
        )}
      </div>
      {w ? (
        <>
          <div className="yc-checks">
            {CATEGORIES.map((c) => (
              <div
                key={c}
                className={`yc-check-cell is-${w.checks[c]}`}
                title={w.checks[c] === 'na' ? `${CATEGORY_TEXT[c]}: ${w.notes[c] ?? 'วัดไม่ได้'}` : w.checks[c] === 'off' ? 'ปิดอยู่' : undefined}
              >
                <span className="yc-check-mark" aria-label={w.checks[c] === 'alert' ? 'แจ้งเตือน' : w.checks[c] === 'ok' ? 'ปกติ' : 'ไม่ได้วัด'}>
                  {CHECK_MARK[w.checks[c]]}
                </span>
                <span>{CATEGORY_TEXT[c]}</span>
              </div>
            ))}
          </div>
          {alerts.map((a) => (
            <div key={a.id} className="yc-person-alert" data-testid="room-alert">
              <span>{a.text}</span>
              <em>{liveDuration(a)}</em>
            </div>
          ))}
          {alerts.length === 0 && <p className="dc-muted-12 yc-tight-p">ท่าทางปกติ</p>}
          {Object.entries(w.badFor ?? {}).map(([kind, secs]) => (
            <p key={kind} className="yc-warn-text yc-tight-p">
              {POSTURE_TEXT[kind] ?? kind} มาแล้ว {Math.floor(secs)} / {Number(settings?.posture_seconds ?? 30)} วินาที
            </p>
          ))}
          {na.map((c) => (
            <p key={c} className="dc-muted-12 yc-tight-p">
              {CATEGORY_TEXT[c]}: {w.notes[c]}
            </p>
          ))}
          {open && settings && <Metrics w={w} s={settings} sitting={p.state === 'sitting'} />}
        </>
      ) : (
        <p className="dc-muted-12 yc-tight-p">ระบบแจ้งเตือนไม่ได้ทำงาน</p>
      )}
    </div>
  )
}

function Metrics({ w, s, sitting }: { w: NonNullable<LivePerson['wellness']>; s: WellnessSettings; sitting: boolean }) {
  const m = w.metrics
  const n = (k: string) => Number(s[k])
  const frontal = m.tilt !== undefined
  const rows: [string, string, string, boolean][] = []
  const add = (label: string, value: string, rule: string, bad: boolean) => rows.push([label, value, rule, bad])
  if (m.head_drop !== undefined) add('ศีรษะสูงกว่าไหล่', m.head_drop.toFixed(2), `< ${n('head_drop')}`, m.head_drop < n('head_drop'))
  if (m.neck !== undefined) add('คอยื่น', `${Math.round(m.neck)}°`, `> ${n('neck_angle')}°`, m.neck > n('neck_angle'))
  if (m.tilt !== undefined) add('ไหล่เอียง', `${Math.round(m.tilt)}°`, `> ${n('shoulder_tilt')}°`, m.tilt > n('shoulder_tilt'))
  if (m.torso !== undefined) {
    const th = frontal ? n('side_lean') : n('torso_angle')
    add(frontal ? 'ลำตัวเอียงข้าง' : 'หลังโน้ม', `${Math.round(m.torso)}°`, `> ${th}°`, m.torso > th)
  }
  if (m.width !== undefined) add('หน้ากว้าง', `${Math.round(m.width)} px`, `≥ ${n('min_face_px')} px`, m.width < n('min_face_px'))
  if (m.distance_ratio !== undefined)
    add('ขนาดหน้าเทียบปกติ', `×${m.distance_ratio.toFixed(2)}`, `> ×${n('distance_ratio')}`, m.distance_ratio >= n('distance_ratio'))
  if (m.eye !== undefined) {
    const closed = m.eye_usual !== undefined ? m.eye_usual * n('eye_ratio') : undefined
    add(
      'ลืมตา',
      `${m.eye.toFixed(2)}${m.eye_usual !== undefined ? ` (ปกติ ${m.eye_usual.toFixed(2)})` : ''}`,
      closed !== undefined ? `หลับเมื่อ < ${closed.toFixed(2)}` : 'กำลังเรียนรู้',
      closed !== undefined && m.eye < closed,
    )
  }
  if (m.mouth !== undefined) add('อ้าปาก', m.mouth.toFixed(2), `หาวเมื่อ > ${n('yawn_ratio')}`, m.mouth >= n('yawn_ratio'))
  if (w.sitMinutes !== null) add('นั่งต่อเนื่อง', `${w.sitMinutes.toFixed(1)} นาที`, `เตือนที่ ${n('sit_minutes')} นาที`, w.sitMinutes >= n('sit_minutes'))
  return (
    <div className="yc-metrics" data-testid="room-metrics">
      {!sitting && <p className="dc-muted-12 yc-tight-p">ท่านั่งวัดเฉพาะตอนนั่ง</p>}
      {rows.length === 0 && <p className="dc-muted-12 yc-tight-p">ยังไม่มีค่า</p>}
      <div className="yc-metrics-grid">
        {rows.map(([label, value, rule, bad]) => (
          <div key={label} className="yc-contents">
            <span className="dc-muted">{label}</span>
            <span className={`dc-mono ${bad ? 'yc-bad' : ''}`}>{value}</span>
            <span className="dc-muted yc-right">{rule}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
