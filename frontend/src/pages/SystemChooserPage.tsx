import type { ReactNode } from 'react'
import { Arrow, Mark, Phrases, ThemeGlyph } from '../envelope/marks'
import { useTheme } from '../hooks/useTheme'
import '../envelope/envelope.css'
import './LandingPage.css'
import './SystemChooserPage.css'

// หน้าเลือกระบบ (/?systems) — หน้าที่ปุ่ม "เข้าสู่ระบบ" บนหน้าแรกพามา
// ฉลากแผ่นเดียวแบ่งสองฝั่งด้วยรอยปรุ: ซ้าย MediaPipe (ใช้งานอยู่) ขวา YOLOv8 (กำลังพัฒนา ดู YOLO-separate-system-plan.md)
// ชื่อโมเดลตรงกับโค้ดจริง: hooks/usePoseLandmarker.ts, hooks/useFaceApiModels.ts, yolo-backend/app/config.py
// หน้านี้ไม่โหลดกล้องหรือโมเดล AI

export const SYSTEMS_HREF = '?systems'

const CHECKS = ['ท่านั่ง', 'ระยะจอ', 'เวลาพัก', 'ความล้า', 'การล้ม', 'จำหน้า']

interface Formula {
  id: string
  name: string
  status: string
  inUse: boolean
  where: string
  parts: { part: string; value: ReactNode }[]
  ready: boolean
  href: string
  action: string
  note?: string
}

const FORMULAS: Formula[] = [
  {
    id: 'mediapipe',
    name: 'MediaPipe',
    status: 'ใช้งานอยู่',
    inUse: true,
    where: 'ประมวลผลในเบราว์เซอร์ของเครื่องนี้ · เฝ้าได้เมื่อเปิดหน้าค้างไว้',
    parts: [
      { part: 'ท่าทาง', value: <><code>pose_landmarker_lite.task</code> · 33 จุด</> },
      { part: 'ใบหน้า', value: 'face-api · TinyFaceDetector · Landmark68 · Recognition' },
      { part: 'ตรวจคน', value: 'ใช้ Pose Landmarker ตัวเดียวกัน' },
    ],
    ready: true,
    href: '?dashboard',
    action: 'เปิดภาพรวม MediaPipe',
  },
  {
    id: 'yolo',
    name: 'YOLOv8',
    status: 'กำลังพัฒนา',
    inUse: false,
    where: 'ประมวลผลที่ yolo-backend · อ่านสตรีมกล้อง go2rtc เอง',
    parts: [
      { part: 'ท่าทาง', value: <><code>yolov8m-pose.pt</code> · 17 จุด</> },
      { part: 'ตรวจคน', value: <><code>yolov8m.pt</code> · COCO 80 คลาส · ติดตามด้วย ByteTrack</> },
      { part: 'ใบหน้า', value: <span className="rx-hand sys-hand">ยังไม่เลือกโมเดล</span> },
    ],
    ready: false,
    href: '?yolo-dashboard',
    action: 'เปิดภาพรวม YOLOv8',
    note: 'ยังไม่เปิดใช้ ทยอยเพิ่มทีละเรื่อง',
  },
]

const TODAY = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())

/** แถบหัวซองของหน้าเลือกระบบ ใช้ร่วมกับหน้ารอของ YOLOv8 */
export function SystemsBand({ tag, back }: { tag: string; back: { href: string; label: string } }) {
  const { theme, toggleTheme } = useTheme()
  const themeLabel = `เปลี่ยนเป็นโหมด${theme === 'dark' ? 'สว่าง' : 'มืด'}`
  return (
    <>
      <header className="rx-band">
        <div className="rx-band-inner">
          <a className="rx-shop" href="./">
            <span className="rx-shop-name">CAMWELL</span>
            <span className="rx-shop-tag">{tag}</span>
          </a>
          <nav className="rx-nav" aria-label="เมนู">
            <a className="rx-nav-link sys-nav-back" href={back.href}>{back.label}</a>
            <button className="rx-nav-icon" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              <ThemeGlyph dark={theme === 'dark'} />
            </button>
          </nav>
        </div>
      </header>
      <div className="rx-perf" aria-hidden="true" />
    </>
  )
}

/** ช่องกรอกหัวฉลาก "ถึง" และ "วันที่" ใช้ร่วมกับหน้ารอของ YOLOv8 */
export function SheetFields() {
  return (
    <div className="rx-fields sys-fields">
      <p className="rx-field"><span>ถึง</span><span className="rx-hand">หัวหน้าทีม / HR</span></p>
      <p className="rx-field rx-field-date"><span>วันที่</span><span className="rx-hand">{TODAY}</span></p>
    </div>
  )
}

export default function SystemChooserPage() {
  return (
    <div className="rx rx-tokens">
      <SystemsBand tag="เลือกระบบตรวจจับ" back={{ href: './', label: 'หน้าแรก' }} />

      <main className="rx-sheet sys-sheet">
        <SheetFields />
        <h1 className="sys-title">วันนี้จะดูห้องด้วยระบบไหน</h1>

        <div className="sys-split">
          {FORMULAS.map((f) => (
            <section key={f.id} className={`sys-half${f.inUse ? ' is-in-use' : ''}`} aria-labelledby={`sys-${f.id}`}>
              <div className="sys-top">
                <span className="sys-pick" aria-hidden="true"><Mark state="tick" label="" />เลือกฝั่งนี้</span>
                <span className={`sys-tag${f.inUse ? ' is-solid' : ''}`}>{f.status}</span>
              </div>
              <h2 id={`sys-${f.id}`} className="sys-name">{f.name}</h2>
              <p className="sys-where"><Phrases text={f.where} /></p>

              <table className="sys-parts">
                <caption>ส่วนประกอบ · โมเดล</caption>
                <tbody>
                  {f.parts.map((row) => (
                    <tr key={row.part}>
                      <th scope="row">{row.part}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="sys-checks" aria-label={`เรื่องที่ ${f.name} ตรวจได้`}>
                {CHECKS.map((name, j) => (
                  <li key={name}>
                    <Mark
                      state={f.ready ? 'tick' : 'empty'}
                      order={f.ready ? j : undefined}
                      small
                      label={f.ready ? 'พร้อมใช้' : 'ยังไม่เปิด'}
                    />
                    {name}
                  </li>
                ))}
              </ul>

              {/* ลิงก์ของแต่ละฝั่งขยายพื้นที่กดเต็มครึ่งหน้า (::after) — ชี้ตรงไหนของฝั่งนั้นก็เข้าได้ */}
              <div className="sys-actions">
                <a className="sys-go" href={f.href}>
                  {f.inUse ? (
                    <span className="rx-stamp sys-stamp"><span className="rx-stamp-face">{f.action} <Arrow size={24} /></span></span>
                  ) : (
                    <span className="rx-secondary sys-secondary">{f.action} <Arrow /></span>
                  )}
                </a>
                {f.note && <span className="rx-hand sys-note">{f.note}</span>}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
