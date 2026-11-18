import { describe, expect, it } from 'vitest'
import { normalizeStreamUrl } from './cameraSource'

describe('normalizeStreamUrl', () => {
  it('preserves credentials and camera query parameters', () => {
    expect(normalizeStreamUrl('rtsp://user:example-password@192.168.1.50:554/cam/realmonitor?channel=1&subtype=1'))
      .toBe('rtsp://user:example-password@192.168.1.50:554/cam/realmonitor?channel=1&subtype=1')
  })

  it('accepts go2rtc links and rejects unsupported URLs or missing hosts', () => {
    expect(normalizeStreamUrl('http://go2rtc.local:1984/stream.html?src=front')).toBe(
      'http://go2rtc.local:1984/stream.html?src=front',
    )
    expect(normalizeStreamUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeStreamUrl('rtsp:///cam/stream')).toBeNull()
  })
})
