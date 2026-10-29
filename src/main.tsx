import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PeoplePage from './pages/PeoplePage.tsx'

// /?people = หน้ารายชื่อบุคคลใน DB (ไม่โหลดกล้อง/โมเดล AI) — นอกนั้นเป็นหน้ากล้องตามเดิม (รวม /?console)
const IS_PEOPLE_PAGE = new URLSearchParams(window.location.search).has('people')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {IS_PEOPLE_PAGE ? <PeoplePage /> : <App />}
  </StrictMode>,
)
