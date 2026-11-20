import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './envelope/envelope.css'
import './index.css'
import App from './App.tsx'
import PeoplePage from './pages/PeoplePage.tsx'
import AlertsPage from './pages/AlertsPage.tsx'
import LandingPage from './pages/LandingPage.tsx'

// /?people = หน้ารายชื่อบุคคลใน DB, /?alerts = ตารางผลการแจ้งเตือนใน DB (ทั้งสองหน้าไม่โหลดกล้อง/โมเดล AI)
// / (ไม่มี query) = หน้า index ก่อนเข้าระบบ, นอกนั้นให้ App ตัดสิน: /?dashboard = Dashboard, /?camera = หน้ากล้อง/ตั้งค่า,
// /?console = Dev Console (MediaPipe), /?yolo-console = YOLO Console (yolo-backend)
const params = new URLSearchParams(window.location.search)
const page = window.location.search === '' ? <LandingPage /> : params.has('alerts') ? <AlertsPage /> : params.has('people') ? <PeoplePage /> : <App />

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
