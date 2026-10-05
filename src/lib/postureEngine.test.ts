import { describe, expect, it } from 'vitest'
import { DEFAULT_FALL_THRESHOLDS } from '../types/fall'
import { DEFAULT_THRESHOLDS, type Point } from '../types/posture'
import { DEFAULT_BREAK_THRESHOLDS } from '../types/wellbeing'
import { PostureEngine, type PostureEngineSettings } from './postureEngine'

const FRAME = { width: 640, height: 480 }

function makePose(points: Record<number, [number, number]>): Point[] {
  const landmarks: Point[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0,
  }))

  for (const [index, [x, y]] of Object.entries(points)) {
    landmarks[Number(index)] = { x, y, visibility: 0.99 }
  }

  return landmarks
}

const LEANING = makePose({
  7: [0.55, 0.3],
  8: [0.45, 0.3],
  11: [0.62, 0.55],
  12: [0.38, 0.45],
})

const FALL_START = makePose({
  7: [0.55, 0.2],
  8: [0.45, 0.2],
  11: [0.62, 0.4],
  12: [0.38, 0.4],
})

const FALL_DROP = makePose({
  7: [0.55, 0.45],
  8: [0.45, 0.45],
  11: [0.62, 0.65],
  12: [0.38, 0.65],
})

const FALL_HORIZONTAL = makePose({
  7: [0.55, 0.45],
  8: [0.45, 0.45],
  11: [0.62, 0.65],
  12: [0.38, 0.65],
  23: [0.18, 0.65],
  24: [0.32, 0.65],
})

const SETTINGS: PostureEngineSettings = {
  postureThresholds: DEFAULT_THRESHOLDS,
  postureBaseline: null,
  fallThresholds: DEFAULT_FALL_THRESHOLDS,
  breakThresholds: DEFAULT_BREAK_THRESHOLDS,
}

describe('PostureEngine', () => {
  it('emits exactly one posture start event after 10 seconds of sustained bad posture', () => {
    const engine = new PostureEngine('camera-1')
    const started = []

    for (let now = 0; now <= 10_000; now += 1_000) {
      started.push(...engine.processPoseFrame([LEANING], FRAME, now, SETTINGS).startedEvents)
    }

    expect(started).toHaveLength(1)
    expect(started[0].event.category).toBe('posture')
    expect(started[0].event.type).toBe('leaning')
  })

  it('emits exactly one posture end event when an alerted track goes stale', () => {
    const engine = new PostureEngine('camera-1')
    let startedId: string | undefined

    for (let now = 0; now <= 8_000; now += 1_000) {
      const result = engine.processPoseFrame([LEANING], FRAME, now, SETTINGS)
      startedId ??= result.startedEvents[0]?.event.id
    }

    const removed = engine.processPoseFrame([], FRAME, 13_000, SETTINGS)
    const repeated = engine.processPoseFrame([], FRAME, 14_000, SETTINGS)

    expect(startedId).toBeDefined()
    expect(removed.endedEvents).toHaveLength(1)
    expect(removed.endedEvents[0].event.id).toBe(startedId)
    expect(repeated.endedEvents).toHaveLength(0)
  })

  it('emits a break reminder only once when the sitting duration reaches the threshold', () => {
    const engine = new PostureEngine('camera-1')
    const settings: PostureEngineSettings = {
      ...SETTINGS,
      breakThresholds: {
        continuousSittingMs: 1_000,
        breakResetMs: 3_000,
      },
    }

    const first = engine.processPoseFrame([LEANING], FRAME, 0, settings)
    const due = engine.processPoseFrame([LEANING], FRAME, 1_000, settings)
    const repeated = engine.processPoseFrame([LEANING], FRAME, 1_100, settings)

    expect(first.breakDue).toBeNull()
    expect(due.breakDue).toEqual({ continuousMinutes: 0 })
    expect(repeated.breakDue).toBeNull()
  })

  it('allows the first direct fall alert when synthetic time starts at zero', () => {
    const engine = new PostureEngine('camera-1')

    engine.processPoseFrame([FALL_START], FRAME, 0, SETTINGS)
    const dropped = engine.processPoseFrame([FALL_HORIZONTAL], FRAME, 400, SETTINGS)

    expect(dropped.fallEvents).toHaveLength(1)
    expect(dropped.fallEvents[0].event.type).toBe('fall_detected')
  })

  it('emits fall_suspected_left_frame exactly once after a rapid drop followed by 5 seconds of absence', () => {
    const engine = new PostureEngine('camera-1')

    engine.processPoseFrame([FALL_START], FRAME, 100, SETTINGS)
    engine.processPoseFrame([FALL_DROP], FRAME, 500, SETTINGS)

    const firstAbsent = engine.processPoseFrame([], FRAME, 5_500, SETTINGS)
    const secondAbsent = engine.processPoseFrame([], FRAME, 6_500, SETTINGS)
    const fallEvents = [...firstAbsent.fallEvents, ...secondAbsent.fallEvents]

    expect(fallEvents).toHaveLength(1)
    expect(fallEvents[0].event.type).toBe('fall_suspected_left_frame')
  })
})
