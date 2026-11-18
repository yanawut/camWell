import type { FallThresholds } from '../types/fall'
import type { PostureThresholds } from '../types/posture'
import type { DistanceThresholds } from '../types/wellbeing'
import {
  CAMERA_ANGLE_PRESETS,
  getMatchingCameraAnglePreset,
  type CameraAngleId,
} from '../lib/cameraAnglePresets'

interface Props {
  postureThresholds: PostureThresholds
  onPostureChange: (next: PostureThresholds) => void
  fallThresholds: FallThresholds
  onFallChange: (next: FallThresholds) => void
  distanceThresholds: DistanceThresholds
  onDistanceChange: (next: DistanceThresholds) => void
  className?: string
}

export default function CameraAnglePresets({
  postureThresholds,
  onPostureChange,
  fallThresholds,
  onFallChange,
  distanceThresholds,
  onDistanceChange,
  className,
}: Props) {
  const activeAnglePreset = getMatchingCameraAnglePreset(postureThresholds, fallThresholds, distanceThresholds)

  const applyAnglePreset = (angleId: CameraAngleId) => {
    const preset = CAMERA_ANGLE_PRESETS[angleId]
    onPostureChange({ ...preset.postureThresholds })
    onFallChange({ ...preset.fallThresholds })
    onDistanceChange({ ...preset.distanceThresholds })
  }

  return (
    <div className={className ? `angle-presets-section ${className}` : 'angle-presets-section'}>
      <div className="angle-presets-head">
        <h3>แนะนำการตั้งค่าตามมุมกล้อง (Recommend)</h3>
        {activeAnglePreset === null && <span className="angle-preset-custom">ปรับแต่งเอง</span>}
      </div>
      <p className="panel-note">เลือกให้ตรงกับตำแหน่งติดตั้งกล้อง ระบบจะปรับเกณฑ์ท่านั่ง หกล้ม และระยะห่างจอให้อัตโนมัติ</p>
      <div className="angle-presets-grid">
        {(['flat', 'high'] as CameraAngleId[]).map((id) => {
          const preset = CAMERA_ANGLE_PRESETS[id]
          const isActive = activeAnglePreset === id
          return (
            <div key={id} className={`angle-preset-card ${isActive ? 'is-active' : ''}`}>
              <div className="angle-preset-title-row">
                <strong>{preset.title}</strong>
                {isActive && <span className="angle-preset-badge">ใช้งานอยู่</span>}
              </div>
              <p className="angle-preset-sub">{preset.subtitle}</p>
              <ul className="angle-preset-list">
                {preset.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button
                type="button"
                className={isActive ? 'secondary-button angle-preset-btn' : 'primary-button angle-preset-btn'}
                disabled={isActive}
                onClick={() => applyAnglePreset(id)}
              >
                {isActive ? 'กำลังใช้ค่าแนะนำนี้' : 'ใช้ค่าแนะนำนี้'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
