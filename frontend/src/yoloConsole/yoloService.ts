// ตัวเชื่อม yolo-backend: REST สำหรับควบคุม/ตั้งค่า/รายงาน + /ws/live สำหรับสถานะและเฟรมสด
// พอร์ตจากต้นแบบ Cam-Well-YoLo-ByteTrack/frontend/src/lib/{api,live,camera}.ts
// ทุกคำขอไปที่ /yolo/... ซึ่ง Vite proxy ต่อไปยัง yolo-backend (ดู vite.config.ts) — แยก prefix จาก /api ของ camwell-backend
import type { FloorSettings, Heat, Report, ReportRow, SessionStatus, Snapshot, SourceSpec, Upload } from './types'

const BASE = '/yolo'
const RECONNECT_MS = 1000
const PANEL_INTERVAL_MS = 250
/** รอผลของเฟรมก่อนส่งเฟรมถัดไปจากกล้อง แต่ไม่เกินเท่านี้ */
const FRAME_TIMEOUT_MS = 1000

export interface LiveState {
  /** ต่อ /ws/live อยู่หรือไม่ */
  connected: boolean
  status: SessionStatus
  /** ข้อมูลรายเฟรม — ให้ canvas อ่านผ่าน getState() เท่านั้น component ห้าม subscribe ตรงๆ */
  snapshot: Snapshot | null
  /** ภาพของเฟรมเดียวกับ snapshot */
  frame: ImageBitmap | null
  /** backend ส่ง heatmap มาทุก 10 เฟรม จึงเก็บค่าล่าสุดแยกจาก snapshot */
  heat: Heat | null
  /** snapshot ล่าสุดแบบหน่วงไม่เกิน 4 ครั้ง/วินาที สำหรับแผงตัวเลขของ React */
  panel: Snapshot | null
  /** แหล่งภาพล่าสุดที่สั่งเริ่ม — ใช้กับปุ่ม "เริ่มใหม่" */
  lastSpec: SourceSpec | null
}

export type SessionAction = 'pause' | 'resume' | 'stop'

export const ACTIVE_STATES: readonly SessionStatus['state'][] = ['starting', 'running', 'paused', 'holding']

// ---------------------------------------------------------------- REST

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new Error('เชื่อมต่อ yolo-backend ไม่ได้ — เปิดด้วย npm run dev:yolo ที่ root ของโปรเจกต์')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail
    const validation = Array.isArray(detail) ? String(detail[0]?.msg ?? '').replace('Value error, ', '') : null
    if (res.status === 502 || res.status === 504) throw new Error('yolo-backend ไม่ตอบ — เปิดด้วย npm run dev:yolo ที่ root ของโปรเจกต์')
    throw new Error(typeof detail === 'string' ? detail : validation || `คำขอล้มเหลว (${res.status})`)
  }
  return res.json() as Promise<T>
}

const sendJson = <T>(path: string, body: unknown, method = 'POST') =>
  request<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// ---------------------------------------------------------------- live state

let state: LiveState = {
  connected: false,
  status: { type: 'status', state: 'idle' },
  snapshot: null,
  frame: null,
  heat: null,
  panel: null,
  lastSpec: null,
}
const listeners = new Set<() => void>()

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

let socket: WebSocket | null = null
let pending: Snapshot | null = null
let shownFrame = -1
let runId = 0
let lastPanelAt = 0
let panelTimer: ReturnType<typeof setTimeout> | null = null

/** อัปเดตแผงตัวเลขไม่เกินหนึ่งครั้งต่อช่วง และต้องมีครั้งสุดท้ายเสมอ — ภาพนิ่งส่งมาเฟรมเดียว */
function schedulePanel() {
  if (panelTimer) return
  panelTimer = setTimeout(() => {
    panelTimer = null
    lastPanelAt = performance.now()
    set({ panel: state.snapshot })
  }, Math.max(0, lastPanelAt + PANEL_INTERVAL_MS - performance.now()))
}

function showFrame(snapshot: Snapshot, blob: Blob, run: number) {
  void createImageBitmap(blob)
    .then((bitmap) => {
      // ถอดรหัสภาพเป็น async เฟรมเก่าจึงอาจเสร็จหลังเฟรมใหม่
      if (run !== runId || snapshot.frame < shownFrame) {
        bitmap.close()
        return
      }
      shownFrame = snapshot.frame
      const previous = state.frame
      set({ frame: bitmap, snapshot, heat: snapshot.heat ?? state.heat })
      previous?.close()
      schedulePanel()
    })
    .catch(() => undefined) // เฟรมเสียหนึ่งเฟรม ข้ามไป เฟรมถัดไปจะมาแทน
}

