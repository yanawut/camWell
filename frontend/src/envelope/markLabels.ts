/** สถานะของช่องติ๊ก ใช้ความหมายเดียวกันทุกหน้า: ว่าง = ไม่เตือน, ติ๊ก = เรียบร้อย, วงแดง = เตือน (ค้างนาน), ขีดฆ่า = คลี่คลายแล้ว */
export type MarkState = 'empty' | 'tick' | 'ring' | 'strike'

export const MARK_LABELS: Record<MarkState, string> = {
  empty: 'ไม่เตือน',
  tick: 'เรียบร้อย',
  ring: 'เตือน',
  strike: 'คลี่คลายแล้ว',
}
