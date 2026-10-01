import { useCallback, useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { usePoseLandmarker } from '../hooks/usePoseLandmarker'
import { useFaceApiModels } from '../hooks/useFaceApiModels'
import { analyzePosture, POSTURE_LABELS_TH } from '../lib/postureAnalysis'
import { analyzeFatigueFrame, FATIGUE_LABELS_TH } from '../lib/fatigueAnalysis'
import { analyzeDistanceFrame, DISTANCE_LABELS_TH } from '../lib/distanceAnalysis'
import { stepBreakReminder } from '../lib/breakReminder'
import { initialSustainedState, stepSustainedAlert, type SustainedAlertState } from '../lib/sustainedAlertMachine'
import { enrollPerson, findBestMatch, FACE_MATCH_DISTANCE_THRESHOLD } from '../services/faceEnrollment'
import { playAlertBeep } from '../services/beep'
import type { PostureThresholds } from '../types/posture'
import type { BreakReminderState, BreakThresholds, DistanceThresholds, FatigueThresholds } from '../types/wellbeing'
import { initialBreakState } from '../lib/breakReminder'
import type { EnrolledPerson, IdentityReading } from '../types/identity'
import type { AlertEvent } from '../types/alerts'

// คู่ landmark ของ Pose ที่จะลากเส้นเป็นโครงร่าง (เฉพาะช่วงบนของร่างกาย พอสำหรับดูท่านั่ง)
const SKELETON_EDGES: [number, number][] = [
  [11, 12],
  [23, 24],
  [11, 23],
  [12, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [7, 11],
  [8, 12],
]

const FACE_DETECT_INTERVAL_MS = 400 // ตรวจใบหน้า (fatigue/distance/identity) ไม่ทุกเฟรม กันหน่วง
const IDENTITY_RECHECK_INTERVAL_MS = 3000 // identity ไม่ต้องเช็คถี่เท่า fatigue/distance

interface Props {
  postureThresholds: PostureThresholds
  fatigueThresholds: FatigueThresholds
  distanceThresholds: DistanceThresholds
  breakThresholds: BreakThresholds
  soundEnabled: boolean
  faceFeaturesEnabled: boolean
  enrolledPeople: EnrolledPerson[]
  baselineFaceWidthPx: number | null
  onCalibrateDistance: (widthPx: number) => void
  onAlertStart: (event: AlertEvent) => void
  onAlertEnd: (event: AlertEvent) => void
  onBreakDue: (continuousMinutes: number) => void
  onIdentityChange: (reading: IdentityReading) => void
  onYawnCounted: (totalCount: number) => void
  onPersonEnrolled: (person: EnrolledPerson) => void
}

export default function CameraStage({
  postureThresholds,
  fatigueThresholds,
  distanceThresholds,
  breakThresholds,
  soundEnabled,
  faceFeaturesEnabled,
  enrolledPeople,
  baselineFaceWidthPx,
  onCalibrateDistance,
  onAlertStart,
  onAlertEnd,
  onBreakDue,
  onIdentityChange,
  onYawnCounted,
  onPersonEnrolled,
}: Props) {
  const webcamRef = useRef<Webcam>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { landmarkerRef, status: poseStatus, error: poseError } = usePoseLandmarker()
  const { status: faceStatus, error: faceError } = useFaceApiModels()

  const lastVideoTimeRef = useRef(-1)
  const lastFaceRunAtRef = useRef(0)
  const lastIdentityRunAtRef = useRef(0)
  const faceBusyRef = useRef(false)
  const latestFaceResultRef = useRef<faceapi.WithFaceDescriptor<
    faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>
  > | null>(null)
  const currentFaceWidthRef = useRef<number | null>(null)

  const postureStateRef = useRef<SustainedAlertState>(initialSustainedState)
  const fatigueStateRef = useRef<SustainedAlertState>(initialSustainedState)
  const distanceStateRef = useRef<SustainedAlertState>(initialSustainedState)
  const breakStateRef = useRef<BreakReminderState>(initialBreakState)
  const yawnOpenSinceRef = useRef<number | null>(null)
  const yawnTimestampsRef = useRef<number[]>([])
  const lastPresenceAtRef = useRef<number | null>(null)

  const [statusLabel, setStatusLabel] = useState('รอกล้อง...')
  const [isAlerting, setIsAlerting] = useState(false)
  const [alertBannerText, setAlertBannerText] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [currentPersonLabel, setCurrentPersonLabel] = useState<string | null>(null)
  // currentFaceWidthRef อัปเดตทุก throttle tick แต่ ref ไม่ทำให้ re-render — ใช้ state คู่กันแค่สำหรับ
  // เปิด/ปิดปุ่ม Calibrate ให้ตรงกับความเป็นจริง
  const [hasFaceSignal, setHasFaceSignal] = useState(false)
  const [enrollName, setEnrollName] = useState('')

  const propsRef = useRef({
    postureThresholds,
    fatigueThresholds,
    distanceThresholds,
    breakThresholds,
    soundEnabled,
    faceFeaturesEnabled,
    enrolledPeople,
    baselineFaceWidthPx,
    onAlertStart,
    onAlertEnd,
    onBreakDue,
    onIdentityChange,
    onYawnCounted,
  })
  useEffect(() => {
    propsRef.current = {
      postureThresholds,
      fatigueThresholds,
      distanceThresholds,
      breakThresholds,
      soundEnabled,
      faceFeaturesEnabled,
      enrolledPeople,
      baselineFaceWidthPx,
      onAlertStart,
      onAlertEnd,
      onBreakDue,
      onIdentityChange,
      onYawnCounted,
    }
  })

  // รวมสถานะ "กำลังแจ้งเตือนอยู่ไหม" จากทั้ง 3 หมวด (ท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ) เป็นสถานะเดียวสำหรับ
  // ขอบกล้องสีแดง + ข้อความ banner — เรียกทุกครั้งที่ state machine หมวดใดหมวดหนึ่งเปลี่ยน
  const recomputeAlertUi = useCallback(() => {
    const labels: string[] = []
    if (postureStateRef.current.activeEvent) labels.push(statusLabel)
    if (fatigueStateRef.current.activeEvent) labels.push(FATIGUE_LABELS_TH[fatigueStateRef.current.activeEvent.type as keyof typeof FATIGUE_LABELS_TH] ?? fatigueStateRef.current.activeEvent.type)
    if (distanceStateRef.current.activeEvent) labels.push(DISTANCE_LABELS_TH[distanceStateRef.current.activeEvent.type as keyof typeof DISTANCE_LABELS_TH] ?? distanceStateRef.current.activeEvent.type)
    setIsAlerting(labels.length > 0)
    setAlertBannerText(labels.join(' · '))
  }, [statusLabel])

  const drawOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, poseResult: PoseLandmarkerResult | null, width: number, height: number) => {
      ctx.clearRect(0, 0, width, height)

      const landmarks = poseResult?.landmarks?.[0]
      if (landmarks) {
        ctx.lineWidth = 3
        ctx.strokeStyle = '#22d3ee'
        for (const [a, b] of SKELETON_EDGES) {
          const p1 = landmarks[a]
          const p2 = landmarks[b]
          if (!p1 || !p2) continue
          ctx.beginPath()
          ctx.moveTo(p1.x * width, p1.y * height)
          ctx.lineTo(p2.x * width, p2.y * height)
          ctx.stroke()
        }
        ctx.fillStyle = '#f97316'
        for (const idx of [0, 7, 8, 11, 12, 23, 24]) {
          const p = landmarks[idx]
          if (!p) continue
          ctx.beginPath()
          ctx.arc(p.x * width, p.y * height, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      const face = latestFaceResultRef.current
      if (face) {
        const box = face.detection.box
        ctx.lineWidth = 2
        ctx.strokeStyle = '#a3e635'
        ctx.strokeRect(box.x, box.y, box.width, box.height)
      }
    },
    [],
  )

  // ---- ตรวจจับใบหน้า (fatigue / distance / identity) แบบ throttled + async ----
  const runFaceDetection = useCallback(async (video: HTMLVideoElement, now: number) => {
    if (faceBusyRef.current) return
    faceBusyRef.current = true
    try {
      const result = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()

      latestFaceResultRef.current = result ?? null
      const p = propsRef.current

      if (!result) {
        currentFaceWidthRef.current = null
        setHasFaceSignal(false)
        const fatigueStep = stepSustainedAlert(fatigueStateRef.current, { issue: 'no_signal', metrics: {} }, now, 'fatigue', p.fatigueThresholds.drowsySustainedMs)
        fatigueStateRef.current = fatigueStep.state
        if (fatigueStep.endedEvent) p.onAlertEnd(fatigueStep.endedEvent)

        const distStep = stepSustainedAlert(distanceStateRef.current, { issue: 'no_signal', metrics: {} }, now, 'distance', p.distanceThresholds.sustainedMs)
        distanceStateRef.current = distStep.state
        if (distStep.endedEvent) p.onAlertEnd(distStep.endedEvent)

        p.onIdentityChange({ timestamp: now, matchedPersonId: null, matchedPersonName: null, distance: null })
        setCurrentPersonLabel(null)
        recomputeAlertUi()
        return
      }

      currentFaceWidthRef.current = result.detection.box.width
      setHasFaceSignal(true)

      // --- Fatigue: EAR/MAR ---
      const positions = result.landmarks.positions
      const fatigue = analyzeFatigueFrame(
        {
          rightEye: positions.slice(36, 42),
          leftEye: positions.slice(42, 48),
          innerMouth: positions.slice(60, 68),
        },
        p.fatigueThresholds,
      )

      // นับหาว: ต้องอ้าปากกว้างต่อเนื่องนานพอ (กันนับมั่วตอนพูด/หัวเราะ)
      if (fatigue.mouthAspectRatio >= p.fatigueThresholds.yawnMarThreshold) {
        if (yawnOpenSinceRef.current === null) yawnOpenSinceRef.current = now
      } else {
        if (yawnOpenSinceRef.current !== null) {
          const openDuration = now - yawnOpenSinceRef.current
          if (openDuration >= p.fatigueThresholds.yawnMinDurationMs) {
            yawnTimestampsRef.current.push(now)
            p.onYawnCounted(yawnTimestampsRef.current.length)
          }
          yawnOpenSinceRef.current = null
        }
      }
      yawnTimestampsRef.current = yawnTimestampsRef.current.filter((t) => now - t <= p.fatigueThresholds.yawnWindowMs)
      const frequentYawning = yawnTimestampsRef.current.length >= p.fatigueThresholds.yawnCountThreshold

      // fatigue.issue เป็น 'good' | 'drowsy' เสมอในสาขานี้ (เจอหน้าแล้ว) แต่ type ยังกว้างรวม 'no_face' ไว้
      // เพื่อความปลอดภัยของ type เลย map 'no_face' -> 'no_signal' ให้ตรงกับ generic machine (ไม่ควรเกิดขึ้นจริง)
      const fatigueIssue = frequentYawning ? 'frequent_yawning' : fatigue.issue === 'no_face' ? 'no_signal' : fatigue.issue
      const fatigueStep = stepSustainedAlert(
        fatigueStateRef.current,
        { issue: fatigueIssue, metrics: { eyeClosedScore: fatigue.eyeClosedScore, mouthAspectRatio: fatigue.mouthAspectRatio, yawnCount: yawnTimestampsRef.current.length } },
        now,
        'fatigue',
        p.fatigueThresholds.drowsySustainedMs,
      )
      fatigueStateRef.current = fatigueStep.state
      if (fatigueStep.startedEvent) {
        p.onAlertStart(fatigueStep.startedEvent)
        if (p.soundEnabled) playAlertBeep()
      }
      if (fatigueStep.endedEvent) p.onAlertEnd(fatigueStep.endedEvent)

      // --- Distance ---
      const distance = analyzeDistanceFrame(result.detection.box.width, p.baselineFaceWidthPx, p.distanceThresholds)
      const distanceIssue = distance.issue === 'no_face' ? 'no_signal' : distance.issue
      const distStep = stepSustainedAlert(
        distanceStateRef.current,
        { issue: distanceIssue, metrics: { relativeSize: distance.relativeSize ?? 0 } },
        now,
        'distance',
        p.distanceThresholds.sustainedMs,
      )
      distanceStateRef.current = distStep.state
      if (distStep.startedEvent) {
        p.onAlertStart(distStep.startedEvent)
        if (p.soundEnabled) playAlertBeep()
      }
      if (distStep.endedEvent) p.onAlertEnd(distStep.endedEvent)
      recomputeAlertUi()

      // --- Identity (เช็คห่างกว่าเดิม ไม่ต้องทุกรอบ) ---
      if (now - lastIdentityRunAtRef.current >= IDENTITY_RECHECK_INTERVAL_MS) {
        lastIdentityRunAtRef.current = now
        if (p.enrolledPeople.length > 0) {
          const match = findBestMatch(result.descriptor, p.enrolledPeople)
          if (match && match.distance <= FACE_MATCH_DISTANCE_THRESHOLD) {
            p.onIdentityChange({ timestamp: now, matchedPersonId: match.person.id, matchedPersonName: match.person.name, distance: match.distance })
            setCurrentPersonLabel(match.person.name)
          } else {
            p.onIdentityChange({ timestamp: now, matchedPersonId: 'unknown', matchedPersonName: null, distance: match?.distance ?? null })
            setCurrentPersonLabel('ไม่รู้จัก')
          }
        } else {
          setCurrentPersonLabel(null)
        }
      }
    } catch (err) {
      console.warn('[CameraStage] ตรวจจับใบหน้าล้มเหลว:', err)
    } finally {
      faceBusyRef.current = false
    }
  }, [recomputeAlertUi])

  const detectFrame = useCallback(() => {
    const video = webcamRef.current?.video
    const canvas = canvasRef.current
    const landmarker = landmarkerRef.current
    const p = propsRef.current
    const now = Date.now()

    if (!video || !canvas || video.readyState < 2) return

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    let poseResult: PoseLandmarkerResult | null = null
    let personPresent = false

    if (landmarker && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      poseResult = landmarker.detectForVideo(video, performance.now())

      const analysis = analyzePosture(poseResult.landmarks?.[0], p.postureThresholds)
      personPresent = analysis.issue !== 'no_person'
      setStatusLabel(POSTURE_LABELS_TH[analysis.issue])

      const postureIssue = analysis.issue === 'good' || analysis.issue === 'no_person' ? analysis.issue === 'good' ? 'good' : 'no_signal' : analysis.issue
      const step = stepSustainedAlert(
        postureStateRef.current,
        { issue: postureIssue, metrics: { neckAngleDeg: analysis.neckAngleDeg, torsoAngleDeg: analysis.torsoAngleDeg, shoulderTiltDeg: analysis.shoulderTiltDeg } },
        now,
        'posture',
        p.postureThresholds.sustainedMs,
        currentPersonLabel ?? undefined,
      )
      postureStateRef.current = step.state

      if (step.startedEvent) {
        p.onAlertStart(step.startedEvent)
        if (p.soundEnabled) playAlertBeep()
      }
      if (step.endedEvent) p.onAlertEnd(step.endedEvent)
      recomputeAlertUi()
    }

    const ctx = canvas.getContext('2d')
    if (ctx) drawOverlay(ctx, poseResult, canvas.width, canvas.height)

    // --- เตือนพัก: ใช้สัญญาณ "มีคนอยู่หน้าจอไหม" จาก pose (เห็นตัว) หรือจาก face-api (เห็นหน้า) อย่างใดอย่างหนึ่ง ---
    const facePresent = currentFaceWidthRef.current !== null
    const isPresent = personPresent || facePresent
    if (isPresent) lastPresenceAtRef.current = now
    if (!isPresent && lastPresenceAtRef.current && now - lastPresenceAtRef.current >= p.breakThresholds.breakResetMs) {
      breakStateRef.current = initialBreakState
    }
    const breakStep = stepBreakReminder(breakStateRef.current, isPresent, now, p.breakThresholds)
    breakStateRef.current = breakStep.state
    if (breakStep.shouldRemind) {
      p.onBreakDue(breakStep.continuousMinutes)
      if (p.soundEnabled) playAlertBeep()
    }

    // --- ตรวจใบหน้าแบบ throttled (fatigue / distance / identity) ---
    if (p.faceFeaturesEnabled && faceStatus === 'ready' && now - lastFaceRunAtRef.current >= FACE_DETECT_INTERVAL_MS) {
      lastFaceRunAtRef.current = now
      void runFaceDetection(video, now)
    }
  }, [drawOverlay, faceStatus, landmarkerRef, runFaceDetection, currentPersonLabel, recomputeAlertUi])

  const tickRef = useRef(detectFrame)
  useEffect(() => {
    tickRef.current = detectFrame
  }, [detectFrame])

  useEffect(() => {
    if (poseStatus !== 'ready') return
    let rafId: number
    const runner = () => {
      tickRef.current()
      rafId = requestAnimationFrame(runner)
    }
    rafId = requestAnimationFrame(runner)
    return () => cancelAnimationFrame(rafId)
  }, [poseStatus])

  const handleCalibrate = useCallback(() => {
    if (currentFaceWidthRef.current) {
      onCalibrateDistance(currentFaceWidthRef.current)
    }
  }, [onCalibrateDistance])

  const handleEnroll = useCallback(() => {
    const descriptor = latestFaceResultRef.current?.descriptor
    const name = enrollName.trim()
    if (!descriptor || !name) return
    const person = enrollPerson(name, descriptor)
    onPersonEnrolled(person)
    setEnrollName('')
  }, [enrollName, onPersonEnrolled])

  return (
    <div className="posture-monitor">
      <div className={`camera-frame ${isAlerting ? 'alerting' : ''}`}>
        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored
          onUserMediaError={() => setCameraError('เปิดกล้องไม่สำเร็จ - กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์')}
          videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
          className="camera-video"
        />
        <canvas ref={canvasRef} className="camera-overlay" style={{ transform: 'scaleX(-1)' }} />

        {poseStatus === 'loading' && <div className="camera-status-banner">กำลังโหลดโมเดล Pose Landmarker...</div>}
        {poseStatus === 'error' && <div className="camera-status-banner banner-error">{poseError}</div>}
        {faceStatus === 'error' && <div className="camera-status-banner banner-error">{faceError}</div>}
        {cameraError && <div className="camera-status-banner banner-error">{cameraError}</div>}
        {isAlerting && <div className="camera-status-banner banner-alert">⚠ {alertBannerText}</div>}
      </div>
      <p className="current-issue">
        สถานะท่านั่ง: {poseStatus === 'ready' ? statusLabel : '-'}
        {faceFeaturesEnabled && currentPersonLabel && <> · ผู้ใช้งาน: {currentPersonLabel}</>}
      </p>
      {faceFeaturesEnabled && (
        <>
          <button type="button" className="secondary-button" onClick={handleCalibrate} disabled={!hasFaceSignal}>
            Calibrate ระยะนั่งปัจจุบันเป็นค่ามาตรฐาน
          </button>
          <div className="enroll-row">
            <input
              type="text"
              placeholder="ชื่อพนักงานที่จะลงทะเบียนใบหน้า"
              value={enrollName}
              onChange={(e) => setEnrollName(e.target.value)}
            />
            <button type="button" className="secondary-button" onClick={handleEnroll} disabled={!hasFaceSignal || !enrollName.trim()}>
              ลงทะเบียนใบหน้า
            </button>
          </div>
        </>
      )}
      <p className="privacy-note">วิดีโอทั้งหมดประมวลผลในเบราว์เซอร์นี้เท่านั้น ไม่มีการส่งภาพ/วิดีโอออกจากเครื่อง</p>
    </div>
  )
}
