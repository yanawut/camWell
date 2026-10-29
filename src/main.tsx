import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PeoplePage from './pages/PeoplePage.tsx'
import AlertsPage from './pages/AlertsPage.tsx'

// /?people = หน้ารายชื่อบุคคลใน DB, /?alerts = ตารางผลการแจ้งเตือนใน DB (ทั้งสองหน้าไม่โหลดกล้อง/โมเดล AI)
// นอกนั้นให้ App ตัดสิน: / = Dashboard (หน้าแรก), /?camera = หน้ากล้อง/ตั้งค่า, /?console = Dev Console
const params = new URLSearchParams(window.location.search)
const page = params.has('alerts') ? <AlertsPage /> : params.has('people') ? <PeoplePage /> : <App />

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
