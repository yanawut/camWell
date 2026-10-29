# 02: ลบ stub ที่ไม่มีใครใช้ (alertStateMachine, PostureMonitor)

**What to build:** codebase ไม่มีไฟล์ stub ที่ไม่มีใคร import เหลืออยู่ ลดความสับสนสำหรับ agent/คนที่มาอ่านโค้ดต่อ โดย UI หน้าตาเหมือนเดิมทุกอย่าง

**Blocked by:** 01 (ต้องมี test gate ก่อน)

**Status:** done

อ้างอิง: guide ขั้น 1.1 · plan Step 1.1 · branch `phase-1-bugfix`

- [x] grep ยืนยันว่า `alertStateMachine` และ `PostureMonitor` ไม่มีผู้ import ก่อนลบ
- [x] ลบโมดูล `alertStateMachine` และคอมโพเนนต์ `PostureMonitor`
- [x] เปลี่ยนชื่อคอมเมนต์ `/* --- PostureMonitor --- */` ใน `App.css` แต่ **คง** rule CSS ใต้คอมเมนต์ไว้ (ยังถูกใช้อยู่)
- [x] grep ทั้งสองชื่อใน `src/` ไม่เจออะไรเลย
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 02-browser-smoke.md) — เลื่อนไปทดสอบซ้ำภายหลังตามการตัดสินใจของผู้ใช้
