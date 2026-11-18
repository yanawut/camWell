export interface YoloPerson {
  id: number
  box: [number, number, number, number]
  conf: number
  keypoints?: [number, number, number][]
}

export interface YoloObject {
  class: 'chair' | 'table'
  box: [number, number, number, number]
  conf: number
}

export interface YoloFrameResult {
  width: number
  height: number
  people: YoloPerson[]
  objects: YoloObject[]
  processMs?: number
}

export interface PoseFrameResult {
  landmarks: { x: number; y: number; z: number; visibility: number }[][]
  worldLandmarks: { x: number; y: number; z: number; visibility: number }[][]
  trackIds: string[]
  people: YoloPerson[]
  objects: YoloObject[]
}

const COCO_TO_BLAZEPOSE: readonly [number, number][] = [
  [0, 0], [1, 2], [2, 5], [3, 7], [4, 8], [5, 11], [6, 12],
  [7, 13], [8, 14], [9, 15], [10, 16], [11, 23], [12, 24],
  [13, 25], [14, 26], [15, 27], [16, 28],
]

export function toPoseFrameResult(frame: YoloFrameResult, maxPeople = Infinity): PoseFrameResult {
  const visiblePeople = frame.people
    .filter((person) => person.keypoints?.length === 17 && person.id >= 0)
    .slice(0, maxPeople)
  const landmarks = visiblePeople.map((person) => {
    const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }))
    for (const [cocoIndex, blazeIndex] of COCO_TO_BLAZEPOSE) {
      const [x, y, confidence] = person.keypoints![cocoIndex]
      points[blazeIndex] = {
        x: x / frame.width,
        y: y / frame.height,
        z: 0,
        visibility: confidence,
      }
    }
    return points
  })

  return {
    landmarks,
    worldLandmarks: visiblePeople.map(() => []),
    trackIds: visiblePeople.map((person) => String(person.id)),
    people: visiblePeople,
    objects: frame.objects,
  }
}
