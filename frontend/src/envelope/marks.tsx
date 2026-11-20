import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { MARK_LABELS, type MarkState } from './markLabels'

// ชิ้นส่วนที่ใช้ร่วมกันของโลกภาพ "ซองยาประจำออฟฟิศ" (สไตล์อยู่ใน envelope.css)

interface MarkProps {
  state: MarkState
  /** ลำดับวาดเข้าตอนเปิดหน้า (ไม่ใส่ = แสดงทันที) */
  order?: number
  /** ชื่อสำหรับโปรแกรมอ่านหน้าจอ — "" = เครื่องหมายประกอบ ข้อความข้าง ๆ บอกความหมายแล้ว */
  label?: string
  small?: boolean
}

/** ช่องสี่เหลี่ยมพิมพ์ + รอยปากกาวาดเป็นเส้น (ไม่ใช่ไอคอนสำเร็จรูป) */
export function Mark({ state, order, label, small = false }: MarkProps) {
  const style = order === undefined ? undefined : ({ '--rx-order': order } as CSSProperties)
  const a11y = label === '' ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label ?? MARK_LABELS[state] }
  const className = `rx-box is-${state}${small ? ' is-small' : ''}${order === undefined ? '' : ' is-drawn'}`
  return (
    <span className={className} style={style} {...a11y}>
      {state === 'tick' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path pathLength={1} d="M3.6 13.2c1.9 1.4 3.6 3.4 5.1 6.1C11.4 12.6 15.6 6.9 21.4 2.2" />
        </svg>
      )}
      {state === 'ring' && (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path pathLength={1} d="M22.5 4.2c8.6.6 14.2 6.4 13.4 14.6-.8 8.6-8.4 15.4-17.2 14.8C10 33 4.6 27 5.4 19.2 6.2 10.8 12.6 4.4 21 3.9c1.6 0 3 .3 4.4.8" />
        </svg>
      )}
      {state === 'strike' && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path pathLength={1} d="M2.5 13.4c5.6-1.2 12.4-2.2 19-2.6" />
        </svg>
      )}
    </span>
  )
}

/** เครื่องหมายความล้า "Zz" วาดเป็นเส้นปากกา (ไม่ใช่ตัวอักษรพิมพ์) */
export function ZzMark({ label }: { label?: string }) {
  const a11y = label === undefined || label === '' ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label }
  return (
    <svg className="rx-zz" viewBox="0 0 26 18" {...a11y}>
      <path pathLength={1} d="M2.2 4.6c2.6-.5 5.4-.6 8-.3-2.6 3-5.2 6.3-7.6 9.6 2.9-.4 5.9-.4 8.8 0" />
      <path pathLength={1} d="M14.8 8.2c1.9-.3 3.8-.4 5.6-.2-1.8 2.1-3.6 4.3-5.3 6.6 2-.3 4.1-.3 6.2 0" />
    </svg>
  )
}

/**
 * ตัดบรรทัดเฉพาะที่ช่องว่างระหว่างวลี (แบบการจัดหน้าภาษาไทย) — เบราว์เซอร์ตัดคำไทยด้วยพจนานุกรม
 * ทำให้วลีอย่าง "ไหล่เอียง" หรือ "ปิดได้" ขาดกลางบรรทัด
 */
export function Phrases({ text }: { text: string }) {
  return text.split(' ').map((phrase, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className="rx-ph">{phrase}</span>
    </Fragment>
  ))
}

/** ไอคอนลายเส้น viewBox 24 เส้น 1.9 ใช้สีตามตัวอักษรรอบข้าง */
export function Glyph({ children, size = 20, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg className={className ? `rx-glyph ${className}` : 'rx-glyph'} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function Arrow({ size = 18 }: { size?: number }) {
  return <Glyph size={size}><path d="M5 12h14M13 6l6 6-6 6" /></Glyph>
}

export function LockGlyph({ size = 26 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
    </Glyph>
  )
}

/** ปุ่มสลับธีม: แสดงดวงอาทิตย์เมื่ออยู่ธีมมืด (กดแล้วไปสว่าง) และพระจันทร์เมื่ออยู่ธีมสว่าง */
export function ThemeGlyph({ dark }: { dark: boolean }) {
  return (
    <Glyph>
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </>
      ) : (
        <path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z" />
      )}
    </Glyph>
  )
}

// ไอคอนสั่งงานขนาดตัวอักษร วางหน้าข้อความในปุ่ม/แถบ (rx-inline-glyph จัดแนวกับบรรทัด)
export function WarnGlyph({ size = 18 }: { size?: number }) {
  return <Glyph size={size} className="rx-inline-glyph"><path d="M12 4 2.8 19.5h18.4L12 4zM12 10v4.5M12 17.2v.01" /></Glyph>
}

export function PlayGlyph({ size = 16 }: { size?: number }) {
  return <Glyph size={size} className="rx-inline-glyph"><path d="M7 4.5v15l12.5-7.5z" /></Glyph>
}

export function PauseGlyph({ size = 16 }: { size?: number }) {
  return <Glyph size={size} className="rx-inline-glyph"><path d="M8 5v14M16 5v14" /></Glyph>
}

export function StopGlyph({ size = 16 }: { size?: number }) {
  return <Glyph size={size} className="rx-inline-glyph"><rect x="6" y="6" width="12" height="12" fill="currentColor" /></Glyph>
}

export function RecordGlyph({ size = 16 }: { size?: number }) {
  return <Glyph size={size} className="rx-inline-glyph"><circle cx="12" cy="12" r="6" fill="currentColor" /></Glyph>
}
