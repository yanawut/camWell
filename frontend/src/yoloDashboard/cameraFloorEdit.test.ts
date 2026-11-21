import { describe, expect, it } from 'vitest'
import type { FloorSettings, Point } from '../yoloConsole/types'
import {
  canUndo,
  draftOf,
  floorEdit,
  floorValid,
  isDirty,
  nameTaken,
  renameZone,
  SAVED_TEXT,
  startFloorEdit,
  type FloorEditAction,
} from './cameraFloorEdit'

const saved: FloorSettings = {
  floor_pts: [
    [0.2, 0.3],
    [0.8, 0.3],
    [0.9, 0.9],
    [0.1, 0.9],
  ],
  floor_size_m: [4, 3],
  zones: [
    { name: 'Zone A', box: [0, 0, 10, 20] },
    { name: 'โต๊ะทำงาน', box: [10, 0, 20, 20] },
  ],
  floor_area: null,
}

const farLeftAt = (x: number, gesture = false): FloorEditAction => ({
  type: 'change',
  change: { floor_pts: [[x, 0.3] as Point, ...saved.floor_pts.slice(1)] },
  gesture,
})
const run = (...actions: FloorEditAction[]) => actions.reduce(floorEdit, startFloorEdit(saved))

describe('floor edit undo', () => {
  it('takes back a whole drag with one undo', () => {
    const dragged = run(farLeftAt(0.21, true), farLeftAt(0.22, true), farLeftAt(0.25, true), { type: 'endGesture' })
    expect(draftOf(dragged).floor_pts[0]).toEqual([0.25, 0.3])

    const undone = floorEdit(dragged, { type: 'undo' })
    expect(draftOf(undone)).toEqual(saved)
    expect(canUndo(undone)).toBe(false)
  })

  it('takes back separate edits one at a time', () => {
    const edited = run(farLeftAt(0.21), farLeftAt(0.22))
    const once = floorEdit(edited, { type: 'undo' })
    expect(draftOf(once).floor_pts[0]).toEqual([0.21, 0.3])
    expect(canUndo(once)).toBe(true)
  })

  it('starts a new undo step for an edit after a drag ends', () => {
    const state = run(farLeftAt(0.21, true), { type: 'endGesture' }, farLeftAt(0.3))
    expect(draftOf(floorEdit(state, { type: 'undo' })).floor_pts[0]).toEqual([0.21, 0.3])
  })

  it('leaves nothing unsaved after every edit is undone', () => {
    const undone = [{ type: 'undo' } as const, { type: 'undo' } as const].reduce(floorEdit, run(farLeftAt(0.21), farLeftAt(0.22)))
    expect(isDirty(undone)).toBe(false)
  })
})

describe('floor edit save and cancel', () => {
  it('cancel returns to the saved floor with nothing to undo', () => {
    const cancelled = run(farLeftAt(0.21), { type: 'discard' })
    expect(draftOf(cancelled)).toEqual(saved)
    expect(isDirty(cancelled)).toBe(false)
    expect(canUndo(cancelled)).toBe(false)
  })

  it('a successful save shows what the backend kept and says it is saved', () => {
    const fromBackend = { ...saved, floor_size_m: [5, 3] as Point }
    const done = run(farLeftAt(0.21), { type: 'save' }, { type: 'saved', settings: fromBackend })
    expect(draftOf(done)).toEqual(fromBackend)
    expect(isDirty(done)).toBe(false)
    expect(canUndo(done)).toBe(false)
    expect(done.saving).toBe(false)
    expect(done.message).toEqual({ ok: true, text: SAVED_TEXT })
  })

  it('a failed save keeps the draft and shows the error', () => {
    const failed = run(farLeftAt(0.21), { type: 'save' }, { type: 'saveFailed', text: 'กรอบเลยตำแหน่งกล้องออกไป' })
    expect(draftOf(failed).floor_pts[0]).toEqual([0.21, 0.3])
    expect(isDirty(failed)).toBe(true)
    expect(failed.saving).toBe(false)
    expect(failed.message).toEqual({ ok: false, text: 'กรอบเลยตำแหน่งกล้องออกไป' })
  })

  it('editing again hides the last save message', () => {
    const state = run({ type: 'saveFailed', text: 'x' }, farLeftAt(0.21))
    expect(state.message).toBeNull()
  })
})

describe('floor validity', () => {
  it('accepts the saved floor and refuses crossed corners or a size out of range', () => {
    expect(floorValid(saved)).toBe(true)
    const crossed = { ...saved, floor_pts: [saved.floor_pts[1], saved.floor_pts[0], saved.floor_pts[2], saved.floor_pts[3]] }
    expect(floorValid(crossed)).toBe(false)
    expect(floorValid({ ...saved, floor_size_m: [0, 3] })).toBe(false)
    expect(floorValid({ ...saved, floor_size_m: [4, 201] })).toBe(false)
  })
})

describe('zone names', () => {
  it('renames one zone and keeps every box where it was', () => {
    expect(renameZone(saved.zones, 'Zone A', 'ทางเดิน')).toEqual([
      { name: 'ทางเดิน', box: [0, 0, 10, 20] },
      { name: 'โต๊ะทำงาน', box: [10, 0, 20, 20] },
    ])
  })

  it('refuses another zone’s name but lets a zone keep its own', () => {
    expect(nameTaken(saved.zones, 'โต๊ะทำงาน')).toBe(true)
    expect(nameTaken(saved.zones, 'โต๊ะทำงาน', 'Zone A')).toBe(true)
    expect(nameTaken(saved.zones, 'Zone A', 'Zone A')).toBe(false)
    expect(nameTaken(saved.zones, 'ห้องประชุม')).toBe(false)
  })
})
