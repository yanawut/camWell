import { describe, expect, it } from 'vitest'
import { autoStartPlan } from './browserCamera'
import type { SessionStatus } from '../yoloConsole/types'

const status = (state: SessionStatus['state'], kind?: NonNullable<SessionStatus['source']>['kind']) => ({
  state,
  source: kind ? { kind, label: kind } : undefined,
})

describe('autoStartPlan', () => {
  it('opens the browser camera when nothing is being analysed', () => {
    for (const state of ['idle', 'ended', 'error'] as const) expect(autoStartPlan(status(state)), state).toBe('start')
    expect(autoStartPlan(status('ended', 'video'))).toBe('start')
  })

  it('reopens a browser camera session left behind by a closed or reloaded page', () => {
    expect(autoStartPlan(status('running', 'browser'))).toBe('start')
    expect(autoStartPlan(status('paused', 'browser'))).toBe('start')
  })

  it('does not take over a video, go2rtc or simulator session that is running', () => {
    expect(autoStartPlan(status('running', 'go2rtc'))).toBe('leave')
    expect(autoStartPlan(status('paused', 'video'))).toBe('leave')
    expect(autoStartPlan(status('starting', 'sim'))).toBe('leave')
    expect(autoStartPlan(status('holding', 'image'))).toBe('leave')
  })
})
