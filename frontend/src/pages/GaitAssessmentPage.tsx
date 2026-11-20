import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import AppNavigation from '../components/AppNavigation'
import CameraSourceSelector from '../components/CameraSourceSelector'
import { usePoseLandmarker } from '../hooks/usePoseLandmarker'
import { buildSkeletonSegments } from '../lib/skeletonOverlay'
import {
  MultiPersonGaitTracker,
  type MultiPersonGaitEntry,
  type MultiPersonRombergEntry,
  type TrackedGaitPersonSnapshot,
} from '../lib/multiPersonGait'
import { DEFAULT_CAMERA_SOURCE, restoreCameraSource, type CameraSlot, type CameraSource } from '../types/cameraSource'
import type { Point } from '../types/posture'
import '../App.css'
import './PeoplePage.css'
import './GaitAssessmentPage.css'

type AssessmentMode = 'standing_front' | 'standing_side' | 'romberg' | 'gait'
type RombergPhase = 'idle' | 'eyes_open' | 'eyes_closed' | 'done'

const CAMERA_SLOTS_STORAGE_KEY = 'camwell:camera-slots:v1'
const ROMBERG_PHASE_SEC = 10
const GAIT_RECORD_SEC = 8
const POSE_COUNT_OPTIONS = [
  { value: 1, label: 'ทีละ 1 คน' },
  { value: 4, label: 'หลายคน (สูงสุด 4 คน)' },
  { value: 8, label: 'หลายคนมาก (สูงสุด 8 คน)' },
] as const

const MODE_TABS: { id: AssessmentMode; label: string; hint: string }[] = [
  {
    id: 'standing_front',
    label: '1. ท่ายืนหน้าตรง',
    hint: 'ยืนหันหน้าเข้ากล้องให้เห็นเต็มตัว (ไหล่ ถึง ข้อเท้า/เท้า) รองรับหลายคนพร้อมกัน',
  },
  {
    id: 'standing_side',
    label: '2. ท่ายืนด้านข้าง',
    hint: 'ยืนหันข้างซ้ายหรือขวาให้เห็นหู ไหล่ สะโพก เข่า ข้อเท้า เพื่อดูคอยื่น ไหล่ห่อ หลังค่อม/แอ่น และเข่าแอ่น',
  },
  {
    id: 'romberg',
    label: '3. ทดสอบ Romberg',
    hint: 'ยืนเท้าชิดหน้ากล้อง กดเริ่มเพื่อวัดการทรงตัวเทียบช่วงลืมตา (10 วิ) และหลับตา (10 วิ) แยกรายคน',
  },
  {
    id: 'gait',
    label: '4. วิเคราะห์ท่าเดิน',
    hint: 'เดินผ่านหน้ากล้องหรือเปิดคลิปคนเดิน 5–10 วินาที แยกวิเคราะห์ท่าเดินรายคนพร้อมกัน',
  },
]

function loadSavedCameraSlots(): CameraSlot[] {
  try {
    const raw = localStorage.getItem(CAMERA_SLOTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is CameraSlot =>
          !!item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.label === 'string' &&
          !!item.source &&
          typeof item.source.kind === 'string',
      )
      .map((slot) => ({ ...slot, source: restoreCameraSource(slot.source) }))
  } catch {
    return []
  }
}

function sourceKindTag(source: CameraSource): string {
  if (source.kind === 'ip-mjpeg') return 'IP MJPEG'
  if (source.kind === 'go2rtc') return 'ลิงก์ go2rtc'
  return 'เว็บแคม/USB'
}

function isCorsLikeError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'SecurityError') return true
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('tainted') || msg.includes('cross-origin') || msg.includes('security')
}

