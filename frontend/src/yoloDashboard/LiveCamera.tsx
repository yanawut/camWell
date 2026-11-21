import { useRef, useState, type FormEvent } from 'react'
import { DEFAULT_LAYERS, drawLiveFrame, LAYERS, type LayerKey, type Layers } from '../yoloConsole/drawLive'
import { useFrameAspect, useLiveDraw, useYoloLive } from '../yoloConsole/useYoloLive'
import { ACTIVE_STATES, yoloService, type SessionAction } from '../yoloConsole/yoloService'
import { startBrowserCamera, useCameraJob } from './browserCamera'
import { PauseGlyph, PlayGlyph, StopGlyph } from './marks'
import { errorText } from './errorText'
import { PrintedCheckbox, Segment } from './ui'
import { usePersistentState } from './usePersistentState'

// ส่วน "ภาพจากกล้อง" ของหน้าภาพรวม: เลือกแหล่งภาพ สั่งหยุด/จบ ภาพสดพร้อมผลวิเคราะห์ และแถบเล่นคลิป
// คัดลอกจากหน้าหลักของ /?yolo-console (LiveTab, SessionControls, PlayerBar) แล้วจัดหน้าตาใหม่ให้เจ้าหน้าที่
// การวิเคราะห์ทำงานอยู่ที่ yolo-backend ซ่อนส่วนนี้ (unmount) แล้วระบบยังวิเคราะห์ต่อ

type SourceTab = 'video' | 'image' | 'camera' | 'go2rtc' | 'sim'

const SOURCE_TABS: readonly (readonly [SourceTab, string])[] = [
  ['video', 'ไฟล์วิดีโอ'],
  ['image', 'ไฟล์รูปภาพ'],
  ['camera', 'กล้อง browser'],
  ['go2rtc', 'go2rtc'],
  ['sim', 'Simulator'],
]

/** ส่งตำแหน่งระหว่างลากไม่ถี่กว่านี้ — backend ทำแค่คำขอล่าสุดอยู่แล้ว */
const SCRUB_INTERVAL_MS = 150
/** หลังปล่อยเมาส์ ค้างหัวลากไว้ที่จุดที่ปล่อยจนกว่าเฟรมจากตำแหน่งใหม่จะมา ไม่ให้เด้งกลับไปตำแหน่งเก่า */
const SETTLE_MS = 500

/** layer ที่วาดบนภาพสด — อีก 5 อันของ console (คนในห้องนี้ แผงสถิติ Heatmap Floor plan Legend) เปิดปิดการ์ดข้างภาพของ console ไม่ได้วาดบนภาพ */
const PICTURE_LAYERS: readonly LayerKey[] = ['boxes', 'ids', 'states', 'skeleton', 'objects', 'trails', 'hud']
/** เปิดแค่กรอบคน ID และท่าทาง — ที่เหลือเจ้าหน้าที่เปิดเองได้ */
const STAFF_LAYERS: Layers = { ...DEFAULT_LAYERS, skeleton: false, objects: false, trails: false, hud: false }

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/** คำสั่งที่ส่งไป yolo-backend ทีละคำสั่ง: ระหว่างรอปุ่มกดไม่ได้ ล้มเหลวแล้วขึ้นข้อความ */
function useJob() {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (message: string, job: () => Promise<unknown>) => {
    setPending(message)
    setError(null)
    try {
      await job()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setPending(null)
    }
  }
  return { pending, busy: pending !== null, error, setError, run }
}

