import { describe, expect, it } from 'vitest'
import type { AlertEvent } from '../types/alerts'
import {
  initialSustainedState,
  stepSustainedAlert,
  type SustainedAlertState,
} from './sustainedAlertMachine'

const SUSTAINED_MS = 5000

function feed(
  state: SustainedAlertState,
  issue: 'good' | 'slouching',
  fromMs: number,
  durationMs: number,
  stepMs = 100,
) {
  const started = []
  const ended = []

  for (let t = fromMs; t <= fromMs + durationMs; t += stepMs) {
    const result = stepSustainedAlert(
      state,
      { issue, metrics: { torsoAngleDeg: 20 } },
      t,
      'posture',
      SUSTAINED_MS,
    )
    state = result.state
    if (result.startedEvent) started.push(result.startedEvent)
    if (result.endedEvent) ended.push(result.endedEvent)
  }

  return { state, started, ended }
}

describe('stepSustainedAlert', () => {
  it('does not alert before the sustained duration elapses', () => {
    const result = feed(initialSustainedState, 'slouching', 0, 4000)

    expect(result.started).toHaveLength(0)
  })

  it('alerts once when a bad posture starting at t=0 reaches the sustained duration', () => {
    const result = feed(initialSustainedState, 'slouching', 0, 6000)

    expect(result.started).toHaveLength(1)
    expect(result.started[0].type).toBe('slouching')
  })

  it('preserves zero-valued signal and recovery timestamps', () => {
    const activeEvent: AlertEvent = {
      id: 'existing-alert',
      category: 'posture',
      type: 'slouching',
      startedAt: -1000,
      metrics: { torsoAngleDeg: 20 },
    }
    const state: SustainedAlertState = {
      ...initialSustainedState,
      activeEvent,
      goodSince: 0,
      lastSignalAt: 0,
    }

    const noSignal = stepSustainedAlert(
      state,
      { issue: 'no_signal', metrics: {} },
      500,
      'posture',
      SUSTAINED_MS,
    )

    expect(noSignal.endedEvent).toBeUndefined()
    expect(noSignal.state.activeEvent).toEqual(activeEvent)

    const recovered = stepSustainedAlert(
      noSignal.state,
      { issue: 'good', metrics: {} },
      1000,
      'posture',
      SUSTAINED_MS,
    )

    expect(recovered.endedEvent).toMatchObject({
      id: 'existing-alert',
      endedAt: 1000,
    })
    expect(recovered.state.activeEvent).toBeNull()
  })
})
