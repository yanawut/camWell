import { useTheme } from '../hooks/useTheme'

type Page = 'dashboard' | 'camera' | 'gait' | 'people' | 'alerts' | 'report'

const LINKS: { page: Page; label: string; href: string }[] = [
  { page: 'dashboard', label: 'ภาพรวม', href: '?dashboard' },
  { page: 'camera', label: 'ตั้งค่ากล้อง', href: '?camera' },
  { page: 'gait', label: 'ท่ายืน & ท่าเดิน', href: '?gait' },
  { page: 'people', label: 'รายชื่อบุคคล', href: '?people' },
  { page: 'alerts', label: 'ประวัติแจ้งเตือน', href: '?alerts' },
  { page: 'report', label: 'รายงานประจำวัน', href: '?report' },
]

interface Props {
  active: Page
  dashboardStats?: { people: number; cameras: number }
}

export default function AppNavigation({ active, dashboardStats }: Props) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="app-nav">
      <a className="app-brand" href="./" aria-label="Camwell - กลับหน้าแรก">
        <span className="app-brand-mark" aria-hidden="true">C</span>
        <span>CAMWELL</span>
      </a>
      <nav className="app-nav-links" aria-label="เมนูหลัก">
        {LINKS.map(({ page, label, href }) => (
          <a key={page} href={href} className={active === page ? 'is-active' : undefined} aria-current={active === page ? 'page' : undefined}>
            {label}
          </a>
        ))}
        {dashboardStats && (
          <span className="app-nav-meta">
            พบทั้งหมด: <strong>{dashboardStats.people} คน</strong><span aria-hidden="true">·</span>
            กล้อง: <strong>{dashboardStats.cameras} ตัว</strong>
          </span>
        )}
        <button className="app-nav-theme" type="button" onClick={toggleTheme} aria-label={`เปลี่ยนเป็นโหมด${theme === 'dark' ? 'สว่าง' : 'มืด'}`}>
          {theme === 'dark' ? '☀ โหมดสว่าง' : '☾ โหมดมืด'}
        </button>
        <a className="app-nav-console" href="?console">Console</a>
      </nav>
    </header>
  )
}
