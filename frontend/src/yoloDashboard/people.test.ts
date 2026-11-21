import { describe, expect, it } from 'vitest'
import type { FacePerson, FacePose } from '../yoloConsole/types'
import {
  consentCounts,
  enrolGaps,
  isPhotoFile,
  markPhotos,
  MAX_PHOTOS,
  pairLevel,
  suggestedThreshold,
  THRESHOLD_MAX,
  withCameraShots,
} from './people'

const person = (name: string, consentAt: string | null): FacePerson => ({ name, photos: ['a.jpg'], consentAt })

describe('consentCounts', () => {
  it('counts people with and without a consent record', () => {
    const people = [person('ก', '2026-11-01T09:00:00+07:00'), person('ข', null), person('ค', null)]
    expect(consentCounts(people)).toEqual({ total: 3, consented: 1, missing: 2 })
    expect(consentCounts([])).toEqual({ total: 0, consented: 0, missing: 0 })
  })
})

describe('enrolGaps', () => {
  const ready = { name: 'สมชาย ใจดี', consent: true, photos: 3, cameraOpen: false }

  it('lets a complete form save', () => {
    expect(enrolGaps(ready)).toEqual([])
  })

  it('names what is still missing, in form order', () => {
    expect(enrolGaps({ name: '   ', consent: false, photos: 0, cameraOpen: true })).toEqual(['name', 'consent', 'photos', 'camera'])
    expect(enrolGaps({ ...ready, consent: false })).toEqual(['consent'])
    expect(enrolGaps({ ...ready, cameraOpen: true })).toEqual(['camera'])
  })
})

describe('photo files', () => {
  it('accepts only the types yolo-backend stores, in any letter case', () => {
    expect(['a.jpg', 'b.JPEG', 'c.png', 'd.bmp', 'e.webp'].every(isPhotoFile)).toBe(true)
    expect(['scan.pdf', 'face.heic', 'notes.txt', 'jpg'].some(isPhotoFile)).toBe(false)
  })

  it('replaces the earlier camera shots and keeps the picked files', () => {
    const shot = (id: string, pose: FacePose) => ({ id, pose })
    const picked = [{ id: 'file1' }, shot('old-center', 'center'), { id: 'file2' }, shot('old-left', 'left')]
    const next = withCameraShots<{ id: string; pose?: FacePose }>(picked, [shot('new-center', 'center'), shot('new-up', 'up')])
    expect(next.map((p) => p.id)).toEqual(['file1', 'file2', 'new-center', 'new-up'])
  })

  it('never holds more photos than one request may send', () => {
    const files = Array.from({ length: MAX_PHOTOS - 1 }, (_, i) => ({ id: `f${i}` }))
    const shots = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, pose: 'center' as const }))
    expect(withCameraShots<{ id: string; pose?: FacePose }>(files, shots)).toHaveLength(MAX_PHOTOS)
  })
})

describe('pairLevel', () => {
  it('flags a pair at or over the threshold as risky', () => {
    expect(pairLevel(0.45, 0.45)).toBe('risky')
    expect(pairLevel(0.6, 0.45)).toBe('risky')
  })

  it('warns within 0.10 under the threshold, the edge included', () => {
    expect(pairLevel(0.44, 0.45)).toBe('near')
    expect(pairLevel(0.35, 0.45)).toBe('near')
  })

  it('calls the rest apart', () => {
    expect(pairLevel(0.34, 0.45)).toBe('apart')
  })
})

describe('suggestedThreshold', () => {
  it('sits 0.10 above the most alike pair', () => {
    expect(suggestedThreshold([{ a: 'ก', b: 'ข', score: 0.52 }, { a: 'ก', b: 'ค', score: 0.3 }], 0.4)).toBe(0.62)
  })

  it('never goes below the default or past the end of the slider', () => {
    expect(suggestedThreshold([{ a: 'ก', b: 'ข', score: 0.1 }], 0.4)).toBe(0.4)
    expect(suggestedThreshold([{ a: 'ก', b: 'ข', score: 0.9 }], 0.4)).toBe(THRESHOLD_MAX)
  })

  it('falls back to the default with fewer than two people', () => {
    expect(suggestedThreshold([], 0.4)).toBe(0.4)
  })
})

describe('markPhotos', () => {
  it('marks a photo unlike the others under the threshold, and leaves unscored photos alone', () => {
    const marks = markPhotos(['a.jpg', 'b.jpg', 'c.jpg'], { 'a.jpg': 0.7, 'b.jpg': 0.2, 'c.jpg': null }, 0.45)
    expect(marks).toEqual([
      { photo: 'a.jpg', score: 0.7, odd: false },
      { photo: 'b.jpg', score: 0.2, odd: true },
      { photo: 'c.jpg', score: null, odd: false },
    ])
  })

  it('marks nothing before the face check or the threshold arrives', () => {
    expect(markPhotos(['a.jpg'], undefined, 0.45)).toEqual([{ photo: 'a.jpg', score: null, odd: false }])
    expect(markPhotos(['a.jpg'], { 'a.jpg': 0.1 }, null)[0].odd).toBe(false)
  })
})
