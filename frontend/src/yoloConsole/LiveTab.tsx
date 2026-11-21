import { useRef, useState, type FormEvent } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { DEFAULT_LAYERS, drawLiveFrame, LAYERS, type LayerKey, type Layers } from './drawLive'
import { FloorPlanCard, HeatmapCard, LegendCard, StatsPanel } from './LivePanels'
import PlayerBar from './PlayerBar'
import { useFrameAspect, useLiveDraw, useYoloLive } from './useYoloLive'
import { yoloService } from './yoloService'
import type { SessionState } from './types'

type SourceTab = 'video' | 'image' | 'camera' | 'go2rtc' | 'sim'

const SOURCE_TABS: [SourceTab, string][] = [
  ['video', 'ไฟล์วิดีโอ'],
  ['image', 'ไฟล์รูปภาพ'],
  ['camera', 'กล้อง browser'],
  ['go2rtc', 'go2rtc'],
  ['sim', 'Simulator'],
]

const STAGE_MESSAGES: Partial<Record<SessionState, string>> = {
  idle: 'เลือกแหล่งภาพด้านบนเพื่อเริ่ม',
  starting: 'กำลังเปิดแหล่งภาพและโหลดโมเดล...',
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function SourcePicker() {
  const [tab, setTab] = useState<SourceTab>('video')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [go2rtcUrl, setGo2rtcUrl] = useState('')
  const [simPeople, setSimPeople] = useState(7)
  const [loopVideo, setLoopVideo] = usePersistentState('camwell:yolo-console:video-loop:v1', true)

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

  const startFile = (kind: 'video' | 'image', file: File) =>
    run('กำลังอัปโหลด...', async () => {
      const upload = await yoloService.upload(file)
      if (upload.kind !== kind) throw new Error(kind === 'video' ? 'ไฟล์นี้ไม่ใช่วิดีโอ' : 'ไฟล์นี้ไม่ใช่รูปภาพ')
      await yoloService.startSession(
        kind === 'video' ? { kind, upload_id: upload.id, loop: loopVideo } : { kind, upload_id: upload.id },
      )
    })

  const submitGo2rtc = (e: FormEvent) => {
    e.preventDefault()
    const url = go2rtcUrl.trim()
    if (url) void run('กำลังเปิดสตรีม...', () => yoloService.startSession({ kind: 'go2rtc', url }))
  }

  const busy = pending !== null

  return (
    <div className="dc-card dc-pad">
      <div className="dc-card-head yc-wrap-head">
        <h2 className="dc-h2">แหล่งภาพ</h2>
        <div className="dc-segment" role="tablist" aria-label="ชนิดแหล่งภาพ">
          {SOURCE_TABS.map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'active' : ''}
              onClick={() => setTab(key)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {(tab === 'video' || tab === 'image') && (
        <label className="yc-row">
          <span className="yc-label">{tab === 'video' ? 'เลือกไฟล์วิดีโอ' : 'เลือกไฟล์รูปภาพ'}</span>
          <input
            key={tab}
            type="file"
            className="yc-file"
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
        <label className="yc-row yc-check">
          <input type="checkbox" checked={loopVideo} onChange={(e) => setLoopVideo(e.target.checked)} />
          <span>เล่นวนซ้ำ — จบคลิปแล้วเริ่มจากต้นคลิปเองจนกว่าจะกด "จบ" (มีผลกับไฟล์ที่เลือกครั้งถัดไป)</span>
        </label>
      )}

      {tab === 'camera' && (
        <div className="yc-row">
          <button
            type="button"
            className="dc-btn"
            disabled={busy}
            onClick={() => void run('กำลังเปิดกล้อง...', () => yoloService.startCamera())}
          >
            เปิดกล้องจาก browser
          </button>
          <span className="dc-muted-12">ส่งเฟรมจากกล้องเครื่องนี้ไปให้ yolo-backend วิเคราะห์ แล้วแสดงผลกลับแบบสด</span>
        </div>
      )}

      {tab === 'go2rtc' && (
        <form className="yc-row" onSubmit={submitGo2rtc}>
          <label className="yc-label" htmlFor="yc-go2rtc">ลิงก์ go2rtc</label>
          <input
            id="yc-go2rtc"
            className="yc-input yc-grow"
            autoComplete="off"
            spellCheck={false}
            value={go2rtcUrl}
            onChange={(e) => setGo2rtcUrl(e.target.value)}
            placeholder="rtsp://host:8554/กล้อง หรือ http://host:1984/stream.html?src=กล้อง"
          />
          <button type="submit" className="dc-btn" disabled={busy || !go2rtcUrl.trim()}>
            เปิดสตรีม
          </button>
        </form>
      )}

      {tab === 'sim' && (
        <div className="yc-row">
          <label className="yc-label" htmlFor="yc-sim-people">จำนวนคน</label>
          <input
            id="yc-sim-people"
            type="number"
            className="yc-input yc-narrow"
            min={1}
            max={12}
            value={simPeople}
            onChange={(e) => setSimPeople(Number(e.target.value))}
          />
          <button
            type="button"
            className="dc-btn"
            disabled={busy}
            onClick={() => void run('กำลังเริ่ม Simulator...', () => yoloService.startSession({ kind: 'sim', people: simPeople }))}
          >
            เริ่ม Simulator
          </button>
        </div>
      )}

      {pending && <p className="dc-muted-12 yc-note">{pending}</p>}
      {error && <p className="yc-error">{error}</p>}
    </div>
  )
}

const OFFLINE_MESSAGE = 'ไม่ได้เชื่อมต่อ yolo-backend — เปิดด้วย npm run dev:yolo ที่ root ของโปรเจกต์'

function LiveStage({ layers }: { layers: Layers }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const connected = useYoloLive((s) => s.connected)
  const state = useYoloLive((s) => s.status.state)
  const error = useYoloLive((s) => s.status.error ?? null)
  const kind = useYoloLive((s) => s.status.source?.kind)
  const aspect = useFrameAspect()

  useLiveDraw(ref, (canvas, live) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (live.frame && live.snapshot) drawLiveFrame(ctx, live.frame, live.snapshot, layers)
    else ctx.clearRect(0, 0, canvas.width, canvas.height)
  })

  // กล้อง browser: ภาพแรกยังไม่มาจนกว่าจะส่งเฟรมได้ ไม่ต้องขึ้นข้อความทับ
  const waitingForCamera = state === 'running' && kind === 'browser'
  const message = !connected ? OFFLINE_MESSAGE : (error ?? (waitingForCamera ? undefined : STAGE_MESSAGES[state]))
  return (
    <div className="yc-stage" style={{ aspectRatio: aspect }}>
      <canvas ref={ref} width={1280} height={720} role="img" aria-label="ภาพจากแหล่งที่เลือกพร้อมผลการวิเคราะห์" />
      {message && <div className={`yc-stage-msg ${error || !connected ? 'is-error' : ''}`}>{message}</div>}
    </div>
  )
}

export default function LiveTab() {
  const [layers, setLayers] = usePersistentState<Layers>('camwell:yolo-console:layers:v1', DEFAULT_LAYERS)
  const sideOpen = layers.stats || layers.heatmap || layers.minimap || layers.legend

  return (
    <div className={`yc-live ${sideOpen ? 'with-side' : ''}`}>
      <div className="yc-live-main">
        <SourcePicker />
        <LiveStage layers={layers} />
        <PlayerBar />
        <div className="dc-card dc-pad">
          <span className="dc-section-label">Layers</span>
          <div className="dc-toggle-row">
            {(Object.entries(LAYERS) as [LayerKey, string][]).map(([key, text]) => (
              <button
                key={key}
                type="button"
                aria-pressed={layers[key]}
                className={`dc-toggle dc-toggle-sm ${layers[key] ? 'on' : ''}`}
                onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
      {sideOpen && (
        <aside className="yc-live-side">
          {layers.stats && <StatsPanel />}
          {layers.heatmap && <HeatmapCard />}
          {layers.minimap && <FloorPlanCard />}
          {layers.legend && <LegendCard />}
        </aside>
      )}
    </div>
  )
}
