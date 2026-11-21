import { useState } from 'react'
import EngineSwitch from '../console/EngineSwitch'
import { usePersistentState } from '../hooks/usePersistentState'
import FloorTab from './FloorTab'
import LiveTab from './LiveTab'
import ReportsTab from './ReportsTab'
import { useYoloLive } from './useYoloLive'
import { ACTIVE_STATES, yoloService, type SessionAction } from './yoloService'
import type { SessionState } from './types'
import '../console/console.css'
import './yoloConsole.css'
import { PauseGlyph, PlayGlyph, StopGlyph } from '../envelope/marks'

type Tab = 'live' | 'floor' | 'reports'

const TABS: Record<Tab, [nav: string, title: string, subtitle: string]> = {
  live: ['Live', 'Live Room Analytics', 'ภาพสดจาก yolo-backend พร้อมผลวิเคราะห์ทั้งห้อง'],
  floor: ['Floor & Zones', 'Floor & Zones', 'ตั้งพื้นห้องเป็นเมตรและแบ่งโซน — ใช้แปลงตำแหน่งในภาพเป็นตำแหน่งบนพื้น'],
  reports: ['Reports', 'Reports', 'รายงานของทุก session ที่จบแล้ว'],
}
const isTab = (value: unknown): value is Tab => value === 'live' || value === 'floor' || value === 'reports'

const STATE_TEXT: Record<SessionState, string> = {
  idle: 'ยังไม่ได้เลือก',
  starting: 'กำลังเริ่ม',
  running: 'กำลังวิเคราะห์',
  paused: 'หยุดชั่วคราว',
  holding: 'วิเคราะห์เสร็จแล้ว',
  ended: 'จบแล้ว',
  error: 'มีปัญหา',
}
const STATE_COLOR: Record<SessionState, string> = {
  idle: 'var(--text-muted)',
  starting: 'var(--warn)',
  running: 'var(--good)',
  paused: 'var(--warn)',
  holding: 'var(--accent)',
  ended: 'var(--text-muted)',
  error: 'var(--danger)',
}

function SessionControls() {
  const status = useYoloLive((s) => s.status)
  const lastSpec = useYoloLive((s) => s.lastSpec)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const act = (action: SessionAction) => void run(() => yoloService.sessionAction(action))

  const { state } = status
  const active = ACTIVE_STATES.includes(state)
  const canRestart = (state === 'ended' || state === 'error') && lastSpec !== null && lastSpec.kind !== 'browser'
  const accuracy = status.summary?.state_accuracy

  return (
    <div className="dc-header-controls">
      <span className="dc-pill" data-state={state}>
        <span className="dc-dot" style={{ background: STATE_COLOR[state] }} />
        {STATE_TEXT[state]}
      </span>
      {status.source?.label && <span className="dc-muted-12 yc-source-label">{status.source.label}</span>}
      {accuracy !== undefined && <span className="dc-muted-12 dc-mono">state_accuracy {accuracy.toFixed(4)}</span>}
      {state === 'paused' ? (
        <button type="button" className="dc-btn" disabled={busy} onClick={() => act('resume')}><PlayGlyph />เล่นต่อ</button>
      ) : (
        <button type="button" className="dc-btn" disabled={busy || state !== 'running'} onClick={() => act('pause')}><PauseGlyph />หยุดชั่วคราว</button>
      )}
      <button type="button" className="dc-btn" disabled={busy || !active} onClick={() => act('stop')}><StopGlyph />จบ</button>
      {canRestart && (
        <button type="button" className="dc-btn" disabled={busy} onClick={() => void run(() => yoloService.startSession(lastSpec))}>
          ↻ เริ่มใหม่
        </button>
      )}
      {error && <span className="yc-error">{error}</span>}
    </div>
  )
}

