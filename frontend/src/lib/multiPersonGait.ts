// ตัวติดตามหลายคนพร้อมกันสำหรับโหมดท่ายืน & ท่าเดิน (ใช้ PositionTracker แยกข้อมูลรายบุคคลข้ามเฟรม)

import { midOrVisible } from './postureAnalysis'
import { PositionTracker, type Point2D } from './tracker'
import {
  analyzeStandingFront,
  analyzeStandingSide,
  evaluateRombergTest,
  extractRombergSample,
  STANDING_LM,
  type RombergResult,
  type RombergSample,
  type StandingFinding,
  type StandingFrontMetrics,
  type StandingSideMetrics,
} from './standingPostureAnalysis'
import {
  analyzeGaitSequence,
  extractGaitSample,
  type GaitAnalysisResult,
  type GaitSample,
} from './gaitAnalysis'
import type { Point } from '../types/posture'

export const PERSON_OVERLAY_COLORS = [
  '#38bdf8',
  '#f59e0b',
  '#10b981',
  '#a78bfa',
  '#f472b6',
  '#fb7185',
] as const

export interface TrackedGaitPersonSnapshot {
  trackId: string
  slotNumber: number
  label: string
  color: string
  landmarks: Point[]
  anchorNorm: Point2D
  fullBodyVisible: boolean
  front: { metrics: StandingFrontMetrics; findings: StandingFinding[] } | null
  side: { metrics: StandingSideMetrics; findings: StandingFinding[] } | null
  gaitSampleCount: number
}

export interface MultiPersonRombergEntry {
  trackId: string
  slotNumber: number
  label: string
  color: string
  result: RombergResult
}

export interface MultiPersonGaitEntry {
  trackId: string
  slotNumber: number
  label: string
  color: string
  result: GaitAnalysisResult
}

interface PersonTrackState {
  slotNumber: number
  label: string
  color: string
  rombergOpen: RombergSample[]
  rombergClosed: RombergSample[]
  gaitSamples: GaitSample[]
  lastFront: { metrics: StandingFrontMetrics; findings: StandingFinding[] } | null
  lastSide: { metrics: StandingSideMetrics; findings: StandingFinding[] } | null
  lastActiveAt: number
}

function getPersonAnchor(landmarks: readonly Point[]): Point2D | null {
  const shoulderMid = midOrVisible(
    landmarks[STANDING_LM.LEFT_SHOULDER],
    landmarks[STANDING_LM.RIGHT_SHOULDER],
    0.35,
  )
  const hipMid = midOrVisible(landmarks[STANDING_LM.LEFT_HIP], landmarks[STANDING_LM.RIGHT_HIP], 0.35)
  if (shoulderMid && hipMid) {
    return { x: (shoulderMid.x + hipMid.x) / 2, y: (shoulderMid.y + hipMid.y) / 2 }
  }
  if (shoulderMid) return { x: shoulderMid.x, y: shoulderMid.y }
  const nose = landmarks[STANDING_LM.NOSE]
  return nose && (nose.visibility ?? 1) >= 0.35 ? { x: nose.x, y: nose.y } : null
}

export class MultiPersonGaitTracker {
  private tracker = new PositionTracker<{ landmarks: Point[] }>('gait', {
    maxDistance: 0.25,
    staleAfterMs: 3000,
  })
  private states = new Map<string, PersonTrackState>()
  private nextSlotNumber = 1

  resetSessionBuffers() {
    for (const state of this.states.values()) {
      state.rombergOpen = []
      state.rombergClosed = []
      state.gaitSamples = []
    }
  }

  clearAll() {
    this.tracker = new PositionTracker<{ landmarks: Point[] }>('gait', {
      maxDistance: 0.25,
      staleAfterMs: 3000,
    })
    this.states.clear()
    this.nextSlotNumber = 1
  }

