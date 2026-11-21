import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import './ConfirmDialog.css'

// กล่องยืนยันแบบแผ่นฉลาก แทน window.confirm() ซึ่งเบราว์เซอร์วาดเองและแต่งธีมไม่ได้
// ใช้ <dialog> + showModal() จึงได้ Esc ปิด กันกดด้านหลัง และคืนโฟกัสให้ปุ่มเดิมจากเบราว์เซอร์

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** การกระทำที่ย้อนกลับไม่ได้ เช่น ลบข้อมูลใบหน้า: ปุ่มยืนยันเป็นสีแดงตรายาง */
  danger?: boolean
}

interface DialogProps extends ConfirmOptions {
  onDone: (confirmed: boolean) => void
}

function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'ยกเลิก', danger = false, onDone }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // โฟกัสแรกอยู่ที่ "ยกเลิก" กัน Enter พลาดไปยืนยันการลบ
    cancelRef.current?.focus()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="rx-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onClose={() => onDone(dialogRef.current?.returnValue === 'confirm')}
    >
      <form method="dialog">
        <h2 id={titleId} className="rx-dialog-title">
          {title}
        </h2>
        <div id={messageId} className="rx-dialog-message">
          {message}
        </div>
        <div className="rx-dialog-actions">
          <button ref={cancelRef} type="submit" value="cancel" className="rx-secondary is-small">
            {cancelLabel}
          </button>
          <button type="submit" value="confirm" className={`rx-dialog-confirm${danger ? ' is-danger' : ''}`}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

/**
 * const [confirm, confirmDialog] = useConfirm()
 * if (await confirm({ ... })) { ... }   — แล้ววาง {confirmDialog} ไว้ที่ใดก็ได้ใน JSX ของหน้า
 */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (confirmed: boolean) => void }) | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  )

  const dialog = pending ? (
    <ConfirmDialog
      {...pending}
      onDone={(confirmed) => {
        pending.resolve(confirmed)
        setPending(null)
      }}
    />
  ) : null

  return [confirm, dialog] as const
}