function SourcePicker() {
  const [tab, setTab] = useState<SourceTab>('camera')
  const [go2rtcUrl, setGo2rtcUrl] = useState('')
  const [simPeople, setSimPeople] = useState(7)
  const [loopVideo, setLoopVideo] = usePersistentState('camwell:yolo-dashboard:video-loop:v1', true)
  const { pending, busy, error, run } = useJob()
  const camera = useCameraJob()

  const startFile = (kind: 'video' | 'image', file: File) =>
    run('กำลังอัปโหลด...', async () => {
      const upload = await yoloService.upload(file)
      if (upload.kind !== kind) throw new Error(kind === 'video' ? 'ไฟล์นี้ไม่ใช่วิดีโอ' : 'ไฟล์นี้ไม่ใช่รูปภาพ')
      await yoloService.startSession(kind === 'video' ? { kind, upload_id: upload.id, loop: loopVideo } : { kind, upload_id: upload.id })
    })

  const submitGo2rtc = (e: FormEvent) => {
    e.preventDefault()
    const url = go2rtcUrl.trim()
    if (url) void run('กำลังเปิดสตรีม...', () => yoloService.startSession({ kind: 'go2rtc', url }))
  }

  return (
    <div className="yd-overview-source">
      <div className="yd-overview-source-head">
        <h3>แหล่งภาพ</h3>
        <Segment options={SOURCE_TABS} value={tab} onChange={setTab} label="ชนิดแหล่งภาพ" />
      </div>

      {(tab === 'video' || tab === 'image') && (
        <label className="yd-field">
          <span>{tab === 'video' ? 'เลือกไฟล์วิดีโอ' : 'เลือกไฟล์รูปภาพ'}</span>
          <input
            key={tab}
            type="file"
            className="yd-overview-file"
            accept={tab === 'video' ? '.mp4,.mov,.avi,.mkv,.webm,.m4v' : '.jpg,.jpeg,.png,.bmp,.webp'}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void startFile(tab, file)
              e.target.value = '' // เลือกไฟล์เดิมซ้ำก็ยังเริ่มใหม่ได้
            }}
          />
        </label>
      )}
      {tab === 'video' && (
        <PrintedCheckbox checked={loopVideo} onChange={setLoopVideo}>
          เล่นวนซ้ำ — จบคลิปแล้วเริ่มจากต้นคลิปเองจนกว่าจะกด "จบ" (มีผลกับไฟล์ที่เลือกครั้งถัดไป)
        </PrintedCheckbox>
      )}

      {tab === 'camera' && (
        <div className="yd-overview-row">
          <button type="button" className="yd-btn" disabled={busy || camera.pending !== null} onClick={() => void startBrowserCamera('กำลังเปิดกล้องใหม่...')}>
            refresh กล้อง browser
          </button>
          <p className="yd-fine">
            หน้านี้เปิดกล้องของเครื่องนี้ให้เองเมื่อเข้ามา แล้วส่งภาพไปให้ yolo-backend วิเคราะห์ กดปุ่มนี้เพื่อเปิดกล้องใหม่เมื่อภาพค้าง หรือหลังกด "จบ" ถ้ากำลังวิเคราะห์แหล่งอื่นอยู่ จะเปลี่ยนมาใช้กล้องเครื่องนี้แทน
          </p>
        </div>
      )}
      {tab === 'camera' && camera.pending && <p className="yd-fine">{camera.pending}</p>}
      {tab === 'camera' && camera.error && <p className="yd-error">{camera.error}</p>}

      {tab === 'go2rtc' && (
        <form className="yd-overview-row" onSubmit={submitGo2rtc}>
          <label className="yd-field yd-overview-grow">
            <span>ลิงก์ go2rtc</span>
            <input
              className="yd-input"
              autoComplete="off"
              spellCheck={false}
              value={go2rtcUrl}
              onChange={(e) => setGo2rtcUrl(e.target.value)}
              placeholder="rtsp://host:8554/กล้อง หรือ http://host:1984/stream.html?src=กล้อง"
            />
          </label>
          <button type="submit" className="yd-btn" disabled={busy || !go2rtcUrl.trim()}>
            เปิดสตรีม
          </button>
        </form>
      )}

      {tab === 'sim' && (
        <div className="yd-overview-row">
          <label className="yd-field">
            <span>จำนวนคน</span>
            <input type="number" className="yd-input yd-overview-narrow" min={1} max={12} value={simPeople} onChange={(e) => setSimPeople(Number(e.target.value))} />
          </label>
          <button type="button" className="yd-btn" disabled={busy} onClick={() => void run('กำลังเริ่ม Simulator...', () => yoloService.startSession({ kind: 'sim', people: simPeople }))}>
            เริ่ม Simulator
          </button>
        </div>
      )}

      {pending && <p className="yd-fine">{pending}</p>}
      {error && <p className="yd-error">{error}</p>}
    </div>
  )
}

