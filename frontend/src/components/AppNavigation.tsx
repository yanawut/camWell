import { ThemeGlyph } from '../envelope/marks'
import { useTheme } from '../hooks/useTheme'
import '../envelope/envelope.css'
import './AppNavigation.css'

// แถบเมนูของทุกหน้าในแอป = แถบหัวซองยา (หมึกเขียว ตัวพิมพ์สีกระดาษ; ธีมมืดกลับสี) เหมือนหน้าแรก

type Page = 'dashboard' | 'camera' | 'gait' | 'people' | 'alerts' | 'report'

const LINKS: { page: Page; label: string; href: string }[] = [
  { page: 'dashboard', label: 'ภาพรวม', href: '?dashboard' },
  { page: 'camera', label: 'ตั้งค่ากล้อง', href: '?camera' },
  { page: 'gait', label: 'ท่ายืน & ท่าเดิน', href: '?gait' },
  { page: 'people', label: 'รายชื่อบุคคล', href: '?people' },
  { page: 'alerts', label: 'ประวัติแจ้งเตือน', href: '?alerts' },
  { page: 'report', label: 'รายงานประจำวัน', href: '?report' },
]

export default function AppNavigation({ active }: { active: Page }) {
  const { theme, toggleTheme } = useTheme()
  const themeLabel = `เปลี่ยนเป็นโหมด${theme === 'dark' ? 'สว่าง' : 'มืด'}`

  return (
    <header className="rxnav rx-tokens">
      <div className="rxnav-inner">
        <a className="rxnav-brand" href="./" aria-label="Camwell - กลับหน้าแรก">CAMWELL</a>
        <nav className="rxnav-links" aria-label="เมนูหลัก">
          {LINKS.map(({ page, label, href }) => (
            <a key={page} href={href} className={active === page ? 'is-active' : undefined} aria-current={active === page ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="rxnav-tools">
          <button className="rxnav-icon" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            <ThemeGlyph dark={theme === 'dark'} />
          </button>
          <a className="rxnav-console" href="?console">Console</a>
        </div>
      </div>
    </header>
  )
}
