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
        ลงทะเบียนได้จากช่องใต้ภาพกล้อง (ต้องเห็นหน้าชัดเจนก่อน) ข้อมูลเก็บเฉพาะในเบราว์เซอร์เครื่องนี้เท่านั้น
        ไม่ส่งออกไปไหน — <strong>ควรขอความยินยอมจากพนักงานก่อนลงทะเบียนจริงเสมอ</strong> (ดูรายละเอียดเรื่อง PDPA ใน README)
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
