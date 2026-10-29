import type { DevConsoleProps } from './DevConsole'
import { formatNumber } from './format'
import { DEFAULT_THRESHOLDS } from '../types/posture'
import { DEFAULT_BREAK_THRESHOLDS, DEFAULT_DISTANCE_THRESHOLDS, DEFAULT_FATIGUE_THRESHOLDS } from '../types/wellbeing'
import { DEFAULT_FALL_THRESHOLDS } from '../types/fall'
import { breakResetMinutesToMs, getBreakResetSliderModel } from '../lib/breakReminderSettings'

interface SliderDef {
  key: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  /** ค่าที่แสดงบน slider (แปลงหน่วยแล้ว เช่น ms → วินาที) — ใช้ตัวแปลงชุดเดียวกับ SettingsPanel */
  value: number
  defaultValue: number
  onChange: (v: number) => void
}

interface GroupDef {
  title: string
  type: string
  note: string
  needsFace: boolean
  sliders: SliderDef[]
}

export default function ThresholdsTab(props: DevConsoleProps) {
  const {
    postureThresholds: posture,
    fatigueThresholds: fatigue,
    distanceThresholds: distance,
    breakThresholds: brk,
    fallThresholds: fall,
    faceFeaturesEnabled,
  } = props
  const breakReset = getBreakResetSliderModel(brk.breakResetMs)

  const groups: GroupDef[] = [
    {
      title: 'ท่านั่ง',
      type: 'PostureThresholds',
      note: `เทียบกับ baseline ต่อกล้องถ้า calibrate แล้ว · minVisibility ${posture.minVisibility}`,
      needsFace: false,
      sliders: [
        {
          key: 'neckAngleThresholdDeg', label: 'มุมคอที่ยอมรับได้ (forward head)', unit: '°', min: 10, max: 45, step: 1,
          value: posture.neckAngleThresholdDeg, defaultValue: DEFAULT_THRESHOLDS.neckAngleThresholdDeg,
          onChange: (v) => props.onPostureChange({ ...posture, neckAngleThresholdDeg: v }),
        },
        {
          key: 'torsoAngleThresholdDeg', label: 'มุมลำตัวที่ยอมรับได้ (หลังค่อม)', unit: '°', min: 5, max: 35, step: 1,
          value: posture.torsoAngleThresholdDeg, defaultValue: DEFAULT_THRESHOLDS.torsoAngleThresholdDeg,
          onChange: (v) => props.onPostureChange({ ...posture, torsoAngleThresholdDeg: v }),
        },
        {
          key: 'shoulderTiltThresholdDeg', label: 'มุมเอียงไหล่ที่ยอมรับได้', unit: '°', min: 5, max: 30, step: 1,
          value: posture.shoulderTiltThresholdDeg, defaultValue: DEFAULT_THRESHOLDS.shoulderTiltThresholdDeg,
          onChange: (v) => props.onPostureChange({ ...posture, shoulderTiltThresholdDeg: v }),
        },
        {
          key: 'headDropThreshold', label: 'หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน', unit: '%', min: 5, max: 40, step: 1,
          value: Math.round(posture.headDropThreshold * 100), defaultValue: Math.round(DEFAULT_THRESHOLDS.headDropThreshold * 100),
          onChange: (v) => props.onPostureChange({ ...posture, headDropThreshold: v / 100 }),
        },
        {
          key: 'sustainedMs', label: 'นั่งท่าไม่ดีต่อเนื่องก่อนแจ้งเตือน', unit: ' s', min: 2, max: 30, step: 1,
          value: Math.round(posture.sustainedMs / 1000), defaultValue: Math.round(DEFAULT_THRESHOLDS.sustainedMs / 1000),
          onChange: (v) => props.onPostureChange({ ...posture, sustainedMs: v * 1000 }),
        },
      ],
    },
    {
      title: 'หกล้ม / ตกจากเก้าอี้',
      type: 'FallThresholds',
      note: 'ใช้ pose landmarks เดิม แจ้งทันทีที่ตรวจพบ (edge-triggered)',
      needsFace: false,
      sliders: [
        {
          key: 'dropRatioThreshold', label: 'สัดส่วนร่วงตัวที่ถือว่าเร็วผิดปกติ', unit: '', min: 0.1, max: 0.4, step: 0.01,
          value: fall.dropRatioThreshold, defaultValue: DEFAULT_FALL_THRESHOLDS.dropRatioThreshold,
          onChange: (v) => props.onFallChange({ ...fall, dropRatioThreshold: v }),
        },
        {
          key: 'dropWindowMs', label: 'หน้าต่างเวลาที่ใช้ดูการร่วงตัว', unit: ' ms', min: 300, max: 1500, step: 100,
          value: fall.dropWindowMs, defaultValue: DEFAULT_FALL_THRESHOLDS.dropWindowMs,
          onChange: (v) => props.onFallChange({ ...fall, dropWindowMs: v }),
        },
        {
          key: 'fallTorsoAngleDeg', label: 'มุมลำตัวที่ถือว่าล้มราบ', unit: '°', min: 30, max: 80, step: 1,
          value: fall.fallTorsoAngleDeg, defaultValue: DEFAULT_FALL_THRESHOLDS.fallTorsoAngleDeg,
          onChange: (v) => props.onFallChange({ ...fall, fallTorsoAngleDeg: v }),
        },
        {
          key: 'cooldownMs', label: 'Cooldown แจ้งซ้ำคนเดิม', unit: ' s', min: 5, max: 60, step: 5,
          value: Math.round(fall.cooldownMs / 1000), defaultValue: Math.round(DEFAULT_FALL_THRESHOLDS.cooldownMs / 1000),
          onChange: (v) => props.onFallChange({ ...fall, cooldownMs: v * 1000 }),
        },
        {
          key: 'disappearGraceMs', label: 'ทนรอหลังหายจากเฟรม', unit: ' s', min: 1, max: 10, step: 0.5,
          value: fall.disappearGraceMs / 1000, defaultValue: DEFAULT_FALL_THRESHOLDS.disappearGraceMs / 1000,
          onChange: (v) => props.onFallChange({ ...fall, disappearGraceMs: v * 1000 }),
        },
      ],
    },
    {
      title: 'ความเหนื่อยล้า',
      type: 'FatigueThresholds',
      note: 'EAR/MAR จาก face-api 68 จุด · ต้องเปิดฟีเจอร์ใบหน้า',
      needsFace: true,
      sliders: [
        {
          key: 'drowsySustainedMs', label: 'ตาหลับนานเท่าไหร่ถึงเตือนว่าง่วง', unit: ' s', min: 1, max: 10, step: 0.5,
          value: fatigue.drowsySustainedMs / 1000, defaultValue: DEFAULT_FATIGUE_THRESHOLDS.drowsySustainedMs / 1000,
          onChange: (v) => props.onFatigueChange({ ...fatigue, drowsySustainedMs: v * 1000 }),
        },
        {
          key: 'yawnCountThreshold', label: 'หาวกี่ครั้ง (ใน 10 นาที) ถือว่าถี่', unit: ' ครั้ง', min: 2, max: 8, step: 1,
          value: fatigue.yawnCountThreshold, defaultValue: DEFAULT_FATIGUE_THRESHOLDS.yawnCountThreshold,
          onChange: (v) => props.onFatigueChange({ ...fatigue, yawnCountThreshold: v }),
        },
      ],
    },
    {
      title: 'ระยะห่างจากจอ',
      type: 'DistanceThresholds',
      note: 'เทียบความกว้างใบหน้ากับ baseline · ต้องเปิดฟีเจอร์ใบหน้า',
      needsFace: true,
      sliders: [
        {
          key: 'tooCloseRatio', label: 'ใกล้กว่าค่ามาตรฐานกี่เท่าถึงเตือน', unit: 'x', min: 1.1, max: 2, step: 0.05,
          value: distance.tooCloseRatio, defaultValue: DEFAULT_DISTANCE_THRESHOLDS.tooCloseRatio,
          onChange: (v) => props.onDistanceChange({ ...distance, tooCloseRatio: v }),
        },
      ],
    },
    {
      title: 'เตือนพัก',
      type: 'BreakThresholds',
      note: 'ตัวจับเวลาแยกต่อกล้อง ไม่ขึ้นกับท่านั่ง',
      needsFace: false,
      sliders: [
        {
          key: 'continuousSittingMs', label: 'นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก', unit: ' นาที', min: 15, max: 90, step: 5,
          value: brk.continuousSittingMs / 60000, defaultValue: DEFAULT_BREAK_THRESHOLDS.continuousSittingMs / 60000,
          onChange: (v) => props.onBreakChange({ ...brk, continuousSittingMs: v * 60000 }),
        },
        {
          key: 'breakResetMs', label: 'ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว', unit: ' นาที',
          min: breakReset.min, max: breakReset.max, step: breakReset.step,
          value: breakReset.value, defaultValue: getBreakResetSliderModel(DEFAULT_BREAK_THRESHOLDS.breakResetMs).value,
          onChange: (v) => props.onBreakChange({ ...brk, breakResetMs: breakResetMinutesToMs(v) }),
        },
      ],
    },
  ]

  const modifiedCount = groups.reduce(
    (sum, g) => sum + g.sliders.filter((s) => s.value !== s.defaultValue).length,
    0,
  )

  const resetAll = () => {
    props.onPostureChange(DEFAULT_THRESHOLDS)
    props.onFallChange(DEFAULT_FALL_THRESHOLDS)
    props.onFatigueChange(DEFAULT_FATIGUE_THRESHOLDS)
    props.onDistanceChange(DEFAULT_DISTANCE_THRESHOLDS)
    props.onBreakChange(DEFAULT_BREAK_THRESHOLDS)
  }

  return (
    <>
      <div className="dc-toolbar">
        <span className="dc-muted" style={{ fontSize: 13 }}>
          แก้ไขแล้ว <strong className="dc-text">{modifiedCount}</strong> ค่า จากค่าเริ่มต้นใน <code>types/*.ts</code> · มีผลทุกกล้องทันที
        </span>
        <button type="button" className="dc-btn" onClick={resetAll}>
          คืนค่าเริ่มต้นทั้งหมด
        </button>
      </div>
      <div className="dc-threshold-grid">
        {groups.map((g) => {
          const disabled = g.needsFace && !faceFeaturesEnabled
          return (
            <div key={g.type} className="dc-card dc-pad" style={{ opacity: disabled ? 0.5 : 1 }}>
              <div className="dc-row" style={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <h2 className="dc-h2">{g.title}</h2>
                <span className="dc-mono-11 dc-muted">{g.type}</span>
              </div>
              <p className="dc-muted-12" style={{ margin: '0 0 12px' }}>
                {disabled ? 'ปิดอยู่ — เปิด "ฟีเจอร์ใบหน้า" ที่แถบด้านบนเพื่อปรับ' : g.note}
              </p>
              <div className="dc-col" style={{ gap: 14 }}>
                {g.sliders.map((s) => {
                  const changed = s.value !== s.defaultValue
                  return (
                    <label key={s.key} className="dc-slider">
                      <span className="dc-slider-head">
                        <span className="dc-row" style={{ gap: 6 }}>
                          <span className="dc-dot dc-dot-6" style={{ background: changed ? 'var(--accent)' : 'var(--border)' }} />
                          {s.label}
                        </span>
                        <strong className="dc-mono" style={{ whiteSpace: 'nowrap' }}>
                          {formatNumber(s.value)}
                          {s.unit}
                        </strong>
                      </span>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={s.value}
                        disabled={disabled}
                        onChange={(e) => s.onChange(Number(e.target.value))}
                      />
                      <span className="dc-slider-foot">
                        <span>{s.key}</span>
                        <span>
                          ค่าเริ่มต้น {formatNumber(s.defaultValue)}
                          {s.unit}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
