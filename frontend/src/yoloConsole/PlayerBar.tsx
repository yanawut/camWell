// แถบเล่นคลิปวิดีโอใต้ภาพสด: เล่น/หยุดชั่วคราว, จบ, ลากเลื่อนเวลา — วิดีโอเล่นอยู่ที่ yolo-backend หน้านี้แค่สั่ง
import { useRef, useState } from 'react'
import { useYoloLive } from './useYoloLive'
import { ACTIVE_STATES, yoloService } from './yoloService'

/** ส่งตำแหน่งระหว่างลากไม่ถี่กว่านี้ — backend ทำแค่คำขอล่าสุดอยู่แล้ว */
const SCRUB_INTERVAL_MS = 150
/** หลังปล่อยเมาส์ ค้างหัวลากไว้ที่จุดที่ปล่อยจนกว่าเฟรมจากตำแหน่งใหม่จะมา ไม่ให้เด้งกลับไปตำแหน่งเก่า */
const SETTLE_MS = 500

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export default function PlayerBar() {
  const state = useYoloLive((s) => s.status.state)
  const kind = useYoloLive((s) => s.status.source?.kind ?? null)
  const lastSpec = useYoloLive((s) => s.lastSpec)
  const pos = useYoloLive((s) => s.snapshot?.clip?.pos ?? null)
  const duration = useYoloLive((s) => s.snapshot?.clip?.duration ?? null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSentAt = useRef(0)
  const settleTimer = useRef<number | undefined>(undefined)

  const video = lastSpec?.kind === 'video' ? lastSpec : null
  if (kind !== 'video' && !video) return null

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

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
    const t = scrub
    void seek(t).finally(() => {
      settleTimer.current = window.setTimeout(() => setScrub(null), SETTLE_MS)
    })
  }

  const active = ACTIVE_STATES.includes(state)
  const canSeek = duration !== null && (state === 'running' || state === 'paused')
  const shown = scrub ?? pos ?? 0
  const finished = state === 'ended' || state === 'error'

  const playPause =
    state === 'running'
      ? { text: '❚❚', label: 'หยุดชั่วคราว', act: () => yoloService.sessionAction('pause') }
      : state === 'paused'
        ? { text: '▶', label: 'เล่นต่อ', act: () => yoloService.sessionAction('resume') }
        : finished && video
          ? { text: '▶', label: 'เล่นคลิปนี้อีกครั้ง', act: () => yoloService.startSession(video) }
          : null

  return (
    <div className="dc-card yc-player">
      <button
        type="button"
        className="dc-btn yc-player-btn"
        aria-label={playPause?.label ?? 'เล่น'}
        title={playPause?.label}
        disabled={busy || !playPause}
        onClick={() => playPause && void run(playPause.act)}
      >
        {playPause?.text ?? '▶'}
      </button>
      <button
        type="button"
        className="dc-btn yc-player-btn"
        aria-label="จบคลิปและบันทึกรายงาน"
        title="จบคลิปและบันทึกรายงาน"
        disabled={busy || !active}
        onClick={() => void run(() => yoloService.sessionAction('stop'))}
      >
        ■
      </button>
      <span className="dc-mono yc-player-time">{clock(shown)}</span>
      <input
        type="range"
        className="yc-player-seek"
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
      <span className="dc-mono yc-player-time">{duration === null ? '–:––' : clock(duration)}</span>
      {video?.loop && <span className="dc-tag" title="จบคลิปแล้วเริ่มจากต้นคลิปเอง">↻ วนซ้ำ</span>}
      {error && <span className="yc-error yc-player-error">{error}</span>}
    </div>
  )
}
