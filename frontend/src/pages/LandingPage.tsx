import { Fragment } from 'react'
import { MARK_LABELS, type MarkState } from '../envelope/markLabels'
import { Arrow, LockGlyph, Mark, Phrases, ThemeGlyph } from '../envelope/marks'
import { useTheme } from '../hooks/useTheme'
import '../envelope/envelope.css'
import './LandingPage.css'

// หน้า index (/) — ออกแบบเป็น "ซองยา/ฉลากยา" ของร้านขายยาไทยแผ่นเดียวทั้งหน้า: พิมพ์หมึกเขียวสีเดียว
// รอยมือ (ติ๊ก วงกลม ขีดฆ่า) เป็นปากกาลูกลื่นน้ำเงิน และตรายางแดงคือปุ่มเข้าสู่ระบบ
// ตัวเลขบนฉลากคือค่าเริ่มต้นจริงในโค้ด (types/posture.ts, types/wellbeing.ts, types/fall.ts) — แก้ค่าเริ่มต้นที่นั่นแล้วต้องแก้ที่นี่ด้วย
// หน้านี้ไม่โหลดกล้องหรือโมเดล AI

const DASHBOARD_HREF = '?dashboard'
const CAMERA_HREF = '?camera'
// ปุ่ม "เข้าสู่ระบบ" พาไปหน้าเลือกระบบ (SystemChooserPage: MediaPipe หรือ YOLOv8) ก่อนเข้า Dashboard
const LOGIN_HREF = '?systems'

// "วิธีใช้": สิ่งที่กล้องดู และนานแค่ไหนถึงเตือน (ค่าเริ่มต้น)
const DOSAGE: { mark: MarkState; name: string; what: string; dose: string }[] = [
  { mark: 'tick', name: 'ท่านั่ง', what: 'คอยื่น หลังค่อม ไหล่เอียง', dose: 'ค้าง 8 วินาที' },
  { mark: 'tick', name: 'ระยะจอ', what: 'นั่งใกล้จอเกินไป', dose: 'ค้าง 5 วินาที' },
  { mark: 'tick', name: 'เวลาพัก', what: 'นั่งต่อเนื่องไม่ลุก', dose: 'ครบ 45 นาที' },
  { mark: 'tick', name: 'ความล้า', what: 'หลับตานาน หาวถี่', dose: 'หลับตา 2 วินาที' },
  { mark: 'ring', name: 'การล้ม', what: 'ล้มหรือหลุดเฟรมกะทันหัน', dose: 'ทันที' },
]

// สองด้านของซอง: ด้านคนนั่งโต๊ะ และด้านหัวหน้าทีม/HR
const SIDES: { id: string; to: string; title: string; items: string[] }[] = [
  {
    id: 'side-desk',
    to: 'คนนั่งโต๊ะ',
    title: 'เตือนคุณ ไม่ได้ฟ้องใคร',
    items: [
      'เตือนบนจอที่โต๊ะคุณเอง มีเสียงประกอบที่ปิดได้',
      'ขยับนิดเดียวไม่เตือน ต้องค้างนาน พอจะเป็นปัญหาก่อน',
      'ลุกจากโต๊ะ 3 นาที นับว่าพักแล้ว ตัวนับเริ่มใหม่',
      'ฟีเจอร์ใบหน้าเลือกปิดได้ ลงทะเบียนต้องให้ความยินยอม และขอลบได้ทุกเมื่อ',
    ],
  },
  {
    id: 'side-lead',
    to: 'หัวหน้าทีม / HR',
    title: 'เห็นทั้งห้อง เฉพาะเรื่องที่ควรรู้',
    items: [
      'ภาพรวมทุกห้องในหน้าเดียว ว่าใครอยู่ และใครมีอาการค้าง',
      'การล้มขึ้นทันที เรื่องอื่นขึ้นเมื่อเป็นนานจริง แจ้งเตือนจึงไม่ท่วม',
      'รายงานประจำวันรายคน พร้อมระดับความเสี่ยง ออฟฟิศซินโดรม',
      'ย้อนดูประวัติแจ้งเตือน และดาวน์โหลดรายงานเป็น CSV',
    ],
  },
]

