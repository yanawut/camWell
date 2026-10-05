import { useCallback, useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { usePoseLandmarker } from '../hooks/usePoseLandmarker'
import { useFaceApiModels } from '../hooks/useFaceApiModels'
import { computeBaseline } from '../lib/postureCalibration'
import { POSTURE_LABELS_TH } from '../lib/postureAnalysis'
import { PostureEngine } from '../lib/postureEngine'
import { analyzeFatigueFrame, FATIGUE_LABELS_TH } from '../lib/fatigueAnalysis'
import { analyzeDistanceFrame, DISTANCE_LABELS_TH } from '../lib/distanceAnalysis'
import { getBreakReminderLabel } from '../lib/breakReminder'
import { initialSustainedState, stepSustainedAlert, type SustainedAlertState } from '../lib/sustainedAlertMachine'
import type { Point2D } from '../lib/tracker'
import { limitPeopleForMode, maxPeopleFor, type DetectionMode } from '../lib/multiPerson'
import { nextCachedPoseResult } from '../lib/poseResultCache'
import { shouldProcessPose } from '../lib/poseThrottle'
import { updateInferenceEma } from '../lib/inferenceTiming'
import { enrollPerson, identifyFace } from '../services/faceEnrollment'
import { loadPostureBaseline, savePostureBaseline } from '../services/postureBaselineStore'
import { datasetRecorder } from '../services/datasetRecorder'
import { playAlertBeep, playFallAlarm } from '../services/beep'
import type { PostureBaseline, PostureFeatures, PostureThresholds } from '../types/posture'
import type { BreakThresholds, DistanceThresholds, FatigueThresholds } from '../types/wellbeing'
import type { EnrolledPerson } from '../types/identity'
import type { AlertEvent } from '../types/alerts'
import type { FallThresholds } from '../types/fall'
import type { PersonSummary } from '../types/person'
import type { CameraSource } from '../types/cameraSource'

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
const POSTURE_CALIBRATION_MS = 3000
const IDENTITY_RECHECK_INTERVAL_MS = 3000 // identity ไม่ต้องเช็คถี่เท่า fatigue/distance
const PEOPLE_SUMMARY_INTERVAL_MS = 500 // ส่งสรุปสถานะ "ใครอยู่บ้าง" ขึ้นไปแสดงผลไม่ต้องทุกเฟรม กัน re-render ถี่เกิน

type FaceResult = faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>>

// กล้อง IP ที่อยู่คนละ origin กับเว็บแอป (คนละโดเมน/พอร์ต/IP) แล้วไม่ได้ส่ง CORS header มาด้วย จะทำให้
// เบราว์เซอร์ถือว่า canvas/WebGL ที่วาดภาพนั้นไป "tainted" อ่านพิกเซลออกมาประมวลผล AI ต่อไม่ได้ (โยน SecurityError)
// แม้ว่าภาพจะยังแสดงผลบนหน้าจอได้ตามปกติก็ตาม — ฟังก์ชันนี้ไว้เช็คว่า error ที่เจอเข้าข่ายนี้หรือเปล่า
function isCorsLikeError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'SecurityError' || /tainted|cross-origin/i.test(err.message))
}

interface PersonState {
  trackId: string
  slotNumber: number
  postureActiveEvent: AlertEvent | null
  fatigueState: SustainedAlertState
  distanceState: SustainedAlertState
  yawnOpenSince: number | null
  yawnTimestamps: number[]
  identityName: string | null
  postureStatusLabel: string
  /** มุมคอดิบจากเฟรมล่าสุด (ยังไม่ลบ baseline / ยังไม่ smoothing) เก็บไว้ให้ scoring เช่น RULA ใช้มุมสัมบูรณ์ */
  neckAngleDeg: number
  /** มุมลำตัวดิบจากเฟรมล่าสุด; null เมื่อมองไม่เห็นสะโพก */
  torsoAngleDeg: number | null
  /** ตำแหน่งจุดกึ่งกลางไหล่ล่าสุด เป็นพิกเซลของเฟรม (ไม่ใช่ normalized) ใช้จับคู่กับใบหน้าที่ตรวจพบ */
  anchorPx: Point2D
}

interface Props {
  postureThresholds: PostureThresholds
  fatigueThresholds: FatigueThresholds
  distanceThresholds: DistanceThresholds
  breakThresholds: BreakThresholds
  fallThresholds: FallThresholds
  soundEnabled: boolean
  faceFeaturesEnabled: boolean
  detectionMode: DetectionMode
  enrolledPeople: EnrolledPerson[]
  baselineFaceWidthPx: number | null
  cameraSource: CameraSource
  /** รหัสภายในของกล้องตัวนี้ (ไม่ใช่ deviceId) ใช้เป็น prefix ของ trackId กันชนกับกล้องตัวอื่นตอนต่อหลายกล้อง */
  cameraId: string
  /** ชื่อกล้องที่แสดงผล เช่น "กล้อง 1" — แปะไว้ในชื่อคน/ข้อความแจ้งเตือนที่ไปโผล่รวมกันข้ามกล้อง (EventLog, banner หกล้ม/พัก) */
  cameraLabel: string
  /** true เมื่อมีมากกว่า 1 กล้องเชื่อมต่ออยู่ — ใช้ตัดสินใจว่าต้องแปะชื่อกล้องนำหน้าชื่อคนในข้อความข้ามกล้องหรือไม่
   * (ถ้ามีกล้องเดียวไม่ต้องแปะ กันข้อความรก) */
  multiCameraMode: boolean
  onCalibrateDistance: (widthPx: number) => void
  onAlertStart: (event: AlertEvent) => void
  onAlertEnd: (event: AlertEvent) => void
  onBreakDue: (personLabel: string, continuousMinutes: number) => void
  onFallDetected: (event: AlertEvent) => void
  onPeopleUpdate: (people: PersonSummary[]) => void
  onPersonEnrolled: (person: EnrolledPerson) => void
}