function SessionControls() {
  const state = useYoloLive((s) => s.status.state)
  const lastSpec = useYoloLive((s) => s.lastSpec)
  const { busy, error, run } = useJob()
  const act = (action: SessionAction) => void run('', () => yoloService.sessionAction(action))

  const active = ACTIVE_STATES.includes(state)
  const restart = (state === 'ended' || state === 'error') && lastSpec !== null && lastSpec.kind !== 'browser' ? lastSpec : null
  if (!active && !restart) return null

  return (
    <div className="yd-actions">
      {active &&
        (state === 'paused' ? (
          <button type="button" className="yd-btn-line is-small" disabled={busy} onClick={() => act('resume')}>
            <PlayGlyph />เล่นต่อ
          </button>
        ) : (
          <button type="button" className="yd-btn-line is-small" disabled={busy || state !== 'running'} onClick={() => act('pause')}>
            <PauseGlyph />หยุดชั่วคราว
          </button>
        ))}
      {active && (
        <button type="button" className="yd-btn-line is-small" disabled={busy} onClick={() => act('stop')}>
          <StopGlyph />จบ
        </button>
      )}
      {restart && (
        <button type="button" className="yd-btn-line is-small" disabled={busy} onClick={() => void run('', () => yoloService.startSession(restart))}>
          เริ่มใหม่
        </button>
      )}
      {error && <p className="yd-error">{error}</p>}
    </div>
  )
}

function Stage({ layers }: { layers: Layers }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const starting = useYoloLive((s) => s.status.state === 'starting')
  const aspect = useFrameAspect()

  useLiveDraw(ref, (canvas, live) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (live.frame && live.snapshot) drawLiveFrame(ctx, live.frame, live.snapshot, layers)
    else ctx.clearRect(0, 0, canvas.width, canvas.height)
  })

  return (
    <div className="yd-overview-stage" style={{ aspectRatio: aspect }}>
      <canvas ref={ref} width={1280} height={720} role="img" aria-label="ภาพจากแหล่งที่เลือกพร้อมผลการวิเคราะห์" />
      {starting && <p className="yd-overview-stage-msg">กำลังเปิดแหล่งภาพและโหลดโมเดล...</p>}
    </div>
  )
}