// บันทึกตัวอย่าง (จำลอง) ของโต๊ะหนึ่งตัว — แสดงว่าระบบปล่อยผ่านอาการสั้น ๆ และเตือนเฉพาะที่ค้าง
const LOG: { time: string; mark: MarkState; event: string; result: string }[] = [
  { time: '09:42', mark: 'empty', event: 'ก้มคอดูมือถือ 3 วินาที', result: 'ไม่เตือน สั้นเกินไป' },
  { time: '10:12', mark: 'ring', event: 'คอยื่นค้าง 8 วินาที', result: 'เตือนบนจอที่โต๊ะ' },
  { time: '10:13', mark: 'strike', event: 'กลับมานั่งตรง', result: 'การเตือนคลี่คลาย' },
  { time: '10:55', mark: 'ring', event: 'นั่งต่อเนื่องครบ 45 นาที', result: 'เตือนให้ลุกพัก' },
  { time: '11:01', mark: 'tick', event: 'ลุกไปเดิน 3 นาที', result: 'นับว่าพักแล้ว' },
]

// "วิธีเริ่มใช้" เขียนแบบบรรทัดวิธีใช้บนฉลาก: ค่าที่แต่ละออฟฟิศกรอกเอง เขียนด้วยลายมือบนเส้นประ
type StepPart = string | { hand: string }
const STEPS: { title: string; parts: StepPart[]; href?: string; link?: string }[] = [
  { title: 'ตั้งกล้อง', parts: ['ใช้', { hand: 'เว็บแคม / USB / IP' }, 'วางตามมุมที่แนะนำ'], href: CAMERA_HREF, link: 'ตั้งค่ากล้อง' },
  { title: 'Calibrate ท่านั่ง', parts: ['นั่งตรง', { hand: '3' }, 'วินาที ครั้งเดียวต่อกล้อง'] },
  { title: 'ลงทะเบียนบุคคล', parts: [{ hand: 'เลือกทำ' }, 'เพื่อแยกการเตือนรายคน ต้องได้รับความยินยอมก่อน'], href: '?people', link: 'รายชื่อบุคคล' },
  { title: 'ดูภาพรวม', parts: ['แดชบอร์ด ประวัติแจ้งเตือน และรายงาน', { hand: 'รายวัน' }], href: DASHBOARD_HREF, link: 'ภาพรวม' },
]