function clearFrames() {
  runId += 1
  shownFrame = -1
  pending = null
  state.frame?.close()
  set({ frame: null, snapshot: null, heat: null, panel: null })
}

function connect() {
  if (socket) return
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${scheme}://${location.host}${BASE}/ws/live`)
  ws.binaryType = 'blob'
  socket = ws
  ws.onopen = () => set({ connected: true })
  ws.onclose = () => {
    socket = null
    set({ connected: false })
    setTimeout(connect, RECONNECT_MS)
  }
  ws.onmessage = (event: MessageEvent<string | Blob>) => {
    // backend ส่ง snapshot (JSON) ตามด้วยภาพ JPEG (binary) ของเฟรมเดียวกัน
    if (typeof event.data !== 'string') {
      if (pending) showFrame(pending, event.data, runId)
      pending = null
      return
    }
    const message = JSON.parse(event.data) as SessionStatus | Snapshot
    if (message.type === 'snapshot') {
      pending = message
      return
    }
    // run ใหม่เริ่มนับเฟรมใหม่ และต้องไม่แสดงเฟรมสุดท้ายของแหล่งเดิม
    if (message.state === 'starting') clearFrames()
    set({ status: message })
  }
}

function sendFrame(data: Blob) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(data)
}

// ---------------------------------------------------------------- browser camera

let pumpId = 0
let stream: MediaStream | null = null
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** รอจน backend ส่งผลของเฟรมกลับมา จึงไม่ส่งเฟรมเร็วกว่าที่ backend วิเคราะห์ทัน */
function nextResult() {
  return new Promise<void>((resolve) => {
    const before = state.snapshot
    const unsubscribe = subscribe(() => {
      if (state.snapshot !== before) done()
    })
    const timer = setTimeout(done, FRAME_TIMEOUT_MS)
    function done() {
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
  })
}

function stopCamera() {
  pumpId += 1
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

async function openCamera() {
  stopCamera()
  if (!navigator.mediaDevices) throw new Error('เบราว์เซอร์อนุญาตกล้องเฉพาะเมื่อเปิดผ่าน localhost หรือ https')
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
  } catch (err) {
    const name = (err as DOMException).name
    if (name === 'NotAllowedError') throw new Error('ไม่ได้รับอนุญาตให้ใช้กล้อง')
    if (name === 'NotFoundError') throw new Error('ไม่พบกล้องในเครื่องนี้')
    throw err
  }
}

/** ส่งเฟรมจากกล้องให้ backend ทีละเฟรมจนกว่า session ของกล้อง browser จะจบ */
async function pumpCamera() {
  if (!stream) return
  const id = (pumpId += 1)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  await video.play()
  const canvas = document.createElement('canvas')
  let seenRunning = false
  while (id === pumpId) {
    const { state: sessionState, source } = state.status
    const ours = source?.kind === 'browser' && (sessionState === 'starting' || sessionState === 'running' || sessionState === 'paused')
    if (ours) seenRunning = true
    if (!ours && seenRunning) {
      stopCamera()
      return
    }
    if (!ours || sessionState !== 'running' || !video.videoWidth) {
      await sleep(100)
      continue
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (blob && id === pumpId) sendFrame(blob)
    await nextResult()
  }
}

// ---------------------------------------------------------------- public API

function subscribe(listener: () => void) {
  connect()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function startSession(spec: SourceSpec) {
  if (spec.kind !== 'browser') stopCamera()
  set({ lastSpec: spec })
  return sendJson<SessionStatus>('/api/session', spec)
}

export const yoloService = {
  getState: () => state,
  subscribe,
  startSession,

  /** เปิดกล้องของเครื่องนี้ แล้วส่งเฟรมให้ backend วิเคราะห์ */
  async startCamera() {
    await openCamera()
    const status = await startSession({ kind: 'browser' })
    void pumpCamera()
    return status
  },

  sessionAction: (action: SessionAction) => request<SessionStatus>(`/api/session/${action}`, { method: 'POST' }),

  async upload(file: File) {
    const body = new FormData()
    body.append('file', file)
    return request<Upload>('/api/uploads', { method: 'POST', body })
  },

  getSettings: () => request<FloorSettings>('/api/settings'),
  getDefaultSettings: () => request<FloorSettings>('/api/settings/defaults'),
  putSettings: (settings: FloorSettings) => sendJson<FloorSettings>('/api/settings', settings, 'PUT'),
  listReports: () => request<ReportRow[]>('/api/reports'),
  getReport: (id: string) => request<Report>(`/api/reports/${encodeURIComponent(id)}`),
  csvUrl: (id: string) => `${BASE}/api/reports/${encodeURIComponent(id)}/tracks.csv`,
}
