import type { ReactNode } from 'react'
import { Arrow, Mark, Phrases, ThemeGlyph } from '../envelope/marks'
import { useTheme } from '../hooks/useTheme'
import '../envelope/envelope.css'
import './LandingPage.css'
import './SystemChooserPage.css'

// หน้าเลือกระบบ (/?systems) — ทุกทางเข้าแอปจากหน้าแรกพามาที่นี่
// ฉลากแผ่นเดียวแบ่งสองฝั่งด้วยรอยปรุ: ซ้าย YOLOv8 (แนะนำ) ขวา MediaPipe พร้อมใช้ทั้งคู่
// ฝั่งที่แนะนำมาก่อน (บนมือถือจึงอยู่จอแรก) ติ๊ก "เลือกฝั่งนี้" ไว้ และได้ตรายางอันเดียวของหน้า อีกฝั่งเป็นปุ่มกรอบหมึก
// ชื่อโมเดลตรงกับโค้ดจริง: hooks/usePoseLandmarker.ts, hooks/useFaceApiModels.ts,
// yolo-backend/app/config.py (DET_MODEL, POSE_MODEL) และ yolo-backend/face_id.py (create_engine: InsightFace buffalo_l ถ้าติดตั้งไว้ ไม่งั้น YuNet + SFace)
// แถวในตารางส่วนประกอบเรียงลำดับเดียวกันทั้งสองฝั่ง อ่านเทียบกันข้ามรอยปรุได้ทีละบรรทัด
// หน้านี้ไม่โหลดกล้องหรือโมเดล AI

const CHECKS = ['ท่านั่ง', 'ระยะจอ', 'เวลาพัก', 'ความล้า', 'การล้ม', 'จำหน้า']

interface Formula {
  id: string
  name: string
  where: string
  parts: { part: string; value: ReactNode }[]
  href: string
  action: string
  recommended?: boolean
}

const FORMULAS: Formula[] = [
  {
    id: 'yolo',
    name: 'YOLOv8',
    where: 'ประมวลผลที่ yolo-backend · อ่านสตรีมกล้อง go2rtc เอง',
    parts: [
      { part: 'ท่าทาง', value: <><code>yolov8m-pose.pt</code> · 17 จุด</> },
      { part: 'ใบหน้า', value: <>InsightFace <code>buffalo_l</code> · สำรอง YuNet + SFace</> },
      { part: 'ตรวจคน', value: <><code>yolov8m.pt</code> · COCO 80 คลาส · ติดตามด้วย ByteTrack</> },
    ],
    href: '?yolo-dashboard',
    action: 'เปิดภาพรวม YOLOv8',
    recommended: true,
  },
  {
    id: 'mediapipe',
    name: 'MediaPipe',
    where: 'ประมวลผลในเบราว์เซอร์ของเครื่องนี้ · เฝ้าได้เมื่อเปิดหน้าค้างไว้',
    parts: [
      { part: 'ท่าทาง', value: <><code>pose_landmarker_lite.task</code> · 33 จุด</> },
      { part: 'ใบหน้า', value: 'face-api · TinyFaceDetector · Landmark68 · Recognition' },
      { part: 'ตรวจคน', value: 'ใช้ Pose Landmarker ตัวเดียวกัน' },
    ],
    href: '?dashboard',
    action: 'เปิดภาพรวม MediaPipe',
  },
]

const TODAY = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())

/** แถบหัวซองของหน้าเลือกระบบ */
function SystemsBand({ tag, back }: { tag: string; back: { href: string; label: string } }) {
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

/** ช่องกรอกหัวฉลาก "ถึง" และ "วันที่" */
function SheetFields() {
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
            <section key={f.id} className={`sys-half${f.recommended ? ' is-recommended' : ''}`} aria-labelledby={`sys-${f.id}`}>
              <div className="sys-top">
                <span className="sys-pick" aria-hidden="true"><Mark state="tick" label="" />เลือกฝั่งนี้</span>
                {f.recommended && <span className="sys-tag is-solid">แนะนำ</span>}
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
                    <Mark state="tick" order={j} small label="พร้อมใช้" />
                    {name}
                  </li>
                ))}
              </ul>

              {/* ลิงก์ของแต่ละฝั่งขยายพื้นที่กดเต็มครึ่งหน้า (::after) — ชี้ตรงไหนของฝั่งนั้นก็เข้าได้ */}
              <div className="sys-actions">
                <a className="sys-go" href={f.href}>
                  {f.recommended ? (
                    <span className="rx-stamp sys-stamp"><span className="rx-stamp-face">{f.action} <Arrow size={24} /></span></span>
                  ) : (
                    <span className="rx-secondary sys-secondary">{f.action} <Arrow /></span>
                  )}
                </a>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