const TODAY = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const themeLabel = `เปลี่ยนเป็นโหมด${theme === 'dark' ? 'สว่าง' : 'มืด'}`

  return (
    <div className="rx rx-tokens">
      <header className="rx-band">
        <div className="rx-band-inner">
          <a className="rx-shop" href="./">
            <span className="rx-shop-name">CAMWELL</span>
            <span className="rx-shop-tag">ฉลากดูแลสุขภาพในที่ทำงาน</span>
          </a>
          <nav className="rx-nav" aria-label="เมนูหน้าแรก">
            <a className="rx-nav-link" href="#how">วิธีใช้</a>
            <a className="rx-nav-link" href="#privacy">ความเป็นส่วนตัว</a>
            <button className="rx-nav-icon" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              <ThemeGlyph dark={theme === 'dark'} />
            </button>
            <a className="rx-nav-login" href={LOGIN_HREF}>เข้าสู่ระบบ</a>
          </nav>
        </div>
      </header>
      <div className="rx-perf" aria-hidden="true" />

      <main className="rx-sheet">
        <section className="rx-hero" aria-labelledby="rx-title">
          <div className="rx-hero-main">
            <div className="rx-fields">
              <p className="rx-field"><span>ถึง</span><span className="rx-hand">คนนั่งโต๊ะ และหัวหน้าทีม</span></p>
              <p className="rx-field rx-field-date"><span>วันที่</span><span className="rx-hand">{TODAY}</span></p>
            </div>
            <h1 id="rx-title">กล้องที่ดูแล<br />ไม่ได้จับผิด</h1>
            <p className="rx-lead">
              <Phrases text="Camwell เตือนเมื่อท่านั่งผิดค้าง นานพอจะเป็นปัญหา แจ้งทันทีเมื่อมีคนล้ม และประมวลผลทุกอย่าง บนเครื่องในออฟฟิศ" />
            </p>
            <div className="rx-actions">
              <a className="rx-stamp" href={LOGIN_HREF}>
                <span className="rx-stamp-face">เข้าสู่ระบบ <Arrow size={24} /></span>
              </a>
              <a className="rx-secondary" href={CAMERA_HREF}>ตั้งค่ากล้อง</a>
            </div>
          </div>

          <div className="rx-hero-side">
            <table className="rx-dosage">
              <caption>วิธีใช้ · กล้องดูให้</caption>
              <thead className="rx-visually-hidden">
                <tr><th scope="col">สถานะ</th><th scope="col">เรื่อง</th><th scope="col">เตือนเมื่อ</th></tr>
              </thead>
              <tbody>
                {DOSAGE.map((row, i) => (
                  <tr key={row.name}>
                    <td><Mark state={row.mark} order={i} label={row.mark === 'ring' ? 'แจ้งทันที' : 'ตรวจอยู่'} /></td>
                    <th scope="row">
                      <span className="rx-dosage-name">{row.name}</span>
                      <span className="rx-dosage-what"><Phrases text={row.what} /></span>
                    </th>
                    <td className="rx-hand rx-dosage-dose">{row.dose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rx-fine">ตัวเลขบนฉลากคือค่าเริ่มต้น ปรับได้ในหน้าตั้งค่า</p>
            {/* คำมั่นข้อสำคัญที่สุดของ Camwell — เป็นเรื่องดี จึงพิมพ์เป็นแผ่นหมึกทึบ ไม่ใช่กล่องคำเตือนสีแดง */}
            <aside className="rx-promise" id="privacy" aria-label="ความเป็นส่วนตัว">
              <LockGlyph />
              <p><strong>ความเป็นส่วนตัว:</strong> <Phrases text="ประมวลผลบนเครื่องของคุณ — ไม่ส่งภาพวิดีโอขึ้นคลาวด์" /></p>
            </aside>
          </div>
        </section>

        <section className="rx-section" id="how" aria-labelledby="how-title">
          <h2 id="how-title" className="rx-heading">ฉลากเดียว อ่านได้สองด้าน</h2>
          <div className="rx-sides">
            {SIDES.map((side) => (
              <article key={side.id} className="rx-side" aria-labelledby={side.id}>
                <p className="rx-field"><span>ถึง</span><span className="rx-hand">{side.to}</span></p>
                <h3 id={side.id}>{side.title}</h3>
                <ul className="rx-checklist">
                  {side.items.map((item) => (
                    <li key={item}><Mark state="tick" label="" /><span><Phrases text={item} /></span></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="rx-section" id="log" aria-labelledby="log-title">
          <div className="rx-heading-row">
            <h2 id="log-title" className="rx-heading">เตือนเฉพาะอาการที่ค้าง</h2>
            <p className="rx-legend" aria-label="ความหมายของเครื่องหมาย">
              {(['empty', 'ring', 'strike', 'tick'] as const).map((state) => (
                <span key={state}><Mark state={state} label="" small />{MARK_LABELS[state]}</span>
              ))}
            </p>
          </div>
          <table className="rx-log">
            <caption>
              บันทึกเช้าวันหนึ่งของโต๊ะ 3 <span className="rx-sample">ตัวอย่างจำลอง</span>
            </caption>
            <thead>
              <tr><th scope="col">เวลา</th><th scope="col"><span className="rx-visually-hidden">สถานะ</span></th><th scope="col">สิ่งที่กล้องเห็น</th><th scope="col">Camwell ทำอะไร</th></tr>
            </thead>
            <tbody>
              {LOG.map((row) => (
                <tr key={row.time} className={`is-${row.mark}`}>
                  <td className="rx-log-time">{row.time}</td>
                  <td><Mark state={row.mark} /></td>
                  <td className="rx-log-event"><Phrases text={row.event} /></td>
                  <td className="rx-hand rx-log-result">{row.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rx-section" id="start" aria-labelledby="start-title">
          <h2 id="start-title" className="rx-heading">เริ่มใช้ 4 ขั้น</h2>
          <ol className="rx-steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="rx-step-num" aria-hidden="true">{i + 1}</span>
                <p className="rx-step-line">
                  <strong>{step.title}</strong>{' '}
                  {step.parts.map((part, j) => (
                    <Fragment key={j}>
                      {j > 0 && ' '}
                      {typeof part === 'string' ? <Phrases text={part} /> : <span className="rx-blank rx-hand">{part.hand}</span>}
                    </Fragment>
                  ))}
                </p>
                {step.href && <a className="rx-link" href={step.href}>{step.link} <Arrow /></a>}
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="rx-foot">
        <div className="rx-foot-inner">
          <div className="rx-foot-shop">
            <span className="rx-shop-name">CAMWELL</span>
            <span>ฉลากดูแลสุขภาพในที่ทำงาน</span>
            <span>ประมวลผลในออฟฟิศ · ภาพวิดีโอไม่ออกจากออฟฟิศ</span>
          </div>
          <p className="rx-field rx-foot-sign"><span>ผู้ดูแล</span><span className="rx-hand">หัวหน้าทีม / HR</span></p>
          <div className="rx-foot-end">
            <a className="rx-secondary" href={LOGIN_HREF}>เข้าสู่ระบบ <Arrow /></a>
            <span className="rx-foot-copy">© {new Date().getFullYear()} Camwell</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