function drawMultiPersonOverlay(
  canvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  people: readonly TrackedGaitPersonSnapshot[],
  mirror: boolean,
) {
  if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
    canvas.width = frameWidth
    canvas.height = frameHeight
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, frameWidth, frameHeight)

  const toX = (x: number) => (mirror ? (1 - x) * frameWidth : x * frameWidth)
  const toY = (y: number) => y * frameHeight

  for (const person of people) {
    const segs = buildSkeletonSegments(person.landmarks, 0.4)
    ctx.lineCap = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = person.color
    for (const [a, b] of segs.bones) {
      ctx.beginPath()
      ctx.moveTo(toX(a.x), toY(a.y))
      ctx.lineTo(toX(b.x), toY(b.y))
      ctx.stroke()
    }

    if (segs.neck) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(toX(segs.neck[0].x), toY(segs.neck[0].y))
      ctx.lineTo(toX(segs.neck[1].x), toY(segs.neck[1].y))
      ctx.stroke()
    }

    if (segs.spine) {
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(toX(segs.spine[0].x), toY(segs.spine[0].y))
      ctx.lineTo(toX(segs.spine[1].x), toY(segs.spine[1].y))
      ctx.stroke()
    }

    for (const pt of person.landmarks) {
      if ((pt.visibility ?? 1) < 0.4) continue
      ctx.beginPath()
      ctx.arc(toX(pt.x), toY(pt.y), 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = person.color
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // ป้ายชื่อคนเหนือศีรษะ/ลำตัว
    const nose = person.landmarks[0]
    const anchorX = nose && (nose.visibility ?? 1) >= 0.4 ? toX(nose.x) : toX(person.anchorNorm.x)
    const anchorY = nose && (nose.visibility ?? 1) >= 0.4 ? Math.max(26, toY(nose.y) - 24) : toY(person.anchorNorm.y)
    ctx.font = '700 13px sans-serif'
    const textW = ctx.measureText(person.label).width + 16
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'
    ctx.beginPath()
    ctx.roundRect(anchorX - textW / 2, anchorY - 16, textW, 22, 11)
    ctx.fill()
    ctx.fillStyle = person.color
    ctx.textAlign = 'center'
    ctx.fillText(person.label, anchorX, anchorY - 1)
    ctx.textAlign = 'left'
  }
}

