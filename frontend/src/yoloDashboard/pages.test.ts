import { describe, expect, it } from 'vitest'
import { hrefFor, pageFromSearch, YOLO_PAGE_IDS } from './pages'

describe('yolo-dashboard pages', () => {
  it('opens the overview at ?yolo-dashboard and every other page at ?yolo-dashboard=<id>', () => {
    expect(hrefFor('overview')).toBe('?yolo-dashboard')
    expect(hrefFor('alerts')).toBe('?yolo-dashboard=alerts')
  })

  it('reads back every page from its own link', () => {
    for (const page of YOLO_PAGE_IDS) expect(pageFromSearch(hrefFor(page))).toBe(page)
  })

  it('falls back to the overview for an unknown page', () => {
    expect(pageFromSearch('?yolo-dashboard=gait')).toBe('overview')
    expect(pageFromSearch('?yolo-dashboard=toString')).toBe('overview')
  })
})
