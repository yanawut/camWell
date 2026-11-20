import type { EnrolledPerson } from '../types/identity'

interface Props {
  people: EnrolledPerson[]
  error: string | null
  onRemove: (id: string) => void
}

export default function PeopleTab({ people, error, onRemove }: Props) {
  return (
    <>
      <div className="dc-pdpa">
        <span>⚠️</span>
        <span>
          Face descriptor เป็นข้อมูลชีวภาพตาม PDPA — ลงทะเบียนได้เฉพาะเมื่อติ๊กยืนยันความยินยอมแล้ว (backend ปฏิเสธคำขอที่ไม่มี{' '}
          <code>consentGiven: true</code>) และพนักงานขอลบได้ตลอดเวลา
        </span>
      </div>
      {error && <p className="dc-warn-note">{error}</p>}
      <div className="dc-card" style={{ overflow: 'hidden' }}>
        <div className="dc-table-toolbar">
          <div className="dc-col">
            <h2 className="dc-h2">พนักงานที่ลงทะเบียนใบหน้าไว้ ({people.length})</h2>
            <span className="dc-mono-11 dc-muted">GET /api/employees · SQLite (camwell-backend)</span>
          </div>
          <span className="dc-muted-12">ลงทะเบียนใหม่จากหน้ากล้อง — ใช้ใบหน้าที่ใหญ่สุดในเฟรม</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dc-table">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>ID</th>
                <th>Descriptor</th>
                <th>ความยินยอม</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="dc-mono dc-muted" style={{ fontSize: 12 }}>{p.id}</td>
                  <td className="dc-mono dc-muted" style={{ fontSize: 12 }}>Float32 × 128</td>
                  <td style={{ color: p.consentGivenAt ? 'var(--good)' : 'var(--warn)' }}>
                    {p.consentGivenAt ? '✓ ยืนยันแล้ว' : 'ไม่มีบันทึก'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="dc-link-danger" onClick={() => onRemove(p.id)}>
                      ลบข้อมูล
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {people.length === 0 && <p className="dc-empty dc-empty-pad">ยังไม่มีใครลงทะเบียนไว้</p>}
      </div>
    </>
  )
}
