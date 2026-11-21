import { useState } from 'react'

export type Engine = 'mediapipe' | 'yolo'

const ENGINES: [Engine, string, string][] = [
  ['mediapipe', 'MediaPipe', '?console'],
  ['yolo', 'YOLO', '?yolo-console'],
]

interface Props {
  current: Engine
  /** เหตุผลที่ยังสลับไม่ได้ (null = สลับได้) */
  blockedReason?: string | null
  /** เก็บกวาดก่อนออกจากหน้า — คืน false เพื่อยกเลิกการสลับ */
  beforeLeave?: () => boolean | Promise<boolean>
}

/**
 * สลับระหว่าง Dev Console (MediaPipe ในเบราว์เซอร์) กับ YOLO Console (yolo-backend) — เปลี่ยนหน้าทั้งหน้า
 * กล้อง/โมเดลของหน้าเดิมจึงถูกปิดหมด และหน้าที่กลับมาโหลดค่าเดิมจาก localStorage
 */
export default function EngineSwitch({ current, blockedReason = null, beforeLeave }: Props) {
  const [leaving, setLeaving] = useState(false)

  const switchTo = async (target: Engine, href: string) => {
    if (target === current || leaving) return
    setLeaving(true)
    const proceed = beforeLeave ? await beforeLeave() : true
    if (!proceed) {
      setLeaving(false)
      return
    }
    window.location.assign(href)
  }

  return (
    <div className="dc-engine">
      <span className="dc-section-label">Engine</span>
      <div className="dc-segment" role="radiogroup" aria-label="Engine ที่ใช้ตรวจจับ">
        {ENGINES.map(([engine, text, href]) => (
          <button
            key={engine}
            type="button"
            role="radio"
            aria-checked={engine === current}
            className={engine === current ? 'active' : ''}
            disabled={engine !== current && (leaving || !!blockedReason)}
            title={engine !== current ? blockedReason ?? undefined : undefined}
            onClick={() => void switchTo(engine, href)}
          >
            {text}
          </button>
        ))}
      </div>
      {leaving && <span className="dc-muted-12">กำลังสลับ...</span>}
      {!leaving && blockedReason && <span className="dc-muted-12">{blockedReason}</span>}
    </div>
  )
}