  processFrame(params: {
    allLandmarks: Point[][]
    mode: 'standing_front' | 'standing_side' | 'romberg' | 'gait'
    rombergPhase: 'idle' | 'eyes_open' | 'eyes_closed' | 'done'
    gaitRecording: boolean
    now: number
  }): TrackedGaitPersonSnapshot[] {
    const { allLandmarks, mode, rombergPhase, gaitRecording, now } = params
    const detections: { position: Point2D; data: { landmarks: Point[] } }[] = []

    for (const landmarks of allLandmarks) {
      const anchor = getPersonAnchor(landmarks)
      if (!anchor) continue
      detections.push({ position: anchor, data: { landmarks } })
    }

    const { matches, removedIds } = this.tracker.update(detections, now)

    // ลบเฉพาะคนที่ไม่อยู่ในช่วงเก็บข้อมูลของ session (ระหว่างอัดท่าเดิน/Romberg ยังเก็บผลไว้สรุป)
    if (!gaitRecording && rombergPhase !== 'eyes_open' && rombergPhase !== 'eyes_closed') {
      for (const id of removedIds) {
        this.states.delete(id)
      }
    }

    const snapshots: TrackedGaitPersonSnapshot[] = []

    for (const match of matches) {
      let state = this.states.get(match.id)
      if (!state) {
        const slotNumber = this.nextSlotNumber++
        state = {
          slotNumber,
          label: `คนที่ ${slotNumber}`,
          color: PERSON_OVERLAY_COLORS[(slotNumber - 1) % PERSON_OVERLAY_COLORS.length],
          rombergOpen: [],
          rombergClosed: [],
          gaitSamples: [],
          lastFront: null,
          lastSide: null,
          lastActiveAt: now,
        }
        this.states.set(match.id, state)
      }
      state.lastActiveAt = now

      const lm = match.data.landmarks
      const hipVis = Math.max(lm[STANDING_LM.LEFT_HIP]?.visibility ?? 0, lm[STANDING_LM.RIGHT_HIP]?.visibility ?? 0)
      const ankleVis = Math.max(
        lm[STANDING_LM.LEFT_ANKLE]?.visibility ?? 0,
        lm[STANDING_LM.RIGHT_ANKLE]?.visibility ?? 0,
      )
      const fullBodyVisible = hipVis >= 0.4 && ankleVis >= 0.4

      if (mode === 'standing_front') {
        state.lastFront = analyzeStandingFront(lm)
      } else if (mode === 'standing_side') {
        state.lastSide = analyzeStandingSide(lm)
      } else if (mode === 'romberg') {
        if (rombergPhase === 'eyes_open' || rombergPhase === 'eyes_closed') {
          const sample = extractRombergSample(lm, now)
          if (sample) {
            if (rombergPhase === 'eyes_open') state.rombergOpen.push(sample)
            else state.rombergClosed.push(sample)
          }
        }
      } else if (mode === 'gait' && gaitRecording) {
        const sample = extractGaitSample(lm, now)
        if (sample) {
          state.gaitSamples.push(sample)
        }
      }

      const anchor = getPersonAnchor(lm) ?? { x: 0.5, y: 0.5 }
      snapshots.push({
        trackId: match.id,
        slotNumber: state.slotNumber,
        label: state.label,
        color: state.color,
        landmarks: lm,
        anchorNorm: anchor,
        fullBodyVisible,
        front: state.lastFront,
        side: state.lastSide,
        gaitSampleCount: state.gaitSamples.length,
      })
    }

    return snapshots.sort((a, b) => a.slotNumber - b.slotNumber)
  }

  evaluateAllRomberg(): MultiPersonRombergEntry[] {
    const entries: MultiPersonRombergEntry[] = []
    for (const [trackId, state] of this.states) {
      if (state.rombergOpen.length === 0 && state.rombergClosed.length === 0) continue
      entries.push({
        trackId,
        slotNumber: state.slotNumber,
        label: state.label,
        color: state.color,
        result: evaluateRombergTest(state.rombergOpen, state.rombergClosed),
      })
    }
    return entries.sort((a, b) => a.slotNumber - b.slotNumber)
  }

  evaluateAllGait(): MultiPersonGaitEntry[] {
    const entries: MultiPersonGaitEntry[] = []
    for (const [trackId, state] of this.states) {
      if (state.gaitSamples.length === 0) continue
      entries.push({
        trackId,
        slotNumber: state.slotNumber,
        label: state.label,
        color: state.color,
        result: analyzeGaitSequence(state.gaitSamples),
      })
    }
    return entries.sort((a, b) => a.slotNumber - b.slotNumber)
  }
}
