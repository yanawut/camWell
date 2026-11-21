import { describe, expect, it } from 'vitest'
import { fallMessage, mergeFalls } from './alertInbox'
import type { LiveAlert } from '../yoloConsole/types'

const alert = (id: string, category: LiveAlert['category'], extra: Partial<LiveAlert> = {}): LiveAlert => ({
  id,
  category,
  type: category === 'fall' ? 'fall' : 'neck',
  text: '',
  person: 3,
  name: null,
  startedAt: 0,
  seconds: 0,
  moment: category === 'fall',
  ...extra,
})

describe('mergeFalls', () => {
  it('keeps a fall after the live panel stops sending it, until it is acknowledged', () => {
    const first = mergeFalls([], new Set(), [alert('f1', 'fall')], 1000)
    expect(first.map((f) => f.alert.id)).toEqual(['f1'])
    expect(mergeFalls(first, new Set(), [], 2000)).toBe(first)
  })

  it('ignores other categories and falls already acknowledged', () => {
    expect(mergeFalls([], new Set(['f1']), [alert('f1', 'fall'), alert('p1', 'posture')], 1000)).toEqual([])
  })

  it('records the time it first saw each fall and does not add it twice', () => {
    const first = mergeFalls([], new Set(), [alert('f1', 'fall')], 1000)
    const second = mergeFalls(first, new Set(), [alert('f1', 'fall'), alert('f2', 'fall')], 5000)
    expect(second.map((f) => [f.alert.id, f.seenAt])).toEqual([['f1', 1000], ['f2', 5000]])
  })
})

describe('fallMessage', () => {
  it('names a known person and falls back to the track number', () => {
    expect(fallMessage(alert('f1', 'fall', { name: 'สมชาย' }))).toContain('สมชาย')
    expect(fallMessage(alert('f2', 'fall', { type: 'fall_vanish' }))).toContain('คนที่ 3 ร่วงลงแล้วหายจากภาพ')
  })
})
