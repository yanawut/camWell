import CameraAlerts from './CameraAlerts'
import { YOLO_PAGES } from './pages'
import { PageHead } from './ui'
import './yd-camera.css'

// ?yolo-dashboard=camera — เกณฑ์การแจ้งเตือนจากแท็บตั้งค่าของ ?yolo-console (พื้นและโซนอยู่หน้า ?yolo-dashboard=floor)
// ไม่มีคำอธิบายใต้หัวข้อ เพราะการ์ดการแจ้งเตือนมีประโยคเดียวกันอยู่แล้ว
export default function CameraPage() {
  return (
    <>
      <PageHead title={YOLO_PAGES.camera} />
      <CameraAlerts />
    </>
  )
}
