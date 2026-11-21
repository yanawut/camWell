// รูปแบบข้อมูลของ yolo-backend (REST + /ws/live) — ต้องตรงกับ yolo-backend/app/snapshot.py, settings.py, reports.py
// คัดลอกมาจาก new-camwell/frontend/src/lib/types.ts

export type Point = [number, number]
export type Box = [number, number, number, number]
export type PersonState = 'sitting' | 'standing' | 'walking'
export type ObjectClass = 'chair' | 'table' | 'monitor' | 'laptop'

export interface LiveFace {
  status: 'pending' | 'known' | 'unknown'
  name: string | null
  score: number
}

export type WellCategory = 'posture' | 'distance' | 'break' | 'fatigue' | 'fall'
export type WellCheck = 'ok' | 'alert' | 'na' | 'off'

export interface LiveAlert {
  id: string
  category: WellCategory
  type: string
  text: string
  person: number
  name: string | null
  startedAt: number
  seconds: number
  moment: boolean
}

export interface LiveWellness {
  checks: Record<WellCategory, WellCheck>
  notes: Partial<Record<WellCategory, string>>
  alerts: LiveAlert[]
  sitMinutes: number | null
  metrics: Record<string, number>
  badFor?: Record<string, number>
  faceAge?: number | null
}

export interface LivePerson {
  id: number
  state: PersonState
  conf: number
  box: Box
  trail: Point[]
  ground: Point
  floor: Point
  floorTrail: Point[]
  speed: number
  zone: string | null
  /** keypoint 17 จุดแบบ COCO [x, y, conf] จาก yolov8-pose — null เมื่อเฟรมนี้ตรวจไม่เจอแต่ยังจำกรอบไว้ */
  kpts?: [number, number, number][] | null
  face?: LiveFace | null
  wellness?: LiveWellness | null
}

export interface LiveObject {
  id: number
  cls: ObjectClass
  conf: number
  box: Box
  seen: boolean
  occupied: boolean
  floor: Point
}

export interface Stats {
  people: number
  sitting: number
  standing: number
  walking: number
  chairsOccupied: number
  chairs: number
  tables: number
  monitors: number
  laptops: number
  maxSpeed: number
  busiestZone: string
  busiestCount: number
  avgDwell: number
  meanConf: number
  activeIds: number
  zoneCounts: Record<string, number>
}

export interface Heat {
  w: number
  h: number
  data: number[]
}

export interface FloorPlan {
  w: number
  d: number
  zones: Record<string, Point[]>
}

export interface Snapshot {
  type: 'snapshot'
  frame: number
  t: number
  size: Point
  fps: number
  procMs: number
  badge: string
  model: string
  people: LivePerson[]
  objects: LiveObject[]
  stats: Stats
  floor: FloorPlan
  heat?: Heat
  /** เฉพาะแหล่งที่มีเส้นเวลา (ไฟล์วิดีโอ): ตำแหน่งของเฟรมนี้ในคลิปและความยาวคลิป เป็นวินาที */
  clip?: { pos: number; duration: number }
  alerts?: LiveAlert[]
}

export type SessionState = 'idle' | 'starting' | 'running' | 'paused' | 'holding' | 'ended' | 'error'
export type SourceKind = 'sim' | 'video' | 'image' | 'browser' | 'go2rtc'

export interface SessionStatus {
  type: 'status'
  state: SessionState
  error?: string | null
  summary?: ReportSummary | null
  source?: { kind: SourceKind; label: string }
  reportIds?: string[]
}

export type SourceSpec =
  | { kind: 'sim'; people?: number; seed?: number; seconds?: number }
  | { kind: 'video'; upload_id: string; loop?: boolean }
  | { kind: 'image'; upload_id: string }
  | { kind: 'browser' }
  | { kind: 'go2rtc'; url: string }

/** x0, y0, x1, y1 in grid cells. */
export type ZoneBox = [number, number, number, number]

