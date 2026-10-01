import type { EnrolledPerson } from '../types/identity'

interface Props {
  people: EnrolledPerson[]
  onRemove: (id: string) => void
}

export default function EnrollmentPanel({ people, onRemove }: Props) {
  return (
    <div className="panel enrollment-panel">
      <h2>พนักงานที่ลงทะเบียนใบหน้าไว้ ({people.length})</h2>
      <p className="panel-note">
        ลงทะเบียนได้จากช่องใต้ภาพกล้อง (ต้องเห็นหน้าชัดเจนก่อน) ข้อมูลเก็บไว้ที่ camwell-backend (ฐานข้อมูล SQLite
        กลาง) ทำให้คนที่ลงทะเบียนแล้วถูกจำได้ทุกเครื่อง/ทุกกล้องในออฟฟิศนี้ —{' '}
        <strong>ต้องขอความยินยอมจากพนักงานก่อนลงทะเบียนจริงเสมอ</strong> (มีช่องให้ติ๊กยืนยันก่อนลงทะเบียน ดู
        รายละเอียดเรื่อง PDPA ใน camwell-backend/README.md)
      </p>
      {people.length === 0 ? (
        <p className="empty-state">ยังไม่มีใครลงทะเบียนไว้</p>
      ) : (
        <ul className="enrolled-list">
          {people.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              <button type="button" className="link-button" onClick={() => onRemove(p.id)}>
                ลบ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
