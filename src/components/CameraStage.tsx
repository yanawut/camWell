import { useCallback, useEffect, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'
import type { NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { usePoseLandmarker } from '../hooks/usePoseLandmarker'
import { useFaceApiModels } from '../hooks/useFaceApiModels'
import { analyzePosture, POSTURE_LABELS_TH, type PostureAnalysisResult } from '../lib/postureAnalysis'
import { analyzeFatigueFrame, FATIGUE_LABELS_TH } from '../lib/fatigueAnalysis'
import { analyzeDistanceFrame, DISTANCE_LABELS_TH } from '../lib/distanceAnalysis'
import { getBreakReminderLabel, initialBreakState, stepBreakReminder } from '../lib/breakReminder'
import { initialSustainedState, stepSustainedAlert, type SustainedAlertState } from '../lib/sustainedAlertMachine'
import { PositionTracker, type Point2D } from '../lib/tracker'
import { MAX_TRACKED_PEOPLE } from '../lib/multiPerson'
import { pruneHistory, computeDropRatio, shouldAlertLeftFrame, type TorsoReading } from '../lib/fallDetection'
import { nextCachedPoseResult } from '../lib/poseResultCache'
import { enrollPerson, identifyFace } from '../services/faceEnrollment'
import { playAlertBeep, playFallAlarm } from '../services/beep'
import type { PostureThresholds } from '../types/posture'
import type { BreakReminderState, BreakThresholds, DistanceThresholds, FatigueThresholds } from '../types/wellbeing'
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
const IDENTITY_RECHECK_INTERVAL_MS = 3000 // identity ไม่ต้องเช็คถี่เท่า fatigue/distance
const PEOPLE_SUMMARY_INTERVAL_MS = 500 // ส่งสรุปสถานะ "ใครอยู่บ้าง" ขึ้นไปแสดงผลไม่ต้องทุกเฟรม กัน re-render ถี่เกิน

// Tracker จับคู่ "คนในเฟรมนี้" กับ "คนในเฟรมก่อนหน้า" ด้วยตำแหน่งจุดกึ่งกลางไหล่ (normalized 0-1) —
// ใช้เป็นตัวตั้งหลักของแต่ละคน (trackId) ส่วน face-api จะถูก "เชื่อม" เข้ากับ track นี้อีกทีตามความใกล้ของตำแหน่ง
// (ดู linkFaceToPersonId ด้านล่าง) เพื่อให้ fatigue/distance/identity ผูกกับคนคนเดียวกับที่ตรวจท่านั่งอยู่
const POSE_TRACK_MAX_DISTANCE = 0.3 // สัดส่วนของเฟรม (0-1) ยิ่งมากยิ่งทนต่อการขยับเร็ว แต่เสี่ยงสลับคนผิด
const POSE_TRACK_STALE_MS = 4000 // หายไปจากเฟรมนานเท่านี้ถือว่าออกไปแล้วจริงๆ (ไม่ใช่แค่หันหน้าหนีชั่วครู่)

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
  postureState: SustainedAlertState
  fatigueState: SustainedAlertState
  distanceState: SustainedAlertState
  yawnOpenSince: number | null
  yawnTimestamps: number[]
  identityName: string | null
  postureStatusLabel: string
  /** ตำแหน่งจุดกึ่งกลางไหล่ล่าสุด เป็นพิกเซลของเฟรม (ไม่ใช่ normalized) ใช้จับคู่กับใบหน้าที่ตรวจพบ */
  anchorPx: Point2D
  /** ประวัติตำแหน่ง Y ของจุดกึ่งกลางไหล่ (normalized 0-1) ช่วงสั้นๆ ล่าสุด ใช้ตรวจจับ "ร่วงตัวเร็ว" สำหรับฟีเจอร์หกล้ม */
  torsoYHistory: TorsoReading[]
  /** เวลาที่แจ้งเตือนหกล้มครั้งล่าสุดของคนนี้ (ms, Date.now()) ใช้กันแจ้งซ้ำถี่เกิน (cooldown) */
  lastFallAlertAt: number
  /** เวลาที่ตรวจพบ "ร่วงตัวเร็ว" ครั้งล่าสุด (ms, Date.now()) ไม่ว่าจะลำตัวราบหรือไม่ — ใช้เชื่อมกับเหตุการณ์
   * "หายไปจากเฟรมกะทันหัน" ตอน track หลุด (ดูใน removedIds cleanup) เพื่อตรวจกรณีตกจากเก้าอี้จนหลุดมุมกล้อง */
  lastRapidDropAt: number
  /** เวลาที่เห็นคนนี้ในเฟรมครั้งล่าสุด (ms, Date.now()) ใช้เทียบกับ lastRapidDropAt ตอน track หลุด */
  lastSeenAt: number
}

interface Props {
  postureThresholds: PostureThresholds
  fatigueThresholds: FatigueThresholds
  distanceThresholds: DistanceThresholds
  breakThresholds: BreakThresholds
  fallThresholds: FallThresholds
  soundEnabled: boolean
  faceFeaturesEnabled: boolean
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

  const { landmarkerRef, status: poseStatus, error: poseError } = usePoseLandmarker()
  const { status: faceStatus, error: faceError } = useFaceApiModels()

  const lastVideoTimeRef = useRef(-1)
  const latestPoseResultRef = useRef<PoseLandmarkerResult | null>(null)
  // ตัวจับเวลาเตือนพักระดับกล้อง ไม่ผูกกับ lifetime ของ person track
  const deskBreakStateRef = useRef<BreakReminderState>(initialBreakState)
  const lastFaceRunAtRef = useRef(0)
  const lastPeopleUpdateAtRef = useRef(0)
  const faceBusyRef = useRef(false)
  const identityLastCheckRef = useRef<Map<string, number>>(new Map())
  // กล้อง IP ต่างโดเมน/พอร์ตกับเว็บแอป (cross-origin) มักติดข้อจำกัด CORS ของเบราว์เซอร์ ทำให้อ่านพิกเซลภาพ
  // ไปประมวลผล AI ไม่ได้ (ภาพยังแสดงผลได้ปกติ แต่ canvas/WebGL จะโยน SecurityError ตอนอ่านข้อมูล) — ถ้าเจอ
  // ปัญหานี้ครั้งหนึ่งจะหยุดเรียก AI ซ้ำทุกเฟรม (กัน error สแปม) จนกว่าจะเปลี่ยนแหล่งกล้อง
  const sourceErrorStickyRef = useRef(false)

  // แหล่งความจริงหลักของ "ใครอยู่ในเฟรมบ้าง" — key คือ trackId จาก poseTracker
  const personStatesRef = useRef<Map<string, PersonState>>(new Map())
  const poseTrackerRef = useRef(
    // prefix ด้วย cameraId กัน trackId ชนกับกล้องตัวอื่นตอนต่อหลายกล้องพร้อมกัน (grid)
    new PositionTracker<{ landmarks: NormalizedLandmark[]; analysis: PostureAnalysisResult }>(`pose-${cameraId}`, {
      maxDistance: POSE_TRACK_MAX_DISTANCE,
      staleAfterMs: POSE_TRACK_STALE_MS,
    }),
  )
  const nextSlotRef = useRef(1)

  // ใบหน้าทั้งหมดที่ตรวจพบรอบล่าสุด (สำหรับวาดกรอบ + ปุ่ม Calibrate/ลงทะเบียนใช้ "ใบหน้าใหญ่สุด")
  const latestFaceResultsRef = useRef<FaceResult[]>([])
  const primaryFaceRef = useRef<FaceResult | null>(null)

  const [isAlerting, setIsAlerting] = useState(false)
  const [alertBannerText, setAlertBannerText] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [peopleCount, setPeopleCount] = useState(0)
  // primaryFaceRef อัปเดตทุก throttle tick แต่ ref ไม่ทำให้ re-render — ใช้ state คู่กันแค่สำหรับ
  // เปิด/ปิดปุ่ม Calibrate/ลงทะเบียน ให้ตรงกับความเป็นจริง
  const [hasFaceSignal, setHasFaceSignal] = useState(false)
  const [enrollName, setEnrollName] = useState('')
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
    enrolledPeople,
    baselineFaceWidthPx,
    cameraSource,
    cameraLabel,
    multiCameraMode,
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
      enrolledPeople,
      baselineFaceWidthPx,
      cameraSource,
      cameraLabel,
      multiCameraMode,
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
      if (person.postureState.activeEvent) labels.push(`${name}: ${person.postureStatusLabel}`)
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

      // จำกัดจำนวนไม่ให้เกิน MAX_TRACKED_PEOPLE โดยเลือกใบหน้าที่ใหญ่สุด (ใกล้กล้องที่สุด) ก่อน
      const limited = [...results].sort((a, b) => b.detection.box.width - a.detection.box.width).slice(0, MAX_TRACKED_PEOPLE)

      latestFaceResultsRef.current = limited
      primaryFaceRef.current = limited[0] ?? null
      setHasFaceSignal(!!limited[0])

      const p = propsRef.current
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
    // กล้อง IP (MJPEG ผ่าน <img>): ไม่มีสัญญาณ "เฟรมใหม่" ที่เชื่อถือได้ เลยประมวลผลทุกรอบไปเลย
    // ถ้าเคยเจอปัญหา CORS กับแหล่งภาพนี้มาแล้ว หยุดลองซ้ำทุกเฟรม (กัน error สแปม) จนกว่าจะเปลี่ยนแหล่งกล้อง
    const shouldProcessPose =
      !!landmarker && !sourceErrorStickyRef.current && (!isVideoSource || source.currentTime !== lastVideoTimeRef.current)

    if (shouldProcessPose && landmarker) {
      if (isVideoSource) lastVideoTimeRef.current = source.currentTime
      try {
        poseResult = landmarker.detectForVideo(source, performance.now())
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

      // คำนวณตำแหน่ง anchor (จุดกึ่งกลางไหล่ซ้าย-ขวา) ของแต่ละคนที่ตรวจพบ สำหรับส่งเข้า tracker
      const detections = (poseResult.landmarks ?? [])
        .map((landmarks) => {
          const analysis = analyzePosture(landmarks, p.postureThresholds)
          if (analysis.issue === 'no_person') return null
          const left = landmarks[11]
          const right = landmarks[12]
          const anchorNorm: Point2D | undefined =
            left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : landmarks[0]
          if (!anchorNorm) return null
          return { position: anchorNorm, data: { landmarks, analysis } }
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)

      const { matches, removedIds } = poseTrackerRef.current.update(
        detections.map((d) => ({ position: d.position, data: d.data })),
        now,
      )

      // คนที่หายไปจากเฟรมนานเกิน POSE_TRACK_STALE_MS — ปิด event ค้างของเขา แล้วลบ state ต่อคนทิ้ง
      // ตัวจับเวลาเตือนพักอยู่ระดับกล้องแยกต่างหาก จึงไม่หายตาม person track
      if (removedIds.length > 0) peopleChanged = true
      for (const id of removedIds) {
        const person = personStatesRef.current.get(id)
        if (!person) continue
        if (person.postureState.activeEvent) p.onAlertEnd({ ...person.postureState.activeEvent, endedAt: now })
        if (person.fatigueState.activeEvent) p.onAlertEnd({ ...person.fatigueState.activeEvent, endedAt: now })
        if (person.distanceState.activeEvent) p.onAlertEnd({ ...person.distanceState.activeEvent, endedAt: now })

        // เพิ่งร่วงตัวเร็วแล้วหายไปจากเฟรมทันที (ไม่ทันเห็นลำตัวราบเพราะหลุดมุมกล้องไปก่อน) — เข้าข่าย
        // "หกล้ม/ตกจากเก้าอี้จนหลุดจากเฟรม" เช่น ตกจากเก้าอี้ไปด้านหลัง/ด้านข้างจนกล้องมองไม่เห็นตัวแล้ว
        if (shouldAlertLeftFrame(person.lastSeenAt, person.lastRapidDropAt, p.fallThresholds.disappearGraceMs)) {
          const plainLabel = person.identityName ?? `คนที่ ${person.slotNumber}`
          const fallEvent: AlertEvent = {
            id: `fall-left-${id}-${now}`,
            category: 'fall',
            type: 'fall_suspected_left_frame',
            startedAt: now,
            endedAt: now,
            personName: p.multiCameraMode ? `${p.cameraLabel} • ${plainLabel}` : plainLabel,
            metrics: {},
          }
          p.onAlertStart(fallEvent)
          p.onFallDetected(fallEvent)
          if (p.soundEnabled) playFallAlarm()
        }

        personStatesRef.current.delete(id)
      }

      for (const match of matches) {
        const { landmarks, analysis } = match.data

        let person = personStatesRef.current.get(match.id)
        if (!person) {
          peopleChanged = true
          person = {
            trackId: match.id,
            slotNumber: nextSlotRef.current++,
            postureState: initialSustainedState,
            fatigueState: initialSustainedState,
            distanceState: initialSustainedState,
            yawnOpenSince: null,
            yawnTimestamps: [],
            identityName: null,
            postureStatusLabel: POSTURE_LABELS_TH.no_person,
            anchorPx: { x: 0, y: 0 },
            torsoYHistory: [],
            lastFallAlertAt: 0,
            lastRapidDropAt: 0,
            lastSeenAt: now,
          }
          personStatesRef.current.set(match.id, person)
        }

        const left = landmarks[11]
        const right = landmarks[12]
        person.lastSeenAt = now
        const normalizedTorsoY = left && right ? (left.y + right.y) / 2 : null
        if (left && right && normalizedTorsoY !== null) {
          person.anchorPx = { x: ((left.x + right.x) / 2) * canvas.width, y: normalizedTorsoY * canvas.height }
        }

        person.postureStatusLabel = POSTURE_LABELS_TH[analysis.issue]

        // ชื่อที่จะโผล่ใน EventLog/banner หกล้ม/ข้อความเตือนพัก (รวมข้ามกล้อง) — แปะชื่อกล้องนำหน้าด้วยถ้ามี
        // มากกว่า 1 กล้องเชื่อมต่ออยู่ (กันข้อความรกตอนมีกล้องเดียว)
        const plainLabel = person.identityName ?? `คนที่ ${person.slotNumber}`
        const label = p.multiCameraMode ? `${p.cameraLabel} • ${plainLabel}` : plainLabel

        // --- Fall detection: สัญญาณร่วม "ร่วงตัวเร็ว" (normalized Y ไหล่เปลี่ยนเร็วในหน้าต่างเวลาสั้นๆ)
        // + "ลำตัวใกล้แนวนอน" (torsoAngleDeg จาก analyzePosture) — edge-triggered + cooldown ไม่ใช่ sustained
        // state เหมือนท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ เพราะหกล้มต้องแจ้งทันทีที่เกิด ไม่ใช่รอให้ค้างอยู่นาน
        if (normalizedTorsoY !== null) {
          person.torsoYHistory = pruneHistory(
            [...person.torsoYHistory, { t: now, y: normalizedTorsoY }],
            now,
            p.fallThresholds.dropWindowMs,
          )
          const dropRatio = computeDropRatio(person.torsoYHistory)
          if (dropRatio !== null && dropRatio >= p.fallThresholds.dropRatioThreshold) {
            person.lastRapidDropAt = now
            const isNearHorizontal = analysis.torsoAngleDeg >= p.fallThresholds.fallTorsoAngleDeg
            if (isNearHorizontal && now - person.lastFallAlertAt >= p.fallThresholds.cooldownMs) {
              person.lastFallAlertAt = now
              const fallEvent: AlertEvent = {
                id: `fall-${match.id}-${now}`,
                category: 'fall',
                type: 'fall_detected',
                startedAt: now,
                endedAt: now,
                personName: label,
                metrics: { dropRatio, torsoAngleDeg: analysis.torsoAngleDeg },
              }
              p.onAlertStart(fallEvent)
              p.onFallDetected(fallEvent)
              if (p.soundEnabled) playFallAlarm()
            }
          }
        }

        const postureIssue = analysis.issue === 'no_person' ? 'no_signal' : analysis.issue
        const step = stepSustainedAlert(
          person.postureState,
          { issue: postureIssue, metrics: { neckAngleDeg: analysis.neckAngleDeg, torsoAngleDeg: analysis.torsoAngleDeg, shoulderTiltDeg: analysis.shoulderTiltDeg } },
          now,
          'posture',
          p.postureThresholds.sustainedMs,
          label,
        )
        person.postureState = step.state
        if (step.startedEvent) {
          p.onAlertStart(step.startedEvent)
          if (p.soundEnabled) playAlertBeep()
        }
        if (step.endedEvent) p.onAlertEnd(step.endedEvent)

      }

      // เตือนพักระดับกล้อง: เดินหนึ่งครั้งต่อ pose frame ไม่ใช่หนึ่งครั้งต่อ person track
      const breakStep = stepBreakReminder(deskBreakStateRef.current, matches.length > 0, now, p.breakThresholds)
      deskBreakStateRef.current = breakStep.state
      if (breakStep.shouldRemind) {
        p.onBreakDue(getBreakReminderLabel(p.multiCameraMode, p.cameraLabel), breakStep.continuousMinutes)
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
        ตรวจพบในเฟรม: {peopleCount} คน (รองรับสูงสุด {MAX_TRACKED_PEOPLE} คนพร้อมกัน)
      </p>
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
