import type { MouseEvent } from 'react'
import { ThemeGlyph } from './marks'
import { goTo, hrefFor, YOLO_PAGE_IDS, YOLO_PAGES, type YoloPage } from './pages'
import { useTheme } from './useTheme'

// แถบเมนูของ /?yolo-dashboard หน้าตาเดียวกับแถบเมนูของ /?dashboard ลิงก์ทุกอันอยู่ในระบบ YOLO

/** คลิกธรรมดา = เปลี่ยนหน้าโดยไม่โหลดใหม่ ส่วน Ctrl/⌘/กลางเมาส์ยังเปิดแท็บใหม่ได้ตามปกติ */
function follow(page: YoloPage) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    goTo(page)
  }
}

export default function YoloNav({ active }: { active: YoloPage }) {
  const { theme, toggleTheme } = useTheme()
  const themeLabel = `เปลี่ยนเป็นโหมด${theme === 'dark' ? 'สว่าง' : 'มืด'}`

  return (
    <header className="yd-nav">
      <div className="yd-nav-inner">
        <a className="yd-nav-brand" href="./" aria-label="Camwell - กลับหน้าแรก">CAMWELL</a>
        <nav className="yd-nav-links" aria-label="เมนูหลัก">
          {YOLO_PAGE_IDS.map((page) => (
            <a
              key={page}
              href={hrefFor(page)}
              onClick={follow(page)}
              className={active === page ? 'is-active' : undefined}
              aria-current={active === page ? 'page' : undefined}
            >
              {YOLO_PAGES[page]}
            </a>
          ))}
        </nav>
        <div className="yd-nav-tools">
          <button className="yd-nav-icon" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
            <ThemeGlyph dark={theme === 'dark'} />
          </button>
          <a className="yd-nav-console" href="?yolo-console">Console</a>
        </div>
      </div>
    </header>
  )
}
