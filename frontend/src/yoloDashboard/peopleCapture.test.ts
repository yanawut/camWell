import { describe, expect, it } from 'vitest'
import { CAPTURE_MS, captureStepAt, cameraErrorText, faceCropRect } from './peopleCapture'

describe('captureStepAt', () => {
  it('walks through the poses in order over the whole recording', () => {
    expect(captureStepAt(0).text).toBe('มองตรงที่กล้อง')
    expect(captureStepAt(1999).text).toBe('มองตรงที่กล้อง')
    expect(captureStepAt(2000).text).toBe('หันซ้ายช้าๆ')
    expect(captureStepAt(4200).text).toBe('หันขวาช้าๆ')
    expect(captureStepAt(CAPTURE_MS - 1).text).toBe('ก้มหน้าเล็กน้อย')
  })

  it('stays on the last pose once the time is up', () => {
    expect(captureStepAt(CAPTURE_MS + 500).text).toBe('ก้มหน้าเล็กน้อย')
  })
})

describe('faceCropRect', () => {
  it('centres a square twice the face size on the face', () => {
    expect(faceCropRect([600, 300, 680, 400], 1280, 720)).toEqual({ x: 540, y: 250, side: 200 })
  })

  it('slides the square back inside the frame near an edge', () => {
    expect(faceCropRect([0, 0, 80, 100], 1280, 720)).toEqual({ x: 0, y: 0, side: 200 })
    expect(faceCropRect([1220, 640, 1280, 720], 1280, 720)).toEqual({ x: 1120, y: 560, side: 160 })
  })

  it('never asks for more than the frame holds', () => {
    expect(faceCropRect([200, 100, 1000, 700], 1280, 720)).toEqual({ x: 240, y: 0, side: 720 })
  })
})

describe('cameraErrorText', () => {
  it('explains the common camera failures in Thai', () => {
    expect(cameraErrorText(new DOMException('denied', 'NotAllowedError'))).toContain('ไม่ได้รับอนุญาตให้ใช้กล้อง')
    expect(cameraErrorText(new DOMException('none', 'NotFoundError'))).toBe('ไม่พบกล้องในเครื่องนี้')
  })

  it('passes any other error through', () => {
    expect(cameraErrorText(new Error('เบราว์เซอร์อนุญาตกล้องเฉพาะเมื่อเปิดผ่าน localhost หรือ https'))).toContain('localhost')
    expect(cameraErrorText(new DOMException('x', 'toString'))).toBe('x')
  })
})