/** แถบเล่นคลิปวิดีโอ: เล่น/หยุดชั่วคราว จบ ลากเลื่อนเวลา — วิดีโอเล่นอยู่ที่ yolo-backend หน้านี้แค่สั่ง */
function PlayerBar() {
  const state = useYoloLive((s) => s.status.state)
  const kind = useYoloLive((s) => s.status.source?.kind ?? null)
  const loop = useYoloLive((s) => s.lastSpec?.kind === 'video' && s.lastSpec.loop === true)
  const pos = useYoloLive((s) => s.snapshot?.clip?.pos ?? null)
  const duration = useYoloLive((s) => s.snapshot?.clip?.duration ?? null)
  const [scrub, setScrub] = useState<number | null>(null)
  const { busy, error, setError, run } = useJob()
  const lastSentAt = useRef(0)
  const settleTimer = useRef<number | undefined>(undefined)

  if (kind !== 'video') return null

  const seek = (t: number) => yoloService.seek(t).catch((err: unknown) => setError(errorText(err)))
  const onScrub = (t: number) => {
    window.clearTimeout(settleTimer.current)
    setScrub(t)
    const now = performance.now()
    if (now - lastSentAt.current >= SCRUB_INTERVAL_MS) {
      lastSentAt.current = now
      void seek(t)
    }
  }
  const commit = () => {
    if (scrub === null) return
    void seek(scrub).finally(() => {
      settleTimer.current = window.setTimeout(() => setScrub(null), SETTLE_MS)
    })
  }

  const canSeek = duration !== null && (state === 'running' || state === 'paused')
  const shown = scrub ?? pos ?? 0
  const playPause =
    state === 'running'
      ? { pause: true, label: 'หยุดชั่วคราว', act: () => yoloService.sessionAction('pause') }
      : state === 'paused'
        ? { pause: false, label: 'เล่นต่อ', act: () => yoloService.sessionAction('resume') }
        : null

  return (
    <div className="yd-overview-player">
      <button
        type="button"
        className="yd-btn-line is-small yd-overview-player-btn"
        aria-label={playPause?.label ?? 'เล่น'}
        title={playPause?.label}
        disabled={busy || !playPause}
        onClick={() => playPause && void run('', playPause.act)}
      >
        {playPause?.pause ? <PauseGlyph /> : <PlayGlyph />}
      </button>
      <button
        type="button"
        className="yd-btn-line is-small yd-overview-player-btn"
        aria-label="จบคลิปและบันทึกรายงาน"
        title="จบคลิปและบันทึกรายงาน"
        disabled={busy}
        onClick={() => void run('', () => yoloService.sessionAction('stop'))}
      >
        <StopGlyph />
      </button>
      <span className="yd-mono yd-overview-time">{clock(shown)}</span>
      <input
        type="range"
        className="yd-overview-seek"
        aria-label="ตำแหน่งในคลิป"
        min={0}
        max={duration ?? 0}
        step={0.05}
        value={Math.min(shown, duration ?? 0)}
        disabled={!canSeek}
        onChange={(e) => onScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="yd-mono yd-overview-time">{duration === null ? '–:––' : clock(duration)}</span>
      {loop && (
        <span className="yd-sample" title="จบคลิปแล้วเริ่มจากต้นคลิปเอง">
          วนซ้ำ
        </span>
      )}
      {error && <p className="yd-error yd-overview-player-error">{error}</p>}
    </div>
  )
}

function DetectionLine() {
  const people = useYoloLive((s) => s.panel?.stats.people ?? null)
  const procMs = useYoloLive((s) => s.panel?.procMs ?? null)
  if (people === null || procMs === null) return null
  return (
    <p className="yd-fine">
      ตรวจพบในเฟรม: {people} คน · YOLO ใช้เวลา ~{Math.round(procMs)} ms/เฟรม
    </p>
  )
}

function LayerToggles({ layers, onToggle }: { layers: Layers; onToggle: (key: LayerKey) => void }) {
  return (
    <div className="yd-overview-layers" role="group" aria-labelledby="yd-layers-title">
      <h3 id="yd-layers-title">Layers</h3>
      <div className="yd-actions">
        {PICTURE_LAYERS.map((key) => (
          <button key={key} type="button" className="yd-btn-line is-small" aria-pressed={layers[key]} onClick={() => onToggle(key)}>
            {LAYERS[key]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** active = มี session อยู่ (กำลังเปิด วิเคราะห์ หยุดชั่วคราว หรือค้างผลไว้) — ไม่มีก็แสดงแค่ที่เลือกแหล่งภาพ */
export default function LiveCamera({ active }: { active: boolean }) {
  const failure = useYoloLive((s) => (s.status.state === 'error' ? (s.status.error ?? null) : null))
  const [layers, setLayers] = usePersistentState<Layers>('camwell:yolo-dashboard:layers:v2', STAFF_LAYERS)
  const toggleLayer = (key: LayerKey) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  return (
    <section id="yd-cameras" className="yd-dash-live-cameras yd-overview-cameras" aria-labelledby="yd-cameras-title">
      <article className="yd-dash-camera">
        <header className="yd-overview-camera-head">
          <h2 id="yd-cameras-title">ภาพจากกล้อง</h2>
          <SessionControls />
        </header>
        <div className="yd-overview-camera-body">
          {active && (
            <>
              <Stage layers={layers} />
              <PlayerBar />
              <DetectionLine />
              <LayerToggles layers={layers} onToggle={toggleLayer} />
            </>
          )}
          {failure && <p className="yd-callout is-warn">{failure}</p>}
          <SourcePicker />
        </div>
      </article>
    </section>
  )
}