export interface Zone {
  name: string
  box: ZoneBox
}

export interface FloorSettings {
  floor_pts: Point[]
  floor_size_m: Point
  /** In the order they were added. They fill the grid exactly. */
  zones: Zone[]
  /** The frame on the picture, normalised: floor_pts plus the points added on its line. Null until a point is added. */
  floor_area?: Point[] | null
}

export interface ReportSummary {
  unique_people: number
  peak_people: number
  person_seconds_by_state: Record<string, number>
  person_seconds_by_zone: Record<string, number>
  max_walking_speed_mps: number
  state_accuracy?: number
  confusion?: Record<string, number>
}

export interface ReportRow {
  id: string
  source: { kind: SourceKind; label: string }
  outcome: string
  started_at: number
  ended_at: number
  frames: number
  summary: ReportSummary
  has_csv: boolean
}

export interface ReportPerson {
  id: number
  first_t: number
  last_t: number
  frames: number
  sitting: number
  standing: number
  walking: number
}

export interface Report extends ReportRow {
  timeline: { t: number; people: number; sitting: number; standing: number; walking: number }[]
  people: ReportPerson[]
}

export interface Upload {
  id: string
  kind: 'video' | 'image'
  name: string
}

export interface FacePerson {
  name: string
  photos: string[]
  consentAt: string | null
}

export interface FaceList {
  engine: string | null
  consent: { version: string; text: string }
  people: FacePerson[]
  threshold: number | null
  defaultThreshold: number | null
}

export interface FacePair {
  a: string
  b: string
  score: number
}

export interface FaceCheck {
  engine: string | null
  pairs: FacePair[]
  closest: Record<string, { name: string; score: number }>
  photos: Record<string, Record<string, number | null>>
}

export interface FaceAdded {
  name: string
  added: number
  problems: string[]
}

export type FacePose = 'center' | 'left' | 'right' | 'up' | 'down'

export interface FaceCaptureResult {
  total: number
  usable: number
  rejected: Record<'no_face' | 'many_faces' | 'small' | 'too_turned' | 'blurry' | 'other_person', number>
  coverage: Record<FacePose, boolean>
  selected: { index: number; box: Box; pose: FacePose; yaw: number; sharpness: number }[]
}

export interface AlertRecord {
  kind: 'alert'
  id: string
  session: string
  camera: string
  person: number
  name: string | null
  category: WellCategory
  type: string
  text: string
  started_at: number
  ended_at: number | null
  seconds: number | null
  worst: Record<string, number>
}

export interface AlertList {
  start: string
  end: string
  alerts: AlertRecord[]
  categories: Record<WellCategory, string>
  types: Record<string, string>
}

export type RiskLevel = 'high' | 'medium' | 'low'

export interface DailyPerson {
  key: string
  label: string
  named: boolean
  cameras: string[]
  segments: number
  first_at: number | null
  last_at: number | null
  present_seconds: number
  sitting_seconds: number
  alert_count: number
  types: { type: string; text: string; category: WellCategory; count: number }[]
  by_category: Record<WellCategory, number>
  longest_sit_minutes: number | null
  fell: boolean
  risk: { score: number; level: RiskLevel; enough: boolean; parts: { posture: number; sitting: number; eyes: number } }
  regions: string[]
  symptoms: string[]
  advice: string[]
  week: { days_seen: number; days_alerted: number } | null
}

export interface DailyReport {
  date: string
  totals: { people: number; segments: number; present_seconds: number; alerts: number } & Record<WellCategory, number>
  risk_counts: Record<RiskLevel, number>
  hourly: ({ hour: number } & Record<WellCategory, number>)[]
  types: { type: string; text: string; category: WellCategory; count: number; percent: number }[]
  people: DailyPerson[]
  cameras: ({ camera: string; segments: number; alerts: number } & Record<WellCategory, number>)[]
  disclaimer: string
  formula: string
}

export type WellnessSettings = Record<string, number | boolean>
