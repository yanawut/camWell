import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './envelope/envelope.css'
import './index.css'
import App from './App.tsx'
import PeoplePage from './pages/PeoplePage.tsx'
import AlertsPage from './pages/AlertsPage.tsx'
import LandingPage from './pages/LandingPage.tsx'
import SystemChooserPage from './pages/SystemChooserPage.tsx'
import YoloDashboardPlaceholder from './pages/YoloDashboardPlaceholder.tsx'

// /?people = หน้ารายชื่อบุคคลใน DB, /?alerts = ตารางผลการแจ้งเตือนใน DB (ทั้งสองหน้าไม่โหลดกล้อง/โมเดล AI)
// / (ไม่มี query) = หน้า index ก่อนเข้าระบบ, /?systems = หน้าเลือกระบบหลังกดเข้าสู่ระบบ (MediaPipe หรือ YOLOv8)
// /?yolo-dashboard = หน้ารอของ Dashboard YOLOv8 (ยังไม่ได้ทำ — ถ้าไม่ดักไว้ App จะเปิด Dashboard MediaPipe แทน)
// นอกนั้นให้ App ตัดสิน: /?dashboard = Dashboard, /?camera = หน้ากล้อง/ตั้งค่า,
// /?console = Dev Console (MediaPipe), /?yolo-console = YOLO Console (yolo-backend)
const params = new URLSearchParams(window.location.search)
const page =
  window.location.search === '' ? <LandingPage />
  : params.has('systems') ? <SystemChooserPage />
  : params.has('yolo-dashboard') ? <YoloDashboardPlaceholder />
  : params.has('alerts') ? <AlertsPage />
  : params.has('people') ? <PeoplePage />
  : <App />

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
