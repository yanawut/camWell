import { useYoloLive } from '../yoloConsole/useYoloLive'
import CameraFloor from './CameraFloor'
import { Arrow, Phrases } from './marks'
import { goTo, YOLO_PAGES } from './pages'
import { PageHead } from './ui'
import './yd-camera.css'

// ?yolo-dashboard=floor — วางมุมพื้นบนภาพจากกล้องและแบ่งโซน (ส่วนพื้นและโซนจากแท็บตั้งค่าของ ?yolo-console)
export default function FloorPage() {
  const hasFrame = useYoloLive((s) => s.frame !== null)
  const simulated = useYoloLive((s) => s.status.source?.kind === 'sim')

  return (
    <>
      <PageHead
        title={YOLO_PAGES.floor}
        lead={
          <>
            <Phrases text="วางมุมพื้นห้องบนภาพจากกล้องให้เป็นเมตร แล้วแบ่งโซน" />{' '}
            {/* วลีท้ายยาวกว่าจอโทรศัพท์ จึงใส่จุดตัดบรรทัดระหว่างวลีโดยไม่เติมช่องว่าง */}
            <span className="yd-ph">มีผลกับกล้อง</span>
            <wbr />
            <span className="yd-ph">ที่กำลังวิเคราะห์ทันที</span>
            <wbr />
            <span className="yd-ph">หลังกดบันทึก</span>
          </>
        }
      />
      {!hasFrame && (
        <div className="yd-callout yd-cam-callout">
          <p>
            <Phrases text="ยังไม่มีภาพจากกล้อง เปิดกล้องที่หน้าภาพรวมก่อน แล้วกลับมาวางมุมพื้นบนภาพจริง" />
          </p>
          <button type="button" className="yd-linkbtn" onClick={() => goTo('overview', 'yd-cameras')}>
            ไปเปิดกล้องที่หน้าภาพรวม
            <Arrow size={16} />
          </button>
        </div>
      )}
      {simulated && (
        <p className="yd-callout" role="status">
          <Phrases text="ตอนนี้เปิดภาพจำลอง (Simulator) อยู่ ภาพจำลองใช้พื้นและโซนของตัวเอง การตั้งค่าพื้นและโซนในหน้านี้ มีผลกับวิดีโอ รูปภาพ กล้อง และ go2rtc เท่านั้น" />
        </p>
      )}
      <CameraFloor />
    </>
  )
}
