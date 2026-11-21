import { Arrow, Mark, Phrases } from '../envelope/marks'
import { SheetFields, SYSTEMS_HREF, SystemsBand } from './SystemChooserPage'
import '../envelope/envelope.css'
import './LandingPage.css'
import './SystemChooserPage.css'

// หน้ารอของ /?yolo-dashboard — ใช้จนกว่า Dashboard ของ YOLOv8 จะเสร็จ แล้วให้หน้าจริงมาแทนที่ไฟล์นี้

const PLAN: { step: number; text: string }[] = [
  { step: 0, text: 'รากฐาน yolo-backend: เปิดหลายกล้องพร้อมกัน และที่เก็บข้อมูลของตัวเอง' },
  { step: 1, text: 'เตือนพัก นั่งครบ 45 นาที' },
  { step: 2, text: 'ท่านั่ง คอยื่น หลังค่อม ไหล่เอียง' },
  { step: 3, text: 'จำหน้าพนักงาน โดยต้องได้รับความยินยอม' },
  { step: 4, text: 'หน้ารายชื่อ ประวัติแจ้งเตือน และรายงาน' },
  { step: 5, text: 'การล้ม' },
  { step: 6, text: 'ความล้า และระยะห่างจากจอ' },
]

export default function YoloDashboardPlaceholder() {
  return (
    <div className="rx rx-tokens">
      <SystemsBand tag="ภาพรวม YOLOv8" back={{ href: SYSTEMS_HREF, label: 'เลือกระบบ' }} />

      <main className="rx-sheet sys-sheet">
        <SheetFields />
        <div className="yolo-wait">
          <section className="yolo-wait-main" aria-labelledby="yolo-wait-title">
            <h1 id="yolo-wait-title">ภาพรวม YOLOv8<br />ยังไม่เปิด</h1>
            <p className="yolo-wait-lead">
              <Phrases text="ระบบ YOLOv8 กำลังพัฒนา และจะทยอยเปิดทีละเรื่อง ระหว่างนี้ภาพรวม MediaPipe ใช้งานได้ตามปกติ" />
            </p>
            <div className="yolo-wait-actions">
              <a className="rx-secondary" href={SYSTEMS_HREF}>กลับไปเลือกระบบ</a>
              <a className="rx-link" href="?yolo-console">ลองโมเดลใน YOLO Console <Arrow /></a>
            </div>
          </section>

          <section className="yolo-wait-side" aria-labelledby="yolo-plan-title">
            <h2 id="yolo-plan-title">แผนพัฒนา</h2>
            <p className="rx-fine">เปิดทีละขั้น ขั้นก่อนต้องผ่านก่อนเริ่มขั้นถัดไป</p>
            <ol className="rx-checklist yolo-plan">
              {PLAN.map((item) => (
                <li key={item.step}>
                  <Mark state="empty" label="ยังไม่เสร็จ" />
                  <span><strong>ขั้น {item.step}</strong><Phrases text={item.text} /></span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  )
}
