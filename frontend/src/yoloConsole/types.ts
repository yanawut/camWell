// รูปแบบข้อมูลของ yolo-backend (REST + /ws/live) — ต้องตรงกับ yolo-backend/app/snapshot.py, settings.py, reports.py
// คัดลอกมาจาก new-camwell/frontend/src/lib/types.ts

export type Point = [number, number]
export type Box = [number, number, number, number]
export type PersonState = 'sitting' | 'standing' | 'walking'
export type ObjectClass = 'chair' | 'table' | 'monitor' | 'laptop'

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
  | { kind: 'video'; upload_id: string }
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
