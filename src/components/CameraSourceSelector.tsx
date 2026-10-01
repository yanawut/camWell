import { useState } from 'react'
import { useCameraDevices } from '../hooks/useCameraDevices'
import type { CameraSource } from '../types/cameraSource'

interface Props {
  value: CameraSource
  onChange: (source: CameraSource) => void
}

export default function CameraSourceSelector({ value, onChange }: Props) {
  const { devices, loading, error, refresh } = useCameraDevices()
  // ช่องกรอก URL กล้อง IP แยกสถานะไว้ต่างหาก เพื่อให้พิมพ์ได้ลื่นๆ ก่อนกด "เชื่อมต่อ" จริง
  const [ipUrlDraft, setIpUrlDraft] = useState(value.ipUrl ?? '')

  const isRtspUrl = /^rtsp:\/\//i.test(ipUrlDraft.trim())

  return (
    <div className="camera-source-selector panel">
      <h2>แหล่งภาพกล้อง</h2>

      <div className="settings-row">
        <label>
          <input
            type="radio"
            name="camera-source-kind"
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
            name="camera-source-kind"
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
          {isRtspUrl && (
            <p className="panel-note panel-warning">
              ⚠️ ลิงก์ที่ใส่เป็น rtsp:// — เบราว์เซอร์เปิดสตรีม RTSP ตรงๆ ไม่ได้ (กล้อง IP/CCTV ส่วนใหญ่ เช่น
              Hikvision, Dahua ใช้ RTSP เป็นค่าเริ่มต้น) ต้องมีเซิร์ฟเวอร์กลางแปลงสตรีม RTSP เป็น MJPEG หรือ HLS
              ก่อน (งาน Phase 2 ที่ยังไม่รองรับในเวอร์ชันนี้) ลองหา URL แบบ MJPEG/HTTP ของกล้องรุ่นนี้แทน
              (มักอยู่ในคู่มือกล้อง หรือหน้าตั้งค่าเว็บของกล้อง)
            </p>
          )}
          <p className="panel-note">
            ใช้ได้เฉพาะกล้องที่ส่งภาพแบบ MJPEG ผ่าน HTTP โดยตรง (เช่น ESP32-CAM, mjpg-streamer, กล้อง IP บางรุ่นที่มีโหมดนี้)
          </p>
        </div>
      )}
    </div>
  )
}
