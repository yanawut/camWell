import { useEffect, useMemo, useState } from 'react'
import OfficeRoom from '../dashboard/OfficeRoom'
import type { PersonSummary } from '../types/person'
import '../App.css'
import '../dashboard/dashboard.css'
import './LandingPage.css'

// หน้า index (/) — หน้าต้อนรับก่อนเข้าระบบจริง ไม่โหลดกล้องหรือโมเดล AI
// ปุ่มเข้าสู่ระบบพาไปที่ /?dashboard (ภาพรวมห้องทำงาน)

type Theme = 'light' | 'dark'
const THEME_STORAGE_KEY = 'camwell:theme'
const DASHBOARD_HREF = '?dashboard'

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: '🪑', title: 'ท่านั่ง', body: 'ตรวจคอยื่น หลังค่อม ไหล่เอียง จากโครงร่างร่างกายแบบเรียลไทม์' },
  { icon: '⏱', title: 'เวลาพัก', body: 'นับเวลานั่งต่อเนื่องแยกตามกล้อง และเตือนเมื่อถึงเวลาลุกพัก' },
  { icon: '📏', title: 'ระยะจอ', body: 'ประเมินระยะห่างจากหน้าจอ เตือนเมื่อนั่งใกล้เกินไป' },
  { icon: '😴', title: 'ความล้า', body: 'จับสัญญาณง่วง เช่น หาวหรือหลับตานาน' },
  { icon: '🚨', title: 'การล้ม', body: 'แจ้งเตือนทันทีเมื่อตรวจพบการล้มหรือหายออกจากเฟรมผิดปกติ' },
  { icon: '📊', title: 'รายงานประจำวัน', body: 'สรุปการแจ้งเตือนและการเข้างานของแต่ละคนในแต่ละวัน' },
]

const STEPS = [
  { title: 'ติดตั้งกล้อง', body: 'เลือกเว็บแคมหรือกล้อง CCTV และมุมกล้องที่แนะนำ' },
  { title: 'ลงทะเบียนบุคคล', body: 'บันทึกใบหน้าเพื่อแยกแจ้งเตือนเป็นรายคน (เลือกเปิดได้)' },
  { title: 'ดูภาพรวม', body: 'ติดตามทุกคนในห้องบนแดชบอร์ดและประวัติแจ้งเตือน' },
]

// คนจำลองในภาพตัวอย่าง (ห้อง pixel art แบบหน้า Dashboard) — วนให้มีคนเข้า/ออกห้องเพื่อให้ภาพดูมีชีวิต
const DEMO_PEOPLE: PersonSummary[] = [
  { trackId: 'landing-1', label: 'สมชาย', employeeId: 'landing-1', postureStatus: 'ท่าทางปกติ', postureAlertActive: false, fatigueActive: false, distanceActive: false, yawnCount: 0 },
  { trackId: 'landing-2', label: 'สุดา', employeeId: 'landing-2', postureStatus: 'ก้มคอ/ยื่นคอไปข้างหน้า', postureAlertActive: true, fatigueActive: false, distanceActive: false, yawnCount: 0 },
  { trackId: 'landing-3', label: 'อนันต์', employeeId: 'landing-3', postureStatus: 'ท่าทางปกติ', postureAlertActive: false, fatigueActive: true, distanceActive: false, yawnCount: 2 },
  { trackId: 'landing-4', label: 'วิภา', employeeId: 'landing-4', postureStatus: 'ท่าทางปกติ', postureAlertActive: false, fatigueActive: false, distanceActive: false, yawnCount: 0 },
]
const DEMO_ALERT_COUNTS = new Map([['landing-1', 0], ['landing-2', 3], ['landing-3', 7], ['landing-4', 1]])
// แต่ละเฟรมคือ index ของคนที่อยู่ในห้อง
const DEMO_FRAMES = [[0, 1, 2], [0, 1, 2, 3], [0, 2, 3], [0, 1, 3], [1, 2, 3]]
const DEMO_TICK_MS = 3000

function useDemoRoom() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % DEMO_FRAMES.length), DEMO_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])
  // memo ด้วย frame เพื่อให้ OfficeRoom เห็น array ใหม่เฉพาะตอนเปลี่ยนเฟรม
  return useMemo(() => DEMO_FRAMES[frame].map((i) => DEMO_PEOPLE[i]), [frame])
}

export default function LandingPage() {
  const demoPeople = useDemoRoom()
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    setTheme(next)
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="app-brand" href="./" aria-label="Camwell">
          <span className="app-brand-mark" aria-hidden="true">C</span>
          <span>CAMWELL</span>
        </a>
        <div className="landing-nav-actions">
          <button className="landing-ghost" type="button" onClick={toggleTheme} aria-label={`เปลี่ยนเป็นโหมด${theme === 'dark' ? 'สว่าง' : 'มืด'}`}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <a className="landing-btn landing-btn-sm" href={DASHBOARD_HREF}>เข้าสู่ระบบ</a>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">ระบบดูแลสุขภาวะในที่ทำงานด้วยกล้อง</p>
            <h1>นั่งทำงานอย่างสุขภาพดี<br />ด้วยกล้องที่คอยดูแลคุณ</h1>
            <p className="landing-lead">
              Camwell วิเคราะห์ท่านั่ง ระยะจอ ความล้า และการล้มจากกล้องในห้องทำงาน
              แล้วแจ้งเตือนอย่างนุ่มนวลก่อนที่อาการปวดเมื่อยจะสะสม
            </p>
            <div className="landing-cta">
              <a className="landing-btn" href={DASHBOARD_HREF}>เข้าสู่ระบบ →</a>
              <a className="landing-btn landing-btn-outline" href="?camera">ตั้งค่ากล้อง</a>
            </div>
            <p className="landing-note">ประมวลผลบนเครื่องของคุณ — ไม่ส่งภาพวิดีโอขึ้นคลาวด์</p>
          </div>

          <div className="landing-preview">
            <OfficeRoom
              title="ห้องทำงาน (ตัวอย่าง)"
              people={demoPeople}
              alertCounts={DEMO_ALERT_COUNTS}
              onOpenCamera={() => { window.location.href = DASHBOARD_HREF }}
            />
          </div>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <h2 id="features-title">สิ่งที่ Camwell ตรวจจับ</h2>
          <div className="landing-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="landing-card">
                <span className="landing-card-icon" aria-hidden="true">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-labelledby="steps-title">
          <h2 id="steps-title">เริ่มใช้งานใน 3 ขั้นตอน</h2>
          <ol className="landing-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="landing-step-num">{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-final">
          <h2>พร้อมเริ่มดูแลทีมของคุณแล้วหรือยัง</h2>
          <a className="landing-btn" href={DASHBOARD_HREF}>เข้าสู่ระบบ →</a>
        </section>
      </main>

      <footer className="landing-footer">© {new Date().getFullYear()} Camwell</footer>
    </div>
  )
}
