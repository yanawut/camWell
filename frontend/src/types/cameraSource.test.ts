import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA_SOURCE, normalizeStreamUrl, restoreCameraSource, type CameraSource } from './cameraSource'

describe('normalizeStreamUrl', () => {
  it('preserves credentials and query parameters', () => {
    expect(normalizeStreamUrl('http://user:example-password@go2rtc.local:1984/stream.html?src=front'))
      .toBe('http://user:example-password@go2rtc.local:1984/stream.html?src=front')
  })

  it('accepts go2rtc links and rejects unsupported URLs or missing hosts', () => {
    expect(normalizeStreamUrl('http://go2rtc.local:1984/stream.html?src=front')).toBe(
      'http://go2rtc.local:1984/stream.html?src=front',
    )
    expect(normalizeStreamUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeStreamUrl('rtsp://192.168.1.50:554/cam/stream')).toBeNull()
    expect(normalizeStreamUrl('http://')).toBeNull()
  })
})

describe('restoreCameraSource', () => {
  it('keeps supported sources', () => {
    const source: CameraSource = { kind: 'go2rtc', go2rtcUrl: 'http://go2rtc.local:1984/stream.html?src=front' }
    expect(restoreCameraSource(source)).toBe(source)
  })

  it('falls back to the local camera for a saved RTSP source', () => {
    const saved = { kind: 'rtsp', rtspUrl: 'rtsp://192.168.1.50:554/cam' } as unknown as CameraSource
    expect(restoreCameraSource(saved)).toBe(DEFAULT_CAMERA_SOURCE)
  })
})
