import type { PostureThresholds } from '../types/posture'
import type { BreakThresholds, DistanceThresholds, FatigueThresholds } from '../types/wellbeing'
import type { FallThresholds } from '../types/fall'

interface Props {
  postureThresholds: PostureThresholds
  onPostureChange: (next: PostureThresholds) => void
  fatigueThresholds: FatigueThresholds
  onFatigueChange: (next: FatigueThresholds) => void
  distanceThresholds: DistanceThresholds
  onDistanceChange: (next: DistanceThresholds) => void
  breakThresholds: BreakThresholds
  onBreakChange: (next: BreakThresholds) => void
  fallThresholds: FallThresholds
  onFallChange: (next: FallThresholds) => void
  soundEnabled: boolean
  onSoundEnabledChange: (enabled: boolean) => void
  faceFeaturesEnabled: boolean
  onFaceFeaturesEnabledChange: (enabled: boolean) => void
}

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="settings-row">
      <span>
        {label}: <strong>{value}{unit}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function SettingsPanel({
  postureThresholds,
  onPostureChange,
  fatigueThresholds,
  onFatigueChange,
  distanceThresholds,
  onDistanceChange,
  breakThresholds,
  onBreakChange,
  fallThresholds,
  onFallChange,
  soundEnabled,
  onSoundEnabledChange,
  faceFeaturesEnabled,
  onFaceFeaturesEnabledChange,
}: Props) {
  const setPosture = <K extends keyof PostureThresholds>(key: K, value: PostureThresholds[K]) => {
    onPostureChange({ ...postureThresholds, [key]: value })
  }
  const setFatigue = <K extends keyof FatigueThresholds>(key: K, value: FatigueThresholds[K]) => {
    onFatigueChange({ ...fatigueThresholds, [key]: value })
  }
  const setDistance = <K extends keyof DistanceThresholds>(key: K, value: DistanceThresholds[K]) => {
    onDistanceChange({ ...distanceThresholds, [key]: value })
  }
  const setBreak = <K extends keyof BreakThresholds>(key: K, value: BreakThresholds[K]) => {
    onBreakChange({ ...breakThresholds, [key]: value })
  }
  const setFall = <K extends keyof FallThresholds>(key: K, value: FallThresholds[K]) => {
    onFallChange({ ...fallThresholds, [key]: value })
  }

  return (
    <div className="panel settings-panel">
      <h2>ตั้งค่าความไว</h2>

      <label className="settings-row settings-checkbox">
        <span>เปิดเสียงแจ้งเตือน</span>
        <input type="checkbox" checked={soundEnabled} onChange={(e) => onSoundEnabledChange(e.target.checked)} />
      </label>
      <label className="settings-row settings-checkbox">
        <span>เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)</span>
        <input type="checkbox" checked={faceFeaturesEnabled} onChange={(e) => onFaceFeaturesEnabledChange(e.target.checked)} />
      </label>

      <h3>ท่านั่ง</h3>
      <Slider
        label="มุมคอที่ยอมรับได้ (forward head)"
        unit="°"
        min={10}
        max={45}
        step={1}
        value={postureThresholds.neckAngleThresholdDeg}
        onChange={(v) => setPosture('neckAngleThresholdDeg', v)}
      />
      <Slider
        label="มุมลำตัวที่ยอมรับได้ (หลังค่อม)"
        unit="°"
        min={5}
        max={35}
        step={1}
        value={postureThresholds.torsoAngleThresholdDeg}
        onChange={(v) => setPosture('torsoAngleThresholdDeg', v)}
      />
      <Slider
        label="มุมเอียงไหล่ที่ยอมรับได้"
        unit="°"
        min={5}
        max={30}
        step={1}
        value={postureThresholds.shoulderTiltThresholdDeg}
        onChange={(v) => setPosture('shoulderTiltThresholdDeg', v)}
      />
      <Slider
        label="นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน"
        unit="s"
        min={2}
        max={30}
        step={1}
        value={Math.round(postureThresholds.sustainedMs / 1000)}
        onChange={(v) => setPosture('sustainedMs', v * 1000)}
      />

      <h3>หกล้ม / ตกจากเก้าอี้</h3>
      <p className="panel-note">ใช้ pose landmarks ที่มีอยู่แล้ว ไม่ต้องเปิดฟีเจอร์ใบหน้า — แจ้งเตือนทันทีที่ตรวจพบ ไม่ต้องรอสะสมเวลา</p>
      <Slider
        label="สัดส่วนร่วงตัวต่อหน้าต่างเวลาที่ถือว่าเร็วผิดปกติ"
        unit=""
        min={0.1}
        max={0.4}
        step={0.01}
        value={fallThresholds.dropRatioThreshold}
        onChange={(v) => setFall('dropRatioThreshold', v)}
      />
      <Slider
        label="หน้าต่างเวลาที่ใช้ดูว่าร่วงตัวเร็วแค่ไหน"
        unit=" ms"
        min={300}
        max={1500}
        step={100}
        value={fallThresholds.dropWindowMs}
        onChange={(v) => setFall('dropWindowMs', v)}
      />
      <Slider
        label="มุมลำตัวที่ถือว่าล้มราบ/ใกล้แนวนอน"
        unit="°"
        min={30}
        max={80}
        step={1}
        value={fallThresholds.fallTorsoAngleDeg}
        onChange={(v) => setFall('fallTorsoAngleDeg', v)}
      />
      <Slider
        label="ห้ามแจ้งเตือนซ้ำสำหรับคนเดิมถี่กว่านี้ (cooldown)"
        unit="s"
        min={5}
        max={60}
        step={5}
        value={Math.round(fallThresholds.cooldownMs / 1000)}
        onChange={(v) => setFall('cooldownMs', v * 1000)}
      />
      <Slider
        label="ทนรอหลังหายไปจากเฟรม ก่อนสรุปว่าตกจากเก้าอี้จนหลุดมุมกล้อง"
        unit="s"
        min={1}
        max={10}
        step={0.5}
        value={fallThresholds.disappearGraceMs / 1000}
        onChange={(v) => setFall('disappearGraceMs', v * 1000)}
      />

      {faceFeaturesEnabled && (
        <>
          <h3>ความเหนื่อยล้า</h3>
          <Slider
            label="ตาหลับนานเท่าไหร่ถึงเตือนว่าง่วง"
            unit="s"
            min={1}
            max={10}
            step={0.5}
            value={fatigueThresholds.drowsySustainedMs / 1000}
            onChange={(v) => setFatigue('drowsySustainedMs', v * 1000)}
          />
          <Slider
            label="หาวกี่ครั้งถือว่าถี่ผิดปกติ"
            unit=" ครั้ง"
            min={2}
            max={8}
            step={1}
            value={fatigueThresholds.yawnCountThreshold}
            onChange={(v) => setFatigue('yawnCountThreshold', v)}
          />

          <h3>ระยะห่างจากจอ</h3>
          <Slider
            label="นั่งใกล้กว่าค่ามาตรฐานกี่เท่าถึงเตือน"
            unit="x"
            min={1.1}
            max={2}
            step={0.05}
            value={distanceThresholds.tooCloseRatio}
            onChange={(v) => setDistance('tooCloseRatio', v)}
          />

          <h3>เตือนพัก</h3>
          <Slider
            label="นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก"
            unit=" นาที"
            min={15}
            max={90}
            step={5}
            value={breakThresholds.continuousSittingMs / 60000}
            onChange={(v) => setBreak('continuousSittingMs', v * 60000)}
          />
        </>
      )}
    </div>
  )
}
