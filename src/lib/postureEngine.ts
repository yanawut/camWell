import type { AlertEvent } from '../types/alerts'
import type { FallThresholds } from '../types/fall'
import type {
  Point,
  PostureBaseline,
  PostureFeatures,
  PostureIssueType,
  PostureThresholds,
} from '../types/posture'
import type { BreakReminderState, BreakThresholds } from '../types/wellbeing'
import { initialBreakState, stepBreakReminder } from './breakReminder'
import {
  computeDropRatio,
  isNearHorizontal,
  pruneHistory,
  shouldAlertLeftFrame,
  type TorsoReading,
} from './fallDetection'
import { classifyPosture, extractPostureFeatures, type FrameSize } from './postureAnalysis'
import { smoothFeatures } from './smoothing'
import {
  initialSustainedState,
  stepSustainedAlert,
  type SustainedAlertState,
} from './sustainedAlertMachine'
import { PositionTracker, type Point2D } from './tracker'

const POSTURE_SMOOTHING_ALPHA = 0.3
const POSE_TRACK_MAX_DISTANCE = 0.3
const POSE_TRACK_STALE_MS = 4000

export interface PostureEngineSettings {
  postureThresholds: PostureThresholds
  postureBaseline: PostureBaseline | null
  fallThresholds: FallThresholds
  breakThresholds: BreakThresholds
}

export interface EngineAlertEvent {
  trackId: string
  event: AlertEvent
}

export interface EnginePersonFrame {
  trackId: string
  slotNumber: number
  rawFeatures: PostureFeatures
  smoothedFeatures: PostureFeatures
  postureIssue: Exclude<PostureIssueType, 'no_person'>
  postureActiveEvent: AlertEvent | null
  anchorPx: Point2D
}

export interface PostureEngineResult {
  people: EnginePersonFrame[]
  removedTrackIds: string[]
  peopleChanged: boolean
  startedEvents: EngineAlertEvent[]
  endedEvents: EngineAlertEvent[]
  fallEvents: EngineAlertEvent[]
  breakDue: { continuousMinutes: number } | null
}

interface TrackedPoseData {
  features: PostureFeatures
  anchorNorm: Point2D
}

interface EnginePersonState {
  slotNumber: number
  postureState: SustainedAlertState
  smoothedFeatures: PostureFeatures | null
  torsoYHistory: TorsoReading[]
  lastFallAlertAt: number | null
  lastRapidDropAt: number
  lastSeenAt: number
}

export class PostureEngine {
  private tracker: PositionTracker<TrackedPoseData>
  private people = new Map<string, EnginePersonState>()
  private nextSlotNumber = 1
  private breakState: BreakReminderState = initialBreakState

  constructor(cameraId: string) {
    this.tracker = new PositionTracker<TrackedPoseData>(`pose-${cameraId}`, {
      maxDistance: POSE_TRACK_MAX_DISTANCE,
      staleAfterMs: POSE_TRACK_STALE_MS,
    })
  }