function ServiceStatus() {
  const connected = useYoloLive((s) => s.connected)
  const state = useYoloLive((s) => s.status.state)
  const label = useYoloLive((s) => s.status.source?.label ?? null)
  const model = useYoloLive((s) => s.panel?.model ?? null)
  const fps = useYoloLive((s) => s.panel?.fps ?? null)
  const procMs = useYoloLive((s) => s.panel?.procMs ?? null)

  const services: { name: string; detail: string; status: string; color: string }[] = [
    {
      name: 'yolo-backend',
      detail: connected ? '127.0.0.1:8000 · /ws/live' : 'รัน npm run dev:yolo ที่ root ของโปรเจกต์',
      status: connected ? 'online' : 'offline',
      color: connected ? 'var(--good)' : 'var(--danger)',
    },
    { name: 'Session', detail: label ?? 'ยังไม่ได้เลือกแหล่งภาพ', status: STATE_TEXT[state], color: STATE_COLOR[state] },
    {
      name: 'Model',
      detail: fps === null ? 'YOLOv8m + pose · โหลดตอนเริ่ม session' : `${fps.toFixed(1)} fps · ${procMs?.toFixed(0)} ms/เฟรม`,
      status: model ?? '—',
      color: model ? 'var(--good)' : 'var(--text-muted)',
    },
  ]

  return (
    <div className="dc-services">
      <span className="dc-section-label">สถานะโมเดลและบริการ</span>
      {services.map((s) => (
        <div key={s.name} className="dc-service">
          <span className="dc-dot" style={{ background: s.color, marginTop: 6 }} />
          <div className="dc-service-body">
            <span className="dc-service-head">
              <span className="dc-w500">{s.name}</span>
              <span style={{ color: s.color, whiteSpace: 'nowrap' }}>{s.status}</span>
            </span>
            <span className="dc-service-detail">{s.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function NavBadge({ tab }: { tab: Tab }) {
  const state = useYoloLive((s) => s.status.state)
  if (tab !== 'live') return null
  return <span className="dc-mono-11 dc-muted">{state === 'running' ? 'LIVE' : state}</span>
}

/** ก่อนสลับกลับ MediaPipe: สั่ง yolo-backend หยุด session ที่ค้างอยู่ — ไม่งั้น GPU ยังวิเคราะห์ต่อทั้งที่ไม่มีใครดู */
async function stopSessionBeforeLeave(): Promise<boolean> {
  if (!ACTIVE_STATES.includes(yoloService.getState().status.state)) return true
  try {
    await yoloService.sessionAction('stop')
  } catch {
    // backend ไม่ตอบก็ยังให้ออกได้ — ผู้ใช้ไม่ควรติดอยู่ในหน้านี้
  }
  return true
}

export default function YoloConsole() {
  const [tab, setTab] = usePersistentState<Tab>('camwell:yolo-console:tab:v1', 'live', isTab)
  const [, title, subtitle] = TABS[tab]

  return (
    <div className="dc-root yc-root">
      <aside className="dc-aside">
        <div className="dc-brand">
          <div className="dc-brand-lockup">
            <span className="dc-brand-mark" aria-hidden="true">C</span>
            <span className="dc-brand-copy">
              <strong className="dc-brand-name">Camwell</strong>
              <span>YOLO CONSOLE</span>
            </span>
          </div>
        </div>
        <EngineSwitch current="yolo" beforeLeave={stopSessionBeforeLeave} />
        <nav className="dc-nav">
          {(Object.keys(TABS) as Tab[]).map((id) => (
            <button key={id} type="button" className={`dc-nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              <span>{TABS[id][0]}</span>
              <NavBadge tab={id} />
            </button>
          ))}
        </nav>
        <ServiceStatus />
        <div className="dc-aside-footer">
          <div className="dc-kv">
            <span>yolo-backend</span>
            <span className="dc-mono dc-text">/yolo → 127.0.0.1:8000</span>
          </div>
          <a href="?dashboard" className="dc-back-link">← Back to Dashboard</a>
        </div>
      </aside>

      <div className="dc-main-col">
        <header className="dc-header">
          <div className="dc-col">
            <h1 className="dc-title">{title}</h1>
            <span className="dc-muted-12">{subtitle}</span>
          </div>
          {tab === 'live' && <SessionControls />}
        </header>
        <main className="dc-main">
          {tab === 'live' && <LiveTab />}
          {tab === 'floor' && <FloorTab />}
          {tab === 'reports' && <ReportsTab />}
        </main>
      </div>
    </div>
  )
}