export default function CameraStage({
  postureThresholds,
  fatigueThresholds,
  distanceThresholds,
  breakThresholds,
  fallThresholds,
  soundEnabled,
  faceFeaturesEnabled,
  detectionMode,
  enrolledPeople,
  baselineFaceWidthPx,
  cameraSource,
  cameraId,
  cameraLabel,
  multiCameraMode,
  onCalibrateDistance,
  onAlertStart,
  onAlertEnd,
  onBreakDue,
  onFallDetected,
  onPeopleUpdate,
  onPersonEnrolled,
}: Props) {
  const webcamRef = useRef<Webcam>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { landmarkerRef, status: poseStatus, error: poseError } = usePoseLandmarker(maxPeopleFor(detectionMode))
  const { status: faceStatus, error: faceError } = useFaceApiModels()

  const lastVideoTimeRef = useRef(-1)
  const lastPoseRunAtRef = useRef(0)
  const poseInferenceMsRef = useRef(0)
  const latestPoseResultRef = useRef<PoseLandmarkerResult | null>(null)
  const lastFaceRunAtRef = useRef(0)
  const lastPeopleUpdateAtRef = useRef(0)
  const faceBusyRef = useRef(false)
  const identityLastCheckRef = useRef<Map<string, number>>(new Map())
  // Posture AlertEvent เดิมเก็บชื่อ ณ ตอนเริ่ม event; จำไว้เพื่อให้ ended event ใช้ชื่อเดียวกัน
  // แม้ identity จะ resolve/เปลี่ยนระหว่างที่ alert ยัง active อยู่
  const postureEventPersonNameRef = useRef<Map<string, string>>(new Map())
  // กล้อง IP ต่างโดเมน/พอร์ตกับเว็บแอป (cross-origin) มักติดข้อจำกัด CORS ของเบราว์เซอร์ ทำให้อ่านพิกเซลภาพ
  // ไปประมวลผล AI ไม่ได้ (ภาพยังแสดงผลได้ปกติ แต่ canvas/WebGL จะโยน SecurityError ตอนอ่านข้อมูล) — ถ้าเจอ
  // ปัญหานี้ครั้งหนึ่งจะหยุดเรียก AI ซ้ำทุกเฟรม (กัน error สแปม) จนกว่าจะเปลี่ยนแหล่งกล้อง
  const sourceErrorStickyRef = useRef(false)

  // แหล่งความจริงหลักของ "ใครอยู่ในเฟรมบ้าง" — key คือ trackId จาก poseTracker
  const personStatesRef = useRef<Map<string, PersonState>>(new Map())
  const postureEngineRef = useRef(new PostureEngine(cameraId))

  // ใบหน้าทั้งหมดที่ตรวจพบรอบล่าสุด (สำหรับวาดกรอบ + ปุ่ม Calibrate/ลงทะเบียนใช้ "ใบหน้าใหญ่สุด")
  const latestFaceResultsRef = useRef<FaceResult[]>([])
  const primaryFaceRef = useRef<FaceResult | null>(null)

  const [isAlerting, setIsAlerting] = useState(false)
  const [alertBannerText, setAlertBannerText] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [peopleCount, setPeopleCount] = useState(0)
  const [poseInferenceMs, setPoseInferenceMs] = useState(0)
  // primaryFaceRef อัปเดตทุก throttle tick แต่ ref ไม่ทำให้ re-render — ใช้ state คู่กันแค่สำหรับ
  // เปิด/ปิดปุ่ม Calibrate/ลงทะเบียน ให้ตรงกับความเป็นจริง
  const [hasFaceSignal, setHasFaceSignal] = useState(false)
  const [enrollName, setEnrollName] = useState('')
  const [postureBaseline, setPostureBaseline] = useState<PostureBaseline | null>(() =>
    loadPostureBaseline(cameraId),
  )
  const calibrationRef = useRef<{ endsAt: number; samples: PostureFeatures[] } | null>(null)
  const [isCalibratingPosture, setIsCalibratingPosture] = useState(false)
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null)
  // ต้องติ๊กยืนยันว่าขอความยินยอมจากพนักงานแล้ว (PDPA) ก่อนปุ่ม "ลงทะเบียนใบหน้า" จะกดได้ — backend เองก็ปฏิเสธ
  // คำขอที่ไม่มี consentGiven: true อยู่ดี แต่เช็คฝั่ง UI ไว้ด้วยกันลืม/กดพลาด
  const [enrollConsentChecked, setEnrollConsentChecked] = useState(false)
  const [enrollStatus, setEnrollStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const propsRef = useRef({
    postureThresholds,
    fatigueThresholds,
    distanceThresholds,
    breakThresholds,
    fallThresholds,
    soundEnabled,
    faceFeaturesEnabled,
    detectionMode,
    enrolledPeople,
    baselineFaceWidthPx,
    cameraSource,
    cameraId,
    cameraLabel,
    multiCameraMode,
    postureBaseline,
    onAlertStart,
    onAlertEnd,
    onBreakDue,
    onFallDetected,
    onPeopleUpdate,
  })
  useEffect(() => {
    propsRef.current = {
      postureThresholds,
      fatigueThresholds,
      distanceThresholds,
      breakThresholds,
      fallThresholds,
      soundEnabled,
      faceFeaturesEnabled,
      detectionMode,
      enrolledPeople,
      baselineFaceWidthPx,
      cameraSource,
      cameraId,
      cameraLabel,
      multiCameraMode,
      postureBaseline,
      onAlertStart,
      onAlertEnd,
      onBreakDue,
      onFallDetected,
      onPeopleUpdate,
    }
  })

  // ติดตามว่า cameraSource เปลี่ยนไปจากที่ detectFrame เคยเห็นล่าสุดหรือยัง (เทียบใน detectFrame เอง
  // แทนการใช้ useEffect+setState แยก กันเกิด cascading render และให้ล้าง error ทันทีตอนเฟรมถัดไปประมวลผล)
  const lastCameraSourceKeyRef = useRef('')

  // รวมสถานะ "กำลังแจ้งเตือนอยู่ไหม" จากทุกคน x ทุกหมวด (ท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ) เป็นสถานะเดียว
  // สำหรับขอบกล้องสีแดง + ข้อความ banner — เรียกทุกครั้งที่ state machine ของใครคนใดคนหนึ่งเปลี่ยน
  const recomputeAlertUi = useCallback(() => {
    const labels: string[] = []
    for (const person of personStatesRef.current.values()) {
      const name = person.identityName ?? `คนที่ ${person.slotNumber}`
      if (person.postureActiveEvent) labels.push(`${name}: ${person.postureStatusLabel}`)
      if (person.fatigueState.activeEvent) {
        const t = person.fatigueState.activeEvent.type
        labels.push(`${name}: ${FATIGUE_LABELS_TH[t as keyof typeof FATIGUE_LABELS_TH] ?? t}`)
      }
      if (person.distanceState.activeEvent) {
        const t = person.distanceState.activeEvent.type
        labels.push(`${name}: ${DISTANCE_LABELS_TH[t as keyof typeof DISTANCE_LABELS_TH] ?? t}`)
      }
    }
    setIsAlerting(labels.length > 0)
    setAlertBannerText(labels.join(' · '))
  }, [])

  // ส่งสรุปสถานะของทุกคนขึ้นไปให้ App แสดงผล (throttled กันเรียก setState ถี่ทุกเฟรม)
  const maybeEmitPeopleSummary = useCallback((now: number, force: boolean) => {
    if (!force && now - lastPeopleUpdateAtRef.current < PEOPLE_SUMMARY_INTERVAL_MS) return
    lastPeopleUpdateAtRef.current = now
    const summaries: PersonSummary[] = [...personStatesRef.current.values()]
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .map((person) => ({
        trackId: person.trackId,
        label: person.identityName ?? `คนที่ ${person.slotNumber}`,
        postureStatus: person.postureStatusLabel,
        fatigueActive: !!person.fatigueState.activeEvent,
        distanceActive: !!person.distanceState.activeEvent,
        yawnCount: person.yawnTimestamps.length,
      }))
    setPeopleCount(summaries.length)
    setPoseInferenceMs(Math.round(poseInferenceMsRef.current))
    propsRef.current.onPeopleUpdate(summaries)
  }, [])

  const drawOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, poseResult: PoseLandmarkerResult | null, width: number, height: number) => {
      ctx.clearRect(0, 0, width, height)

      const allLandmarks = poseResult?.landmarks ?? []
      for (const landmarks of allLandmarks) {
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

      for (const face of latestFaceResultsRef.current) {
        const box = face.detection.box
        ctx.lineWidth = 2
        ctx.strokeStyle = '#a3e635'
        ctx.strokeRect(box.x, box.y, box.width, box.height)

        // หาคนที่ตำแหน่งใกล้ใบหน้านี้ที่สุด เพื่อแปะชื่อ/หมายเลขกำกับเหนือกรอบ
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        let label = ''
        let bestDist = width * 0.3
        for (const person of personStatesRef.current.values()) {
          const dist = Math.hypot(person.anchorPx.x - center.x, person.anchorPx.y - center.y)
          if (dist < bestDist) {
            bestDist = dist
            label = person.identityName ?? `คนที่ ${person.slotNumber}`
          }
        }
        if (label) {
          // canvas ถูก mirror ด้วย CSS (scaleX(-1)) ให้ตรงกับวิดีโอที่ mirrored — ถ้าวาดข้อความตรงๆ จะกลับด้าน
          // เลยต้อง flip กลับเฉพาะตอนวาดข้อความ (คูณ -1 ซ้อนกันสองชั้น = ข้อความอ่านออกปกติ)
          ctx.save()
          ctx.scale(-1, 1)
          ctx.font = '16px sans-serif'
          ctx.fillStyle = '#a3e635'
          ctx.textAlign = 'center'
          ctx.fillText(label, -center.x, Math.max(14, box.y - 8))
          ctx.restore()
        }
      }
    },
    [],
  )

  // ---- ตรวจจับใบหน้าทุกคนในเฟรม (fatigue / distance / identity) แบบ throttled + async ----
  // source เป็น video element (กล้องในเครื่อง) หรือ img element (กล้อง IP แบบ MJPEG) ก็ได้ — face-api รับทั้งสองแบบ
  const runFaceDetection = useCallback(async (source: HTMLVideoElement | HTMLImageElement, now: number) => {
    if (faceBusyRef.current) return
    faceBusyRef.current = true
    try {
      const results = await faceapi
        .detectAllFaces(source, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors()

      const p = propsRef.current
      // จำกัดจำนวนตามโหมดที่เลือก โดยยังเลือกใบหน้าที่ใหญ่สุด (ใกล้กล้องที่สุด) ก่อนเหมือนเดิม
      const limited = limitPeopleForMode(results, p.detectionMode, (result) => result.detection.box.width)

      latestFaceResultsRef.current = limited
      primaryFaceRef.current = limited[0] ?? null
      setHasFaceSignal(!!limited[0])

      const canvas = canvasRef.current
      const frameWidth = canvas?.width ?? 640
      const linkDistanceThreshold = frameWidth * 0.3

      // จับคู่แต่ละใบหน้ากับคนที่ตรวจท่านั่งไว้แล้ว (pose track) ที่ตำแหน่งใกล้ที่สุด — ถือว่าเป็นคนเดียวกัน
      const unlinkedPersonIds = new Set(personStatesRef.current.keys())
      const linkedTrackIdByFaceIdx = new Map<number, string>()

      limited.forEach((face, idx) => {
        const box = face.detection.box
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        let bestId: string | null = null
        let bestDist = linkDistanceThreshold
        for (const id of unlinkedPersonIds) {
          const person = personStatesRef.current.get(id)
          if (!person) continue
          const dist = Math.hypot(person.anchorPx.x - center.x, person.anchorPx.y - center.y)
          if (dist < bestDist) {
            bestDist = dist
            bestId = id
          }
        }
        if (bestId) {
          linkedTrackIdByFaceIdx.set(idx, bestId)
          unlinkedPersonIds.delete(bestId)
        }
      })

      for (let idx = 0; idx < limited.length; idx++) {
        const trackId = linkedTrackIdByFaceIdx.get(idx)
        // เจอใบหน้านี้แต่หาคนที่ตรงกันจาก pose ไม่ได้ (เช่น เห็นแค่หน้า มองไม่เห็นไหล่/ลำตัว) — ข้าม
        // fatigue/distance/identity รอบนี้ไปก่อน (จะลองจับคู่ใหม่ทุกรอบถัดไป)
        if (!trackId) continue
        const person = personStatesRef.current.get(trackId)
        if (!person) continue
        const face = limited[idx]

        const positions = face.landmarks.positions
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
          if (person.yawnOpenSince === null) person.yawnOpenSince = now
        } else {
          if (person.yawnOpenSince !== null) {
            const openDuration = now - person.yawnOpenSince
            if (openDuration >= p.fatigueThresholds.yawnMinDurationMs) {
              person.yawnTimestamps.push(now)
            }
            person.yawnOpenSince = null
          }
        }
        person.yawnTimestamps = person.yawnTimestamps.filter((t) => now - t <= p.fatigueThresholds.yawnWindowMs)
        const frequentYawning = person.yawnTimestamps.length >= p.fatigueThresholds.yawnCountThreshold

        // ชื่อที่จะโผล่ใน EventLog (รวมข้ามกล้อง) — แปะชื่อกล้องนำหน้าด้วยถ้ามีมากกว่า 1 กล้องเชื่อมต่ออยู่
        const plainLabel = person.identityName ?? `คนที่ ${person.slotNumber}`
        const label = p.multiCameraMode ? `${p.cameraLabel} • ${plainLabel}` : plainLabel

        const fatigueIssue = frequentYawning ? 'frequent_yawning' : fatigue.issue === 'no_face' ? 'no_signal' : fatigue.issue
        const fatigueStep = stepSustainedAlert(
          person.fatigueState,
          { issue: fatigueIssue, metrics: { eyeClosedScore: fatigue.eyeClosedScore, mouthAspectRatio: fatigue.mouthAspectRatio, yawnCount: person.yawnTimestamps.length } },
          now,
          'fatigue',
          p.fatigueThresholds.drowsySustainedMs,
          label,
        )
        person.fatigueState = fatigueStep.state
        if (fatigueStep.startedEvent) {
          p.onAlertStart(fatigueStep.startedEvent)
          if (p.soundEnabled) playAlertBeep()
        }
        if (fatigueStep.endedEvent) p.onAlertEnd(fatigueStep.endedEvent)

        // --- Distance (ใช้ baseline เดียวกันทุกคน — ยังไม่รองรับ calibrate แยกรายคน) ---
        const distance = analyzeDistanceFrame(face.detection.box.width, p.baselineFaceWidthPx, p.distanceThresholds)
        const distanceIssue = distance.issue === 'no_face' ? 'no_signal' : distance.issue
        const distStep = stepSustainedAlert(
          person.distanceState,
          { issue: distanceIssue, metrics: { relativeSize: distance.relativeSize ?? 0 } },
          now,
          'distance',
          p.distanceThresholds.sustainedMs,
          label,
        )
        person.distanceState = distStep.state
        if (distStep.startedEvent) {
          p.onAlertStart(distStep.startedEvent)
          if (p.soundEnabled) playAlertBeep()
        }
        if (distStep.endedEvent) p.onAlertEnd(distStep.endedEvent)

        // --- Identity (เช็คไม่ถี่เท่า fatigue/distance ต่อคน) — ถาม camwell-backend ให้จับคู่ให้ (Phase 2)
        // เป็น fire-and-forget ไม่ await ในลูปนี้ กันไม่ให้ network request ไปบล็อกการตรวจจับคนอื่นในเฟรมเดียวกัน
        // เช็ค personStatesRef อีกครั้งตอนผลลัพธ์กลับมา เผื่อ track นี้หายไปจากเฟรมแล้วระหว่างรอ response
        const lastCheck = identityLastCheckRef.current.get(trackId) ?? 0
        if (p.enrolledPeople.length > 0 && now - lastCheck >= IDENTITY_RECHECK_INTERVAL_MS) {
          identityLastCheckRef.current.set(trackId, now)
          identifyFace(face.descriptor)
            .then((match) => {
              const current = personStatesRef.current.get(trackId)
              if (!current) return
              current.identityName = match ? match.name : null
            })
            .catch((err) => {
              // เครือข่าย/เซิร์ฟเวอร์มีปัญหาชั่วคราว — คงชื่อเดิมที่เคยระบุไว้ ไม่ reset เป็น null ให้กระพริบ
              console.warn('[CameraStage] ระบุตัวตนผ่าน backend ไม่สำเร็จ:', err)
            })
        }
      }

      // คนที่ตรวจท่านั่งเจอ แต่รอบนี้หาใบหน้าที่ตรงกันไม่เจอ (เช่น หันหน้าหนีกล้อง) — ให้ fatigue/distance
      // ของเขาเข้าสถานะ 'no_signal' (ยังมี grace period ทนอยู่ในตัว state machine อยู่แล้ว)
      const linkedTrackIds = new Set(linkedTrackIdByFaceIdx.values())
      for (const [trackId, person] of personStatesRef.current) {
        if (linkedTrackIds.has(trackId)) continue
        const fatigueStep = stepSustainedAlert(person.fatigueState, { issue: 'no_signal', metrics: {} }, now, 'fatigue', p.fatigueThresholds.drowsySustainedMs)
        const distStep = stepSustainedAlert(person.distanceState, { issue: 'no_signal', metrics: {} }, now, 'distance', p.distanceThresholds.sustainedMs)
        personStatesRef.current.set(trackId, { ...person, fatigueState: fatigueStep.state, distanceState: distStep.state })
        if (fatigueStep.endedEvent) p.onAlertEnd(fatigueStep.endedEvent)
        if (distStep.endedEvent) p.onAlertEnd(distStep.endedEvent)
      }

      recomputeAlertUi()
      maybeEmitPeopleSummary(now, false)
    } catch (err) {
      console.warn('[CameraStage] ตรวจจับใบหน้าล้มเหลว:', err)
      if (isCorsLikeError(err)) {
        sourceErrorStickyRef.current = true
        setCameraError(
          'ประมวลผล AI กับภาพจากกล้องนี้ไม่ได้ เพราะติดข้อจำกัด CORS ของเบราว์เซอร์ (กล้อง IP อยู่คนละ origin กับเว็บแอป) — ภาพจะยังแสดงผลได้ปกติ แต่ตรวจจับท่านั่ง/ใบหน้าไม่ได้ ต้องมี backend ตัวกลางช่วยแปลงสตรีม (Phase 2)',
        )
      }
    } finally {
      faceBusyRef.current = false
    }
  }, [recomputeAlertUi, maybeEmitPeopleSummary])

  const detectFrame = useCallback(() => {
    const canvas = canvasRef.current
    const landmarker = landmarkerRef.current
    const p = propsRef.current
    const now = Date.now()

    // สลับแหล่งภาพกล้อง (local <-> IP หรือเปลี่ยนอุปกรณ์/URL) — เคลียร์ error ค้างจากกล้องก่อนหน้าทิ้ง
    const cameraSourceKey = `${p.cameraSource.kind}|${p.cameraSource.deviceId ?? ''}|${p.cameraSource.ipUrl ?? ''}`
    if (cameraSourceKey !== lastCameraSourceKeyRef.current) {
      lastCameraSourceKeyRef.current = cameraSourceKey
      sourceErrorStickyRef.current = false
      latestPoseResultRef.current = nextCachedPoseResult(latestPoseResultRef.current, null, true)
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      setCameraError(null)
    }

    // แหล่งภาพปัจจุบัน: video element (กล้องในเครื่อง) หรือ img element (กล้อง IP แบบ MJPEG)
    const source: HTMLVideoElement | HTMLImageElement | null =
      p.cameraSource.kind === 'local' ? (webcamRef.current?.video ?? null) : imgRef.current
    const isVideoSource = source instanceof HTMLVideoElement

    if (!source || !canvas) return

    const sourceReady = isVideoSource
      ? source.readyState >= 2
      : (source as HTMLImageElement).complete && (source as HTMLImageElement).naturalWidth > 0
    if (!sourceReady) return

    const frameWidth = isVideoSource ? source.videoWidth : (source as HTMLImageElement).naturalWidth
    const frameHeight = isVideoSource ? source.videoHeight : (source as HTMLImageElement).naturalHeight
    if (frameWidth === 0 || frameHeight === 0) return

    if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
      canvas.width = frameWidth
      canvas.height = frameHeight
    }

    let poseResult: PoseLandmarkerResult | null = null
    let peopleChanged = false

    // กล้องในเครื่อง (video): ประมวลผลเฉพาะตอนเฟรมเปลี่ยนจริง (เช็คจาก currentTime) กันประมวลผลซ้ำเฟรมเดิม
    // กล้อง IP (MJPEG ผ่าน <img>): ไม่มีสัญญาณ "เฟรมใหม่" ที่เชื่อถือได้ จึงใช้ time throttle ด้านล่างเป็นตัวจำกัดหลัก
    // ถ้าเคยเจอปัญหา CORS กับแหล่งภาพนี้มาแล้ว หยุดลองซ้ำทุกเฟรม (กัน error สแปม) จนกว่าจะเปลี่ยนแหล่งกล้อง
    const perfNow = performance.now()
    const shouldRunPose = shouldProcessPose({
      hasLandmarker: !!landmarker,
      sourceErrorSticky: sourceErrorStickyRef.current,
      perfNow,
      lastPoseRunAt: lastPoseRunAtRef.current,
      isVideoSource,
      videoCurrentTime: isVideoSource ? source.currentTime : null,
      lastVideoTime: lastVideoTimeRef.current,
    })

    if (shouldRunPose && landmarker) {
      if (isVideoSource) lastVideoTimeRef.current = source.currentTime
      lastPoseRunAtRef.current = perfNow
      try {
        const inferenceStartedAt = performance.now()
        poseResult = landmarker.detectForVideo(source, perfNow)
        poseInferenceMsRef.current = updateInferenceEma(
          poseInferenceMsRef.current,
          performance.now() - inferenceStartedAt,
        )
        latestPoseResultRef.current = nextCachedPoseResult(latestPoseResultRef.current, poseResult)
      } catch (err) {
        console.error('[CameraStage] ตรวจจับท่านั่งล้มเหลว:', err)
        if (isCorsLikeError(err)) {
          sourceErrorStickyRef.current = true
          setCameraError(
            'ประมวลผล AI กับภาพจากกล้องนี้ไม่ได้ เพราะติดข้อจำกัด CORS ของเบราว์เซอร์ (กล้อง IP อยู่คนละ origin กับเว็บแอป) — ภาพจะยังแสดงผลได้ปกติ แต่ตรวจจับท่านั่ง/ใบหน้าไม่ได้ ต้องมี backend ตัวกลางช่วยแปลงสตรีม (Phase 2)',
          )
        }
        return
      }

      const engineResult = postureEngineRef.current.processPoseFrame(
        poseResult.landmarks ?? [],
        poseResult.worldLandmarks ?? [],
        { width: canvas.width, height: canvas.height },
        now,
        {
          postureThresholds: p.postureThresholds,
          postureBaseline: p.postureBaseline,
          fallThresholds: p.fallThresholds,
          breakThresholds: p.breakThresholds,
        },
      )

      if (engineResult.peopleChanged) peopleChanged = true

      // เก็บเฉพาะ state ที่ UI/face pipeline ยังต้องใช้ ส่วน tracker/posture/fall/break อยู่ใน PostureEngine
      for (const enginePerson of engineResult.people) {
        let person = personStatesRef.current.get(enginePerson.trackId)
        if (!person) {
          person = {
            trackId: enginePerson.trackId,
            slotNumber: enginePerson.slotNumber,
            postureActiveEvent: enginePerson.postureActiveEvent,
            fatigueState: initialSustainedState,
            distanceState: initialSustainedState,
            yawnOpenSince: null,
            yawnTimestamps: [],
            identityName: null,
            postureStatusLabel:
              POSTURE_LABELS_TH[enginePerson.postureIssue] +
              (enginePerson.smoothedFeatures.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : ''),
            neckAngleDeg: enginePerson.rawFeatures.neckAngleDeg,
            torsoAngleDeg: enginePerson.rawFeatures.torsoAngleDeg,
            anchorPx: enginePerson.anchorPx,
          }
          personStatesRef.current.set(enginePerson.trackId, person)
        } else {
          person.postureActiveEvent = enginePerson.postureActiveEvent
          person.postureStatusLabel =
            POSTURE_LABELS_TH[enginePerson.postureIssue] +
            (enginePerson.smoothedFeatures.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
          person.neckAngleDeg = enginePerson.rawFeatures.neckAngleDeg
          person.torsoAngleDeg = enginePerson.rawFeatures.torsoAngleDeg
          person.anchorPx = enginePerson.anchorPx
        }
      }

      // Dataset Recorder ใช้เงื่อนไขเดียวกับ calibration: บันทึกเมื่อมีคนเดียวในเฟรมเท่านั้น
      // เพื่อให้ label ที่ผู้ใช้เลือกไม่ปนกับอีกคน และเก็บ raw features ก่อน smoothing ตาม contract ของ dataset
      if (import.meta.env.DEV && datasetRecorder.isRecording() && engineResult.people.length === 1) {
        for (const enginePerson of engineResult.people) {
          datasetRecorder.add({
            timestamp: now,
            cameraId: p.cameraId,
            neckAngleDeg: enginePerson.rawFeatures.neckAngleDeg,
            torsoAngleDeg: enginePerson.rawFeatures.torsoAngleDeg,
            shoulderTiltDeg: enginePerson.rawFeatures.shoulderTiltDeg,
            headHeightRatio: enginePerson.rawFeatures.headHeightRatio,
            quality: enginePerson.rawFeatures.quality,
            landmarks: enginePerson.landmarks,
            worldLandmarks: enginePerson.worldLandmarks,
            frameWidth: canvas.width,
            frameHeight: canvas.height,
            minVisibility: p.postureThresholds.minVisibility,
          })
        }
      }

      // ระหว่าง calibrate เก็บ raw features เท่านั้น และต้องตรวจพบคนเดียวพอดีเพื่อไม่ให้ตัวอย่างปนกัน
      if (calibrationRef.current && engineResult.people.length === 1) {
        calibrationRef.current.samples.push(engineResult.people[0].rawFeatures)
      }

      const addPersonName = (trackId: string, event: AlertEvent): AlertEvent => {
        const person = personStatesRef.current.get(trackId)
        if (!person) return event
        const plainLabel = person.identityName ?? `คนที่ ${person.slotNumber}`
        return {
          ...event,
          personName: p.multiCameraMode ? `${p.cameraLabel} • ${plainLabel}` : plainLabel,
        }
      }

      for (const item of engineResult.startedEvents) {
        const startedEvent = addPersonName(item.trackId, item.event)
        if (startedEvent.personName) {
          postureEventPersonNameRef.current.set(startedEvent.id, startedEvent.personName)
        }
        p.onAlertStart(startedEvent)
        if (p.soundEnabled) playAlertBeep()
      }
      for (const item of engineResult.endedEvents) {
        const rememberedName = postureEventPersonNameRef.current.get(item.event.id)
        const endedEvent = rememberedName
          ? { ...item.event, personName: rememberedName }
          : addPersonName(item.trackId, item.event)
        postureEventPersonNameRef.current.delete(item.event.id)
        p.onAlertEnd(endedEvent)
      }
      for (const item of engineResult.fallEvents) {
        const fallEvent = addPersonName(item.trackId, item.event)
        p.onAlertStart(fallEvent)
        p.onFallDetected(fallEvent)
        if (p.soundEnabled) playFallAlarm()
      }

      // pose track ที่ stale ถูกลบใน engine แล้ว; ปิด state ของ face pipeline ที่ยังผูกกับ track เดิมก่อนลบ UI state
      for (const trackId of engineResult.removedTrackIds) {
        const person = personStatesRef.current.get(trackId)
        if (!person) continue
        if (person.fatigueState.activeEvent) {
          p.onAlertEnd({ ...person.fatigueState.activeEvent, endedAt: now })
        }
        if (person.distanceState.activeEvent) {
          p.onAlertEnd({ ...person.distanceState.activeEvent, endedAt: now })
        }
        personStatesRef.current.delete(trackId)
      }

      const calibration = calibrationRef.current
      if (calibration && now >= calibration.endsAt) {
        calibrationRef.current = null
        setIsCalibratingPosture(false)

        const baseline = computeBaseline(calibration.samples, now)
        if (baseline) {
          try {
            savePostureBaseline(p.cameraId, baseline)
            setPostureBaseline(baseline)
            setCalibrationMessage('Calibrate ท่านั่งสำเร็จ ✓ ระบบจะเทียบกับท่านี้เป็นหลัก')
          } catch {
            setCalibrationMessage('Calibrate ไม่สำเร็จ — เบราว์เซอร์ไม่สามารถบันทึก baseline ของกล้องนี้ได้')
          }
        } else {
          setCalibrationMessage('Calibrate ไม่สำเร็จ — ต้องมีคนเดียวในเฟรมและเห็นหัว+ไหล่ชัดเจน ลองใหม่อีกครั้ง')
        }
      }

      if (engineResult.breakDue) {
        p.onBreakDue(
          getBreakReminderLabel(p.multiCameraMode, p.cameraLabel),
          engineResult.breakDue.continuousMinutes,
        )
        if (p.soundEnabled) playAlertBeep()
      }

      recomputeAlertUi()
    }

    const ctx = canvas.getContext('2d')
    if (ctx) drawOverlay(ctx, latestPoseResultRef.current, canvas.width, canvas.height)

    maybeEmitPeopleSummary(now, peopleChanged)

    // --- ตรวจใบหน้าแบบ throttled (fatigue / distance / identity) ---
    if (
      p.faceFeaturesEnabled &&
      faceStatus === 'ready' &&
      !sourceErrorStickyRef.current &&
      now - lastFaceRunAtRef.current >= FACE_DETECT_INTERVAL_MS
    ) {
      lastFaceRunAtRef.current = now
      void runFaceDetection(source, now)
    }
  }, [drawOverlay, faceStatus, landmarkerRef, runFaceDetection, recomputeAlertUi, maybeEmitPeopleSummary])

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

  // ปุ่ม Calibrate/ลงทะเบียน ทำงานกับ "ใบหน้าที่ใหญ่สุดในเฟรม ณ ขณะนี้" (คนที่นั่งใกล้กล้องที่สุด) —
  // ยังไม่มี UI ให้เลือกว่าจะ calibrate/ลงทะเบียนให้คนไหนเจาะจงเมื่อมีหลายคนพร้อมกัน
  const handleCalibrate = useCallback(() => {
    const face = primaryFaceRef.current
    if (face) onCalibrateDistance(face.detection.box.width)
  }, [onCalibrateDistance])

  const handleCalibratePosture = useCallback(() => {
    calibrationRef.current = {
      endsAt: Date.now() + POSTURE_CALIBRATION_MS,
      samples: [],
    }
    setIsCalibratingPosture(true)
    setCalibrationMessage('กำลัง Calibrate... นั่งท่าที่ดีที่สุดค้างไว้ 3 วินาที')
  }, [])

  const handleEnroll = useCallback(() => {
    const face = primaryFaceRef.current
    const name = enrollName.trim()
    if (!face || !name || !enrollConsentChecked) return
    setEnrollStatus('saving')
    setEnrollError(null)
    enrollPerson(name, face.descriptor, enrollConsentChecked)
      .then((person) => {
        onPersonEnrolled(person)
        setEnrollName('')
        setEnrollConsentChecked(false)
        setEnrollStatus('idle')
      })
      .catch((err: unknown) => {
        setEnrollStatus('error')
        setEnrollError(err instanceof Error ? err.message : 'ลงทะเบียนใบหน้าไม่สำเร็จ')
      })
  }, [enrollName, enrollConsentChecked, onPersonEnrolled])

  return (
    <div className="posture-monitor">
      <div className={`camera-frame ${isAlerting ? 'alerting' : ''}`}>
        {cameraSource.kind === 'local' ? (
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            onUserMediaError={() => setCameraError('เปิดกล้องไม่สำเร็จ - กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์ หรือลองเลือกกล้องเครื่องอื่น')}
            videoConstraints={{
              width: 640,
              height: 480,
              facingMode: 'user',
              ...(cameraSource.deviceId ? { deviceId: { exact: cameraSource.deviceId } } : {}),
            }}
            className="camera-video"
          />
        ) : (
          // กล้อง IP แบบ MJPEG: เบราว์เซอร์แสดงสตรีมนี้ผ่าน <img> ได้ตรงๆ ไม่ต้องมี backend
          // key={ipUrl} บังคับให้ element ถูกสร้างใหม่ตอนเปลี่ยน URL กันภาพเก่าค้าง
          <img
            key={cameraSource.ipUrl}
            ref={imgRef}
            src={cameraSource.ipUrl || undefined}
            alt="ภาพจากกล้อง IP"
            onError={() =>
              setCameraError('เชื่อมต่อกล้อง IP ไม่สำเร็จ - ตรวจสอบว่า URL ถูกต้อง กล้องเปิดอยู่ และอยู่ในเครือข่ายเดียวกับเครื่องนี้')
            }
            className="camera-video"
          />
        )}
        <canvas
          ref={canvasRef}
          className="camera-overlay"
          style={{ transform: cameraSource.kind === 'local' ? 'scaleX(-1)' : undefined }}
        />

        {cameraSource.kind === 'ip-mjpeg' && !cameraSource.ipUrl && (
          <div className="camera-status-banner">กรอก URL กล้อง IP แล้วกด "เชื่อมต่อ" ในช่อง "แหล่งภาพกล้อง"</div>
        )}
        {poseStatus === 'loading' && <div className="camera-status-banner">กำลังโหลดโมเดล Pose Landmarker...</div>}
        {poseStatus === 'error' && <div className="camera-status-banner banner-error">{poseError}</div>}
        {faceStatus === 'error' && <div className="camera-status-banner banner-error">{faceError}</div>}
        {cameraError && <div className="camera-status-banner banner-error">{cameraError}</div>}
        {isAlerting && <div className="camera-status-banner banner-alert">⚠ {alertBannerText}</div>}
      </div>
      <p className="current-issue">
        ตรวจพบในเฟรม: {peopleCount} คน (รองรับสูงสุด {maxPeopleFor(detectionMode)} คน) · Pose ใช้เวลา ~{poseInferenceMs} ms/ครั้ง
      </p>
      <button
        type="button"
        className="secondary-button"
        onClick={handleCalibratePosture}
        disabled={isCalibratingPosture}
      >
        {isCalibratingPosture
          ? 'กำลัง Calibrate...'
          : postureBaseline
            ? 'Calibrate ท่านั่งดีใหม่'
            : 'Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)'}
      </button>
      {calibrationMessage && <p className="panel-note">{calibrationMessage}</p>}
      {faceFeaturesEnabled && (
        <>
          <button type="button" className="secondary-button" onClick={handleCalibrate} disabled={!hasFaceSignal}>
            Calibrate ระยะนั่ง (ของคนที่ใกล้กล้องที่สุด) เป็นค่ามาตรฐาน
          </button>
          <div className="enroll-row">
            <input
              type="text"
              placeholder="ชื่อพนักงาน (ลงทะเบียนให้คนที่ใกล้กล้องที่สุด)"
              value={enrollName}
              onChange={(e) => setEnrollName(e.target.value)}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={handleEnroll}
              disabled={!hasFaceSignal || !enrollName.trim() || !enrollConsentChecked || enrollStatus === 'saving'}
            >
              {enrollStatus === 'saving' ? 'กำลังบันทึก...' : 'ลงทะเบียนใบหน้า'}
            </button>
          </div>
          <label className="settings-row settings-checkbox consent-checkbox">
            <span>ยืนยันว่าได้ขอความยินยอมจากพนักงานคนนี้แล้ว ก่อนเก็บข้อมูลใบหน้า (PDPA)</span>
            <input
              type="checkbox"
              checked={enrollConsentChecked}
              onChange={(e) => setEnrollConsentChecked(e.target.checked)}
            />
          </label>
          {enrollStatus === 'error' && enrollError && <p className="panel-note panel-warning">{enrollError}</p>}
        </>
      )}
      <p className="privacy-note">วิดีโอทั้งหมดประมวลผลในเบราว์เซอร์นี้เท่านั้น ไม่มีการส่งภาพ/วิดีโอออกจากเครื่อง</p>
    </div>
  )
}