  processPoseFrame(
    allLandmarks: Point[][],
    frame: FrameSize,
    now: number,
    settings: PostureEngineSettings,
  ): PostureEngineResult {
    const detections = allLandmarks
      .map((landmarks) => {
        const features = extractPostureFeatures(
          landmarks,
          frame,
          settings.postureThresholds.minVisibility,
        )
        if (!features) return null

        const left = landmarks[11]
        const right = landmarks[12]
        const anchorNorm: Point2D | undefined =
          left && right
            ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
            : landmarks[0]
        if (!anchorNorm) return null

        return {
          position: anchorNorm,
          data: { features, anchorNorm },
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)

    const { matches, removedIds } = this.tracker.update(detections, now)
    const startedEvents: EngineAlertEvent[] = []
    const endedEvents: EngineAlertEvent[] = []
    const fallEvents: EngineAlertEvent[] = []
    const people: EnginePersonFrame[] = []
    let peopleChanged = removedIds.length > 0

    for (const trackId of removedIds) {
      const person = this.people.get(trackId)
      if (!person) continue

      if (person.postureState.activeEvent) {
        endedEvents.push({
          trackId,
          event: { ...person.postureState.activeEvent, endedAt: now },
        })
      }

      if (
        shouldAlertLeftFrame(
          person.lastSeenAt,
          person.lastRapidDropAt,
          settings.fallThresholds.disappearGraceMs,
        )
      ) {
        fallEvents.push({
          trackId,
          event: {
            id: `fall-left-${trackId}-${now}`,
            category: 'fall',
            type: 'fall_suspected_left_frame',
            startedAt: now,
            endedAt: now,
            metrics: {},
          },
        })
      }

      this.people.delete(trackId)
    }

    for (const match of matches) {
      const { features, anchorNorm } = match.data
      let person = this.people.get(match.id)

      if (!person) {
        peopleChanged = true
        person = {
          slotNumber: this.nextSlotNumber++,
          postureState: initialSustainedState,
          smoothedFeatures: null,
          torsoYHistory: [],
          lastFallAlertAt: null,
          lastRapidDropAt: 0,
          lastSeenAt: now,
        }
        this.people.set(match.id, person)
      }

      person.lastSeenAt = now
      person.torsoYHistory = pruneHistory(
        [...person.torsoYHistory, { t: now, y: anchorNorm.y }],
        now,
        settings.fallThresholds.dropWindowMs,
      )
      const dropRatio = computeDropRatio(person.torsoYHistory)
      if (
        dropRatio !== null &&
        dropRatio >= settings.fallThresholds.dropRatioThreshold
      ) {
        person.lastRapidDropAt = now
        if (
          isNearHorizontal(
            features.torsoAngleDeg,
            settings.fallThresholds.fallTorsoAngleDeg,
          ) &&
          (person.lastFallAlertAt === null ||
            now - person.lastFallAlertAt >= settings.fallThresholds.cooldownMs)
        ) {
          person.lastFallAlertAt = now
          fallEvents.push({
            trackId: match.id,
            event: {
              id: `fall-${match.id}-${now}`,
              category: 'fall',
              type: 'fall_detected',
              startedAt: now,
              endedAt: now,
              metrics: {
                dropRatio,
                torsoAngleDeg: features.torsoAngleDeg ?? 0,
              },
            },
          })
        }
      }

      const smoothed = smoothFeatures(
        person.smoothedFeatures,
        features,
        POSTURE_SMOOTHING_ALPHA,
      )
      person.smoothedFeatures = smoothed

      const postureIssue = classifyPosture(
        smoothed,
        settings.postureThresholds,
        settings.postureBaseline,
      )
      const step = stepSustainedAlert(
        person.postureState,
        {
          issue: postureIssue,
          metrics: {
            neckAngleDeg: smoothed.neckAngleDeg,
            torsoAngleDeg: smoothed.torsoAngleDeg ?? 0,
            shoulderTiltDeg: smoothed.shoulderTiltDeg,
          },
        },
        now,
        'posture',
        settings.postureThresholds.sustainedMs,
      )
      person.postureState = step.state

      if (step.startedEvent) {
        startedEvents.push({ trackId: match.id, event: step.startedEvent })
      }
      if (step.endedEvent) {
        endedEvents.push({ trackId: match.id, event: step.endedEvent })
      }

      people.push({
        trackId: match.id,
        slotNumber: person.slotNumber,
        rawFeatures: features,
        smoothedFeatures: smoothed,
        postureIssue,
        postureActiveEvent: person.postureState.activeEvent,
        anchorPx: {
          x: anchorNorm.x * frame.width,
          y: anchorNorm.y * frame.height,
        },
      })
    }

    const breakStep = stepBreakReminder(
      this.breakState,
      matches.length > 0,
      now,
      settings.breakThresholds,
    )
    this.breakState = breakStep.state

    return {
      people,
      removedTrackIds: removedIds,
      peopleChanged,
      startedEvents,
      endedEvents,
      fallEvents,
      breakDue: breakStep.shouldRemind
        ? { continuousMinutes: breakStep.continuousMinutes }
        : null,
    }
  }
}
