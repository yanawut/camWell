// เปิดฟีเจอร์ใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/จดจำใบหน้า + ลงทะเบียนอัตโนมัติ) ตั้งแต่เปิดหน้าเว็บ — ปิดเองได้ในตั้งค่า
export const DEFAULT_FACE_FEATURES_ENABLED = true

export interface CameraPeopleVisibility {
  showPeopleList: boolean
  showEmptyState: boolean
}

export function getCameraPeopleVisibility(peopleCount: number): CameraPeopleVisibility {
  return {
    showPeopleList: peopleCount > 0,
    showEmptyState: peopleCount === 0,
  }
}
