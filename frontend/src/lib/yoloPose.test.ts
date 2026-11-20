import { describe, expect, it } from 'vitest'
import { toPoseFrameResult, type YoloFrameResult } from './yoloPose'

const frame: YoloFrameResult = {
  width: 640,
  height: 480,
  people: [{
    id: 9,
    box: [10, 20, 100, 200],
    conf: 0.9,
    keypoints: Array.from({ length: 17 }, (_, i) => [i * 10, i * 5, 0.8] as [number, number, number]),
  }],
  objects: [],
}

describe('toPoseFrameResult', () => {
  it('maps COCO keypoints to the landmarks used by CamWell and keeps YOLO track ids', () => {
    const result = toPoseFrameResult(frame)

    expect(result.trackIds).toEqual(['9'])
    expect(result.landmarks[0]).toHaveLength(33)
    expect(result.landmarks[0][7]).toMatchObject({ x: 30 / 640, y: 15 / 480, visibility: 0.8 })
    expect(result.landmarks[0][11]).toMatchObject({ x: 50 / 640, y: 25 / 480, visibility: 0.8 })
    expect(result.landmarks[0][23]).toMatchObject({ x: 110 / 640, y: 55 / 480, visibility: 0.8 })
  })

  it('omits detections with no valid tracked pose instead of inventing landmarks', () => {
    const result = toPoseFrameResult({
      ...frame,
      people: [{ ...frame.people[0], id: -1, keypoints: undefined }],
    })

    expect(result.landmarks).toEqual([])
    expect(result.trackIds).toEqual([])
  })
})
