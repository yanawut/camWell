import { useEffect, type ComponentType } from 'react'
// CSS ร่วมต้องโหลดก่อน CSS ของแต่ละหน้า (ที่หน้า import เอง) กฎของหน้าจึงทับกฎร่วมได้ด้วย specificity เท่ากัน
import './yd-envelope.css'
import './yd-nav.css'
import './yd-dash.css'
import './yd-pages.css'
import { ackAlert, fallMessage, useAlertFeed, useAlertInbox } from './alertInbox'
import AlertsPage from './AlertsPage'
import CameraPage from './CameraPage'
import DailyPage from './DailyPage'
import FloorPage from './FloorPage'
import { Glyph } from './marks'
import OverviewPage from './OverviewPage'
import { goTo, useYoloPage, YOLO_PAGES, type YoloPage } from './pages'
import PeoplePage from './PeoplePage'
import RoomStatsPage from './RoomStatsPage'
import { Toaster } from './ui'
import YoloNav from './YoloNav'

// /?yolo-dashboard — หน้าของเจ้าหน้าที่สำหรับระบบ YOLOv8 วิเคราะห์ภาพที่ yolo-backend
// โครงเดียวกับ /?dashboard (แถบเมนู + แผ่นฉลาก) แต่ทุกหน้าอ่านข้อมูลจาก yolo-backend เหมือน /?yolo-console

const PAGES: Record<YoloPage, ComponentType> = {
  overview: OverviewPage,
  camera: CameraPage,
  floor: FloorPage,
  people: PeoplePage,
  alerts: AlertsPage,
  report: DailyPage,
  rooms: RoomStatsPage,
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

/** แถบแดงบนสุดของทุกหน้า จนกว่าจะกดรับทราบ — เจ้าหน้าที่ที่เปิดหน้าอื่นอยู่ก็ยังเห็นและได้ยิน */
function FallBanners() {
  const { falls } = useAlertInbox()
  return falls.map((fall) => (
    <section className="yd-dash-fall" key={fall.alert.id} role="alert">
      <Glyph size={34}><path d="M12 4 2.8 19.5h18.4L12 4zM12 10v4.5M12 17.2v.01" /></Glyph>
      <div className="yd-dash-fall-copy">
        <strong>ตรวจพบการล้ม</strong>
        <span>{clock(fall.seenAt)} · {fallMessage(fall.alert)}</span>
      </div>
      <div className="yd-dash-fall-actions">
        <button type="button" className="yd-dash-fall-ack" onClick={() => ackAlert(fall.alert.id)}>
          <span>รับทราบเหตุการณ์</span>
        </button>
        <button type="button" className="yd-dash-fall-where" onClick={() => goTo('overview', 'yd-room')}>
          ดูตำแหน่ง
        </button>
      </div>
    </section>
  ))
}

export default function YoloDashboard() {
  const page = useYoloPage()
  const Page = PAGES[page]
  useAlertFeed()

  useEffect(() => {
    document.title = `${YOLO_PAGES[page]} · Camwell YOLOv8`
  }, [page])

  return (
    <div className="yd">
      <YoloNav active={page} />
      <main className="yd-dash">
        <div className="yd-dash-perf" aria-hidden="true" />
        <div className="yd-dash-sheet">
          <FallBanners />
          <Page />
        </div>
      </main>
      <Toaster />
    </div>
  )
}