export default function GaitAssessmentPage() {
  const savedSlots = useMemo(() => loadSavedCameraSlots(), [])
  const [maxPoses, setMaxPoses] = useState<number>(4)
  const { landmarkerRef, status: modelStatus, error: modelError } = usePoseLandmarker(maxPoses, 'lite')

  const [mode, setMode] = useState<AssessmentMode>('standing_front')
  const [sourceSelection, setSourceSelection] = useState<string>(() =>
    savedSlots.length > 0 ? `slot:${savedSlots[0].id}` : 'custom',
  )
  const [customSource, setCustomSource] = useState<CameraSource>(() => savedSlots[0]?.source ?? DEFAULT_CAMERA_SOURCE)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoName, setVideoName] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)

  // สถานะบุคคลที่ตรวจจับได้ในเฟรมปัจจุบัน + ผลที่บันทึกค้างไว้
  const [livePeople, setLivePeople] = useState<TrackedGaitPersonSnapshot[]>([])
  const [savedSnapshots, setSavedSnapshots] = useState<TrackedGaitPersonSnapshot[] | null>(null)

  // Romberg test state (รองรับหลายคนพร้อมกัน)
  const [rombergPhase, setRombergPhase] = useState<RombergPhase>('idle')
  const [rombergCountdown, setRombergCountdown] = useState(ROMBERG_PHASE_SEC)
  const [rombergResults, setRombergResults] = useState<MultiPersonRombergEntry[]>([])
  const rombergPhaseRef = useRef<RombergPhase>('idle')

  // Gait recording state (รองรับหลายคนพร้อมกัน)
  const [gaitRecording, setGaitRecording] = useState(false)
  const [gaitCountdown, setGaitCountdown] = useState(GAIT_RECORD_SEC)
  const [gaitResults, setGaitResults] = useState<MultiPersonGaitEntry[]>([])
  const gaitRecordingRef = useRef(false)

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const multiTrackerRef = useRef<MultiPersonGaitTracker>(new MultiPersonGaitTracker())
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const modeRef = useRef<AssessmentMode>(mode)
  const corsErrorStickyRef = useRef(false)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    rombergPhaseRef.current = rombergPhase
  }, [rombergPhase])

  useEffect(() => {
    gaitRecordingRef.current = gaitRecording
  }, [gaitRecording])

  const activeCameraSource: CameraSource | null = useMemo(() => {
    if (sourceSelection === 'video') return null
    if (sourceSelection.startsWith('slot:')) {
      const slotId = sourceSelection.slice(5)
      return savedSlots.find((s) => s.id === slotId)?.source ?? customSource
    }
    return customSource
  }, [sourceSelection, savedSlots, customSource])

  const activeKind: CameraSource['kind'] | 'video' = activeCameraSource ? activeCameraSource.kind : 'video'

  // เชื่อมต่อแหล่งภาพตามชนิดที่เลือก และรีเซ็ต tracker เมื่อเปลี่ยนแหล่งกล้อง
  useEffect(() => {
    const videoEl = videoRef.current
    let active = true
    let mediaStream: MediaStream | null = null
    corsErrorStickyRef.current = false
    multiTrackerRef.current.clearAll()

    if (activeKind === 'local' && videoEl) {
      videoEl.removeAttribute('src')
      if (!navigator.mediaDevices?.getUserMedia) {
        queueMicrotask(() => {
          if (active) {
            setStreamError('เบราว์เซอร์ไม่รองรับการใช้งานกล้อง')
          }
        })
        return
      }

      const deviceId = activeCameraSource?.deviceId
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      }

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          mediaStream = stream
          videoEl.srcObject = stream
          void videoEl.play().catch(() => undefined)
          setStreamError(null)
        })
        .catch((err: unknown) => {
          if (!active) return
          setStreamError(err instanceof Error ? err.message : 'เปิดกล้องไม่สำเร็จ')
        })
    } else if (activeKind === 'video' && videoEl) {
      if (videoUrl) {
        videoEl.srcObject = null
        videoEl.src = videoUrl
        videoEl.loop = true
        void videoEl.play().catch(() => undefined)
      } else {
        videoEl.srcObject = null
        videoEl.removeAttribute('src')
      }
      queueMicrotask(() => {
        if (active) {
          setStreamError(null)
        }
      })
    } else if (activeKind === 'go2rtc') {
      queueMicrotask(() => {
        if (active) {
          setStreamError('หน้านี้ยังไม่รองรับแหล่งภาพ "ลิงก์ go2rtc" — ใช้กล้องในเครื่อง กล้อง IP (MJPEG) หรือไฟล์วิดีโอแทน')
        }
      })
    } else {
      queueMicrotask(() => {
        if (active) {
          setStreamError(activeCameraSource?.ipUrl ? null : 'ยังไม่ได้ระบุ URL ของกล้อง IP (MJPEG)')
        }
      })
    }

    return () => {
      active = false
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop())
      }
      if (videoEl?.srcObject instanceof MediaStream) {
        videoEl.srcObject.getTracks().forEach((t) => t.stop())
        videoEl.srcObject = null
      }
    }
  }, [activeKind, activeCameraSource?.deviceId, activeCameraSource?.ipUrl, videoUrl])

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  const mjpegImgSrc = activeKind === 'ip-mjpeg' ? (activeCameraSource?.ipUrl ?? '') : ''

  // Loop ตรวจจับ Pose หลายคนพร้อมกัน
  useEffect(() => {
    if (modelStatus !== 'ready') return

    let rafId = 0
    let lastProcessedAt = 0
    let lastVideoTime = -1

    const tick = () => {
      rafId = window.requestAnimationFrame(tick)
      const canvas = canvasRef.current
      const landmarker = landmarkerRef.current
      if (!canvas || !landmarker || corsErrorStickyRef.current) return

      const useImg = activeKind === 'ip-mjpeg'
      const source: HTMLVideoElement | HTMLImageElement | null = useImg ? imgRef.current : videoRef.current
      if (!source) return

      let frameWidth = 0
      let frameHeight = 0
      if (source instanceof HTMLVideoElement) {
        if (source.readyState < 2 || source.videoWidth === 0) return
        if (activeKind === 'video' && source.currentTime === lastVideoTime) return
        frameWidth = source.videoWidth
        frameHeight = source.videoHeight
      } else {
        if (!mjpegImgSrc || !source.complete || source.naturalWidth === 0) return
        frameWidth = source.naturalWidth
        frameHeight = source.naturalHeight
      }

      const perfNow = performance.now()
      if (perfNow - lastProcessedAt < 55) return
      lastProcessedAt = perfNow
      if (source instanceof HTMLVideoElement) lastVideoTime = source.currentTime

      let allLandmarks: Point[][] = []
      try {
        const result = landmarker.detectForVideo(source, perfNow)
        allLandmarks = (result.landmarks ?? []) as Point[][]
      } catch (err) {
        if (isCorsLikeError(err)) {
          corsErrorStickyRef.current = true
          setStreamError('อ่านภาพกล้อง IP-MJPEG เข้า AI ไม่ได้เพราะ CORS — ต้องเปิด CORS ที่กล้อง')
        }
        return
      }

      const snapshots = multiTrackerRef.current.processFrame({
        allLandmarks,
        mode: modeRef.current,
        rombergPhase: rombergPhaseRef.current,
        gaitRecording: gaitRecordingRef.current,
        now: Date.now(),
      })

      drawMultiPersonOverlay(canvas, frameWidth, frameHeight, snapshots, activeKind === 'local')
      setLivePeople(snapshots)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [modelStatus, landmarkerRef, activeKind, mjpegImgSrc])

  // ตัวนับเวลา Romberg 2 ช่วง (ลืมตา -> หลับตา)
  useEffect(() => {
    if (rombergPhase !== 'eyes_open' && rombergPhase !== 'eyes_closed') return

    const timer = window.setInterval(() => {
      setRombergCountdown((prev) => {
        if (prev > 1) return prev - 1
        if (rombergPhase === 'eyes_open') {
          setRombergPhase('eyes_closed')
          return ROMBERG_PHASE_SEC
        }
        setRombergPhase('done')
        setRombergResults(multiTrackerRef.current.evaluateAllRomberg())
        return 0
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [rombergPhase])

  // ตัวนับเวลาการบันทึกท่าเดิน
  useEffect(() => {
    if (!gaitRecording) return

    const timer = window.setInterval(() => {
      setGaitCountdown((prev) => {
        if (prev > 1) return prev - 1
        setGaitRecording(false)
        setGaitResults(multiTrackerRef.current.evaluateAllGait())
        return 0
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [gaitRecording])

  const handleVideoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const nextUrl = URL.createObjectURL(file)
    setVideoUrl(nextUrl)
    setVideoName(file.name)
    setSourceSelection('video')
  }

  const startRomberg = useCallback(() => {
    multiTrackerRef.current.resetSessionBuffers()
    setRombergResults([])
    setRombergCountdown(ROMBERG_PHASE_SEC)
    setRombergPhase('eyes_open')
  }, [])

  const finishRombergNow = useCallback(() => {
    setRombergPhase('done')
    setRombergResults(multiTrackerRef.current.evaluateAllRomberg())
  }, [])

  const startGaitRecording = useCallback(() => {
    multiTrackerRef.current.resetSessionBuffers()
    setGaitResults([])
    setGaitCountdown(GAIT_RECORD_SEC)
    setGaitRecording(true)
  }, [])

  const stopGaitRecording = useCallback(() => {
    setGaitRecording(false)
    setGaitResults(multiTrackerRef.current.evaluateAllGait())
  }, [])

  const displayedStandingPeople = savedSnapshots ?? livePeople
  const fullBodyCount = livePeople.filter((p) => p.fullBodyVisible).length

  const summaryReportText = useMemo(() => {
    const lines = ['🧍‍♂️ สรุปผลตรวจท่ายืน & ท่าเดิน (Multi-Person) — CamWell']
    if (mode === 'standing_front') {
      for (const person of displayedStandingPeople) {
        if (!person.front) continue
        lines.push(
          `\n[${person.label} · ยืนหน้าตรง] ไหล่เอียง ${person.front.metrics.shoulderTiltDeg.toFixed(1)}° | เชิงกรานเอียง ${person.front.metrics.pelvicTiltDeg.toFixed(1)}°`,
        )
        if (person.front.findings.length === 0) lines.push('• ปกติ ไม่พบความไม่สมมาตรเด่น')
        else person.front.findings.forEach((f) => lines.push(`• ${f.title}`))
      }
    } else if (mode === 'standing_side') {
      for (const person of displayedStandingPeople) {
        if (!person.side) continue
        lines.push(
          `\n[${person.label} · ยืนด้านข้าง] คอยื่น ${person.side.metrics.forwardHeadDeg.toFixed(1)}° | ไหล่ห่อ ${(person.side.metrics.roundedShoulderRatio * 100).toFixed(0)}%`,
        )
        if (person.side.findings.length === 0) lines.push('• แนวแกนด้านข้างอยู่ในเกณฑ์ปกติ')
        else person.side.findings.forEach((f) => lines.push(`• ${f.title}`))
      }
    } else if (mode === 'romberg') {
      for (const entry of rombergResults) {
        lines.push(`\n[${entry.label} · Romberg] ${entry.result.title} (${entry.result.detail})`)
      }
    } else {
      for (const entry of gaitResults) {
        lines.push(
          `\n[${entry.label} · ท่าเดิน] ${entry.result.metrics.stepCount} ก้าว (${entry.result.metrics.cadenceSpm} ก้าว/นาที)`,
        )
        if (entry.result.findings.length === 0) lines.push('• ยังไม่พบรูปแบบการเดินผิดปกติชัดเจน')
        else entry.result.findings.forEach((f) => lines.push(`• ${f.labelTh} — ${f.observedSignTh}`))
      }
    }
    lines.push('\n*เป็นการคัดกรองเบื้องต้นจากภาพกล้อง 2D ไม่ใช่การวินิจฉัยโรคทางการแพทย์*')
    return lines.join('\n')
  }, [mode, displayedStandingPeople, rombergResults, gaitResults])

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryReportText)
      setCopyFeedback('คัดลอกสรุปแล้ว ✓')
      window.setTimeout(() => setCopyFeedback(null), 2000)
    } catch {
      setCopyFeedback('คัดลอกไม่สำเร็จ')
    }
  }

  const handleExportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      maxPoses,
      standingPeople: displayedStandingPeople.map((p) => ({
        trackId: p.trackId,
        label: p.label,
        front: p.front,
        side: p.side,
      })),
      romberg: rombergResults,
      gait: gaitResults,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `camwell-standing-gait-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeTabInfo = MODE_TABS.find((t) => t.id === mode)!
  const useImgElement = activeKind === 'ip-mjpeg'

  return (
    <>
      <AppNavigation active="gait" />
      <div className="app-shell people-page gait-page">
        <header className="page-heading people-header">
          <div>
            <h1>โหมดตรวจท่ายืน & ท่าเดิน</h1>
            <p>
              รองรับการตรวจจับหลายคนพร้อมกัน คัดกรองความสมมาตรท่ายืน การทรงตัว (Romberg Test) และรูปแบบการเดิน 12
              ประเภท (เพื่อเฝ้าระวังเบื้องต้น ไม่ใช่การวินิจฉัยโรค)
            </p>
          </div>
          <div className="page-heading-actions">
            <button type="button" className="secondary-button" onClick={() => void handleCopySummary()}>
              {copyFeedback ?? 'คัดลอกสรุป (LINE)'}
            </button>
            <button type="button" className="secondary-button" onClick={handleExportJson}>
              ส่งออก JSON
            </button>
          </div>
        </header>

        <section className="panel gait-mode-bar">
          <div className="gait-mode-top">
            <div className="gait-tabs" role="tablist" aria-label="เลือกโหมดตรวจ">
              {MODE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  className={`gait-tab-btn ${mode === tab.id ? 'is-active' : ''}`}
                  onClick={() => setMode(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <label className="gait-pose-limit">
              <span>จำนวนคนในเฟรม:</span>
              <select
                className="gait-select"
                value={maxPoses}
                onChange={(e) => setMaxPoses(Number(e.target.value))}
              >
                {POSE_COUNT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="gait-mode-hint">{activeTabInfo.hint}</p>
        </section>

        <div className="gait-workspace">
          {/* ซ้าย: สลับกล้องได้เหมือนโหมดท่านั่ง + วิดีโอทดสอบ + Skeleton หลายคน */}
          <section className="panel gait-stage-panel">
            <div className="gait-source-bar">
              <div className="gait-source-switch" role="group" aria-label="สลับกล้องหรือแหล่งภาพ">
                {savedSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={`gait-small-btn ${sourceSelection === `slot:${slot.id}` ? 'is-active' : ''}`}
                    onClick={() => setSourceSelection(`slot:${slot.id}`)}
                  >
                    {slot.label} ({sourceKindTag(slot.source)})
                  </button>
                ))}
                <button
                  type="button"
                  className={`gait-small-btn ${sourceSelection === 'custom' ? 'is-active' : ''}`}
                  onClick={() => setSourceSelection('custom')}
                >
                  กำหนดแหล่งกล้องเอง
                </button>
                <button
                  type="button"
                  className={`gait-small-btn ${sourceSelection === 'video' ? 'is-active' : ''}`}
                  onClick={() => setSourceSelection('video')}
                >
                  อัปโหลดวิดีโอทดสอบ
                </button>
              </div>
            </div>

            {sourceSelection === 'custom' && (
              <div className="gait-custom-source">
                <CameraSourceSelector
                  value={customSource}
                  onChange={setCustomSource}
                  title="เลือกแหล่งภาพกล้อง (เหมือนโหมดท่านั่ง)"
                />
              </div>
            )}

            {sourceSelection === 'video' && (
              <div className="gait-video-picker">
                <label className="gait-upload-label">
                  เลือกไฟล์วิดีโอ (.mp4/.webm)
                  <input type="file" accept="video/*" onChange={handleVideoFileChange} />
                </label>
                {videoName && <span className="gait-video-name">ไฟล์ที่เล่นอยู่: {videoName}</span>}
              </div>
            )}

            {modelStatus === 'loading' && <div className="gait-banner">กำลังโหลดโมเดล Pose 33 จุด ({maxPoses} คน)...</div>}
            {modelError && <div className="gait-banner is-error">โหลดโมเดลไม่สำเร็จ: {modelError}</div>}
            {streamError && <div className="gait-banner is-error">{streamError}</div>}
            {sourceSelection === 'video' && !videoUrl && (
              <div className="gait-banner">เลือกไฟล์วิดีโอคนยืนหรือเดินเพื่อให้ระบบวิเคราะห์ Skeleton และ Gait Cycle</div>
            )}

            <div className="gait-video-frame">
              {useImgElement ? (
                mjpegImgSrc ? (
                  <img
                    ref={imgRef}
                    className="gait-video"
                    src={mjpegImgSrc}
                    crossOrigin="anonymous"
                    alt="ภาพจากกล้องเครือข่าย"
                    onError={() =>
                      setStreamError('โหลดภาพจากกล้องไม่ได้ — ตรวจสอบ URL และ CORS ของกล้อง')
                    }
                  />
                ) : null
              ) : (
                <video
                  ref={videoRef}
                  className={`gait-video ${activeKind === 'local' ? 'is-mirrored' : ''}`}
                  playsInline
                  muted
                  controls={activeKind === 'video' && !!videoUrl}
                />
              )}
              <canvas ref={canvasRef} className="gait-canvas" />
              <div className={`gait-visibility-pill ${fullBodyCount > 0 ? 'is-ok' : 'is-warn'}`}>
                {livePeople.length === 0
                  ? 'ยังไม่พบคนในเฟรม'
                  : `พบ ${livePeople.length} คน · เห็นเต็มตัว ${fullBodyCount} คน`}
              </div>
            </div>
          </section>

          {/* ขวา: แสดงผลวิเคราะห์รายบุคคล (รองรับหลายคนพร้อมกัน) */}
          <section className="panel gait-results-panel">
            {(mode === 'standing_front' || mode === 'standing_side') && (
              <div className="gait-result-stack">
                <div className="gait-panel-head">
                  <h2>
                    {mode === 'standing_front' ? 'ผลท่ายืนหน้าตรง' : 'ผลท่ายืนด้านข้าง'} (
                    {displayedStandingPeople.length} คน)
                  </h2>
                  <div className="gait-head-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={livePeople.length === 0}
                      onClick={() => setSavedSnapshots(livePeople)}
                    >
                      บันทึกผลค้างไว้
                    </button>
                    {savedSnapshots && (
                      <button type="button" className="secondary-button" onClick={() => setSavedSnapshots(null)}>
                        ดูแบบสด
                      </button>
                    )}
                  </div>
                </div>

                {displayedStandingPeople.length === 0 ? (
                  <p className="people-muted">
                    {mode === 'standing_front'
                      ? 'ยืนหันหน้าเข้ากล้องให้เห็นไหล่และสะโพกชัดเจน (รองรับหลายคนพร้อมกัน)'
                      : 'ยืนหันข้างซ้ายหรือขวาให้เห็นหู ไหล่ สะโพก เข่า และข้อเท้า'}
                  </p>
                ) : (
                  <div className="gait-people-cards">
                    {displayedStandingPeople.map((person) => (
                      <article key={person.trackId} className="gait-person-block">
                        <div className="gait-person-header">
                          <span className="gait-person-badge" style={{ borderColor: person.color, color: person.color }}>
                            ● {person.label}
                          </span>
                          <span className="gait-person-sub">
                            {person.fullBodyVisible ? 'เห็นเต็มตัว ✓' : 'เห็นยังไม่ถึงข้อเท้า'}
                          </span>
                        </div>

                        {mode === 'standing_front' &&
                          (person.front ? (
                            <>
                              <div className="gait-metrics-grid">
                                <div className="gait-metric-card">
                                  <span>ไหล่เอียง (Scoliosis)</span>
                                  <strong>{person.front.metrics.shoulderTiltDeg.toFixed(1)}°</strong>
                                </div>
                                <div className="gait-metric-card">
                                  <span>เชิงกรานเอียง</span>
                                  <strong>{person.front.metrics.pelvicTiltDeg.toFixed(1)}°</strong>
                                </div>
                                <div className="gait-metric-card">
                                  <span>เข่า / ข้อเท้า</span>
                                  <strong>
                                    {person.front.metrics.kneeToAnkleWidthRatio !== null
                                      ? person.front.metrics.kneeToAnkleWidthRatio.toFixed(2)
                                      : '—'}
                                  </strong>
                                </div>
                                <div className="gait-metric-card">
                                  <span>ฐานยืน / สะโพก</span>
                                  <strong>
                                    {person.front.metrics.stanceWidthRatio !== null
                                      ? `${person.front.metrics.stanceWidthRatio.toFixed(2)}x`
                                      : '—'}
                                  </strong>
                                </div>
                              </div>
                              {person.front.findings.length === 0 ? (
                                <div className="gait-finding-ok">แนวไหล่ เชิงกราน เข่า และฐานยืนสมมาตรปกติ</div>
                              ) : (
                                <ul className="gait-findings-list">
                                  {person.front.findings.map((f) => (
                                    <li key={f.key} className={`gait-finding-item is-${f.severity}`}>
                                      <strong>{f.title}</strong>
                                      <p>{f.detail}</p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          ) : (
                            <p className="people-muted">ยังวัดท่ายืนหน้าตรงไม่ได้ (ต้องเห็นไหล่และสะโพกทั้งสองข้าง)</p>
                          ))}

                        {mode === 'standing_side' &&
                          (person.side ? (
                            <>
                              <div className="gait-metrics-grid">
                                <div className="gait-metric-card">
                                  <span>คอยื่น</span>
                                  <strong>{person.side.metrics.forwardHeadDeg.toFixed(1)}°</strong>
                                </div>
                                <div className="gait-metric-card">
                                  <span>ไหล่ห่อ</span>
                                  <strong>{(person.side.metrics.roundedShoulderRatio * 100).toFixed(0)}%</strong>
                                </div>
                                <div className="gait-metric-card">
                                  <span>โค้งหลังบน</span>
                                  <strong>{person.side.metrics.upperBackKyphosisProxyDeg.toFixed(1)}°</strong>
                                </div>
                                <div className="gait-metric-card">
                                  <span>มุมข้อเข่า</span>
                                  <strong>
                                    {person.side.metrics.kneeExtensionDeg !== null
                                      ? `${person.side.metrics.kneeExtensionDeg.toFixed(1)}°`
                                      : '—'}
                                  </strong>
                                </div>
                              </div>
                              {person.side.findings.length === 0 ? (
                                <div className="gait-finding-ok">แนวศีรษะ ไหล่ หลัง และข้อเข่าด้านข้างปกติ</div>
                              ) : (
                                <ul className="gait-findings-list">
                                  {person.side.findings.map((f) => (
                                    <li key={f.key} className={`gait-finding-item is-${f.severity}`}>
                                      <strong>{f.title}</strong>
                                      <p>{f.detail}</p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          ) : (
                            <p className="people-muted">ยังวัดท่ายืนด้านข้างไม่ได้ (ต้องเห็นหู ไหล่ สะโพก)</p>
                          ))}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === 'romberg' && (
              <div className="gait-result-stack">
                <div className="gait-panel-head">
                  <h2>ทดสอบ Romberg ({livePeople.length} คนในเฟรม)</h2>
                  <div className="gait-head-actions">
                    {rombergPhase === 'idle' || rombergPhase === 'done' ? (
                      <button type="button" className="primary-button" onClick={startRomberg}>
                        เริ่มทดสอบ Romberg (20 วิ)
                      </button>
                    ) : (
                      <button type="button" className="secondary-button" onClick={finishRombergNow}>
                        หยุด & สรุปผลทันที
                      </button>
                    )}
                  </div>
                </div>

                <div className="gait-romberg-status">
                  {rombergPhase === 'idle' && (
                    <p className="people-muted">
                      ให้ผู้ทดสอบทุกคนยืนเท้าชิดหน้ากล้อง จากนั้นกดเริ่ม: ช่วงที่ 1 ลืมตา 10 วิ → ช่วงที่ 2 หลับตา 10 วิ
                    </p>
                  )}
                  {rombergPhase === 'eyes_open' && (
                    <div className="gait-phase-box is-open">
                      <strong>ช่วงที่ 1/2: ยืนเท้าชิด &ldquo;ลืมตา&rdquo; มองตรง ({livePeople.length} คน)</strong>
                      <span>เหลืออีก {rombergCountdown} วินาที</span>
                    </div>
                  )}
                  {rombergPhase === 'eyes_closed' && (
                    <div className="gait-phase-box is-closed">
                      <strong>ช่วงที่ 2/2: ยืนเท้าชิด &ldquo;หลับตา&rdquo; ทรงตัวนิ่งๆ ({livePeople.length} คน)</strong>
                      <span>เหลืออีก {rombergCountdown} วินาที</span>
                    </div>
                  )}
                </div>

                {rombergResults.length > 0 && (
                  <div className="gait-people-cards">
                    {rombergResults.map((entry) => (
                      <article key={entry.trackId} className="gait-person-block">
                        <div className="gait-person-header">
                          <span className="gait-person-badge" style={{ borderColor: entry.color, color: entry.color }}>
                            ● {entry.label}
                          </span>
                        </div>
                        <div className="gait-metrics-grid">
                          <div className="gait-metric-card">
                            <span>Sway ลืมตา</span>
                            <strong>{entry.result.openSwayIndex.toFixed(1)}%</strong>
                          </div>
                          <div className="gait-metric-card">
                            <span>Sway หลับตา</span>
                            <strong>{entry.result.closedSwayIndex.toFixed(1)}%</strong>
                          </div>
                          <div className="gait-metric-card">
                            <span>อัตราส่วน</span>
                            <strong>{entry.result.swayRatio.toFixed(2)}x</strong>
                          </div>
                        </div>
                        <div
                          className={`gait-finding-item ${
                            entry.result.status === 'normal'
                              ? 'is-ok'
                              : entry.result.status === 'insufficient_data'
                                ? 'is-mild'
                                : 'is-high'
                          }`}
                        >
                          <strong>{entry.result.title}</strong>
                          <p>{entry.result.detail}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === 'gait' && (
              <div className="gait-result-stack">
                <div className="gait-panel-head">
                  <h2>วิเคราะห์ท่าเดิน ({livePeople.length} คนในเฟรม)</h2>
                  <div className="gait-head-actions">
                    {!gaitRecording ? (
                      <button type="button" className="primary-button" onClick={startGaitRecording}>
                        เริ่มบันทึกท่าเดิน ({GAIT_RECORD_SEC} วิ)
                      </button>
                    ) : (
                      <button type="button" className="secondary-button" onClick={stopGaitRecording}>
                        หยุด & วิเคราะห์ ({gaitCountdown} วิ)
                      </button>
                    )}
                  </div>
                </div>

                {gaitRecording && (
                  <div className="gait-phase-box is-open">
                    <strong>
                      กำลังเก็บท่าเดิน... ({livePeople.map((p) => `${p.label}: ${p.gaitSampleCount}`).join(' · ') || 'รอพบคน'})
                    </strong>
                    <span>เหลืออีก {gaitCountdown} วินาที</span>
                  </div>
                )}

                {!gaitRecording && gaitResults.length === 0 && (
                  <p className="people-muted">
                    กด &ldquo;เริ่มบันทึกท่าเดิน&rdquo; ขณะเดินผ่านกล้อง (หรือเปิดคลิปวิดีโอคนเดิน) ระบบจะแยกติดตามและวิเคราะห์ให้ทีละคนพร้อมกัน
                  </p>
                )}

                {gaitResults.length > 0 && (
                  <div className="gait-people-cards">
                    {gaitResults.map((entry) => (
                      <article key={entry.trackId} className="gait-person-block">
                        <div className="gait-person-header">
                          <span className="gait-person-badge" style={{ borderColor: entry.color, color: entry.color }}>
                            ● {entry.label}
                          </span>
                          <span className="gait-person-sub">
                            {entry.result.metrics.sampleCount} เฟรม · {entry.result.metrics.durationSec.toFixed(1)} วิ
                          </span>
                        </div>

                        <div className="gait-metrics-grid">
                          <div className="gait-metric-card">
                            <span>จำนวนก้าว / จังหวะ</span>
                            <strong>
                              {entry.result.metrics.stepCount} ({entry.result.metrics.cadenceSpm}/น.)
                            </strong>
                          </div>
                          <div className="gait-metric-card">
                            <span>ความยาวก้าว</span>
                            <strong>{entry.result.metrics.avgStrideNorm.toFixed(2)}x</strong>
                          </div>
                          <div className="gait-metric-card">
                            <span>ไม่สมมาตร</span>
                            <strong>{(entry.result.metrics.stanceAsymmetryRatio * 100).toFixed(0)}%</strong>
                          </div>
                          <div className="gait-metric-card">
                            <span>สะโพกเอียงตก</span>
                            <strong>{entry.result.metrics.pelvicDropDegMax.toFixed(1)}°</strong>
                          </div>
                        </div>

                        <div className="gait-findings-section">
                          <h3>{entry.result.summaryNoteTh}</h3>
                          {entry.result.findings.length === 0 ? (
                            <div className="gait-finding-ok">ไม่พบรูปแบบการเดินผิดปกติชัดเจน</div>
                          ) : (
                            <ul className="gait-findings-list">
                              {entry.result.findings.map((f) => (
                                <li
                                  key={f.pattern}
                                  className={`gait-finding-item is-${
                                    f.confidence === 'high' ? 'high' : f.confidence === 'moderate' ? 'moderate' : 'mild'
                                  }`}
                                >
                                  <div className="gait-finding-title-row">
                                    <strong>{f.labelTh}</strong>
                                    <span className="gait-conf-tag">
                                      {f.confidence === 'high'
                                        ? 'เข้าข่ายชัด'
                                        : f.confidence === 'moderate'
                                          ? 'เข้าข่ายปานกลาง'
                                          : 'ข้อสังเกต'}
                                    </span>
                                  </div>
                                  <p>
                                    <strong>ลักษณะที่พบ:</strong> {f.observedSignTh}
                                  </p>
                                  <p>
                                    <strong>สาเหตุที่พบบ่อย:</strong> {f.commonCausesTh}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
