# 02: ลบ stub ที่ไม่มีใครใช้ (alertStateMachine, PostureMonitor)

**What to build:** codebase ไม่มีไฟล์ stub ที่ไม่มีใคร import เหลืออยู่ ลดความสับสนสำหรับ agent/คนที่มาอ่านโค้ดต่อ โดย UI หน้าตาเหมือนเดิมทุกอย่าง

**Blocked by:** 01 (ต้องมี test gate ก่อน)

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 1.1 · plan Step 1.1 · branch `phase-1-bugfix`

- [ ] grep ยืนยันว่า `alertStateMachine` และ `PostureMonitor` ไม่มีผู้ import ก่อนลบ
- [ ] ลบโมดูล `alertStateMachine` และคอมโพเนนต์ `PostureMonitor`
- [ ] เปลี่ยนชื่อคอมเมนต์ `/* --- PostureMonitor --- */` ใน `App.css` แต่ **คง** rule CSS ใต้คอมเมนต์ไว้ (ยังถูกใช้อยู่)
- [ ] grep ทั้งสองชื่อใน `src/` ไม่เจออะไรเลย
- [ ] Gate เขียว
