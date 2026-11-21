import { useId, useState, type ReactNode } from 'react'
import { useCameraDevices } from '../hooks/useCameraDevices'
import { normalizeStreamUrl, type CameraSource } from '../types/cameraSource'

interface Props {
  value: CameraSource
  onChange: (source: CameraSource) => void
  /** หัวข้อการ์ดนี้ — ใช้แยกให้เห็นว่าเป็นการตั้งค่าของกล้องตัวไหนตอนมีหลายกล้องพร้อมกัน */
  title?: string
  /** ปุ่มเสริมทางขวาของหัวข้อ (เช่นปุ่ม "ลบกล้องนี้") — ส่งมาจาก parent ที่จัดการรายชื่อกล้องทั้งหมด */
  headerExtra?: ReactNode
}

export default function CameraSourceSelector({ value, onChange, title, headerExtra }: Props) {
  const { devices, loading, error, refresh } = useCameraDevices()
  const sourceName = useId()
  // ช่องกรอก URL กล้อง IP แยกสถานะไว้ต่างหาก เพื่อให้พิมพ์ได้ลื่นๆ ก่อนกด "เชื่อมต่อ" จริง
  const [ipUrlDraft, setIpUrlDraft] = useState(value.ipUrl ?? '')
  const [go2rtcUrlDraft, setGo2rtcUrlDraft] = useState(value.go2rtcUrl ?? '')
  const normalizedGo2rtcUrl = normalizeStreamUrl(go2rtcUrlDraft)

  return (
    <div className="camera-source-selector panel">
      <div className="panel-header-row">
        <h2>{title ?? 'แหล่งภาพกล้อง'}</h2>
        {headerExtra}
      </div>

      <div className="settings-row">
        <label>
          <input
            type="radio"
            name={sourceName}
            checked={value.kind === 'local'}
            onChange={() => onChange({ kind: 'local', deviceId: value.deviceId })}
          />
          {' '}กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)
        </label>
      </div>

      {value.kind === 'local' && (
        <div className="camera-source-local">
          <select
            value={value.deviceId ?? ''}
            onChange={(e) => onChange({ kind: 'local', deviceId: e.target.value || undefined })}
            disabled={loading || devices.length === 0}
          >
            <option value="">ค่าเริ่มต้นของเบราว์เซอร์</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'กำลังค้นหา...' : 'รีเฟรชรายชื่อกล้อง'}
          </button>
          {error && <p className="panel-note">เกิดข้อผิดพลาด: {error}</p>}
          {!loading && devices.length === 0 && !error && (
            <p className="panel-note">ไม่พบกล้อง หรือยังไม่ได้อนุญาตสิทธิ์กล้องให้เว็บไซต์นี้</p>
          )}
          <p className="panel-note">
            เบราว์เซอร์แยกไม่ออกว่ากล้องไหนเป็น USB หรือกล้องในตัวเครื่อง — ดูจากชื่ออุปกรณ์ในลิสต์แทน
            (เช่น "Integrated Camera" มักเป็นกล้องในตัวเครื่อง ส่วนชื่อรุ่น USB webcam จะเป็นกล้อง USB)
          </p>
        </div>
      )}

      <div className="settings-row">
        <label>
          <input
            type="radio"
            name={sourceName}
            checked={value.kind === 'ip-mjpeg'}
            onChange={() => onChange({ kind: 'ip-mjpeg', ipUrl: value.ipUrl })}
          />
          {' '}กล้องเครือข่าย (IP Camera — สตรีม MJPEG ผ่าน HTTP)
        </label>
      </div>

      {value.kind === 'ip-mjpeg' && (
        <div className="camera-source-ip">
          <input
            type="text"
            placeholder="เช่น http://192.168.1.50:8080/video"
            value={ipUrlDraft}
            onChange={(e) => setIpUrlDraft(e.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => onChange({ kind: 'ip-mjpeg', ipUrl: ipUrlDraft.trim() })}
            disabled={!ipUrlDraft.trim()}
          >
            เชื่อมต่อ
          </button>
          <p className="panel-note">
            ใช้ได้เฉพาะกล้องที่ส่งภาพแบบ MJPEG ผ่าน HTTP โดยตรง (เช่น ESP32-CAM, mjpg-streamer, กล้อง IP บางรุ่นที่มีโหมดนี้)
          </p>
        </div>
      )}

      <div className="settings-row">
        <label>
          <input
            type="radio"
            name={sourceName}
            checked={value.kind === 'go2rtc'}
            onChange={() => onChange({ kind: 'go2rtc', go2rtcUrl: value.go2rtcUrl })}
          />
          {' '}ลิงก์ go2rtc
        </label>
      </div>

      {value.kind === 'go2rtc' && (
        <div className="camera-source-ip">
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label="ลิงก์ go2rtc"
            placeholder="http://host:1984/stream.html?src=กล้อง"
            value={go2rtcUrlDraft}
            onChange={(e) => setGo2rtcUrlDraft(e.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => normalizedGo2rtcUrl && onChange({ kind: 'go2rtc', go2rtcUrl: normalizedGo2rtcUrl })}
            disabled={!normalizedGo2rtcUrl}
          >
            เชื่อมต่อ
          </button>
        </div>
      )}
    </div>
  )
}
