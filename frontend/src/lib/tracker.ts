// Tracker ตำแหน่งแบบง่าย: จับคู่ "ตำแหน่งที่ตรวจพบในเฟรมนี้" กับ "track เดิมจากเฟรมก่อนหน้า"
// ด้วยระยะทางที่ใกล้ที่สุด (nearest-neighbor) เพื่อให้แต่ละคนมี trackId คงที่ข้ามเฟรม — จำเป็นเพราะทั้ง
// Pose Landmarker และ face-api คืนค่าเป็น "array ตามลำดับที่เจอในเฟรมนั้นๆ" ซึ่งลำดับ/ดัชนีเปลี่ยนไปมา
// ทุกเฟรมได้ ไม่สามารถใช้ index เป็นตัวระบุตัวตนคนข้ามเฟรมได้
//
// ออกแบบให้เรียบง่ายพอสำหรับกล้องตั้งโต๊ะ/ออฟฟิศ (ไม่กี่คนในเฟรม ไม่มีการเคลื่อนที่เร็ว) ไม่ใช่ tracker
// ระดับ production สำหรับงาน surveillance ทั่วไป

export interface Point2D {
  x: number
  y: number
}

export interface TrackMatch<T> {
  id: string
  data: T
}

export interface TrackerUpdateResult<T> {
  matches: TrackMatch<T>[]
  /** trackId ที่เพิ่งถูกลบในรอบนี้ เพราะไม่เจอตัวต่อเนื่องนานเกิน staleAfterMs — ใช้เคลียร์ state ที่ผูกกับคนนั้น */
  removedIds: string[]
}

export interface TrackerOptions {
  /** ระยะทางสูงสุด (หน่วยเดียวกับ position ที่ส่งเข้ามา) ที่ยังถือว่าเป็นคนเดิม */
  maxDistance: number
  /** ไม่เจอคนนี้ต่อเนื่องนานเท่านี้ (ms) แล้วถือว่าหายไปจากเฟรมจริงๆ (ลบ track ทิ้ง) */
  staleAfterMs: number
}

interface InternalTrack<T> {
  id: string
  position: Point2D
  lastSeenAt: number
  data: T
}

export class PositionTracker<T> {
  private tracks = new Map<string, InternalTrack<T>>()
  private nextNumericId = 1
  private prefix: string
  private options: TrackerOptions

  constructor(prefix: string, options: TrackerOptions) {
    this.prefix = prefix
    this.options = options
  }

  update(detections: { position: Point2D; data: T }[], now: number): TrackerUpdateResult<T> {
    const unmatched = new Set(this.tracks.keys())
    const matches: TrackMatch<T>[] = []

    for (const det of detections) {
      let bestId: string | null = null
      let bestDist = this.options.maxDistance
      for (const id of unmatched) {
        const track = this.tracks.get(id)
        if (!track) continue
        const dist = Math.hypot(track.position.x - det.position.x, track.position.y - det.position.y)
        if (dist < bestDist) {
          bestDist = dist
          bestId = id
        }
      }

      if (bestId) {
        unmatched.delete(bestId)
        const track = this.tracks.get(bestId)!
        track.position = det.position
        track.lastSeenAt = now
        track.data = det.data
        matches.push({ id: bestId, data: det.data })
      } else {
        const id = `${this.prefix}-${this.nextNumericId++}`
        this.tracks.set(id, { id, position: det.position, lastSeenAt: now, data: det.data })
        matches.push({ id, data: det.data })
      }
    }

    const removedIds: string[] = []
    for (const [id, track] of this.tracks) {
      if (now - track.lastSeenAt > this.options.staleAfterMs) {
        this.tracks.delete(id)
        removedIds.push(id)
      }
    }

    return { matches, removedIds }
  }
}
