# 14: (ไม่บังคับ) แยก logic ต่อเฟรมออกจาก React เป็น posture engine

**What to build:** logic ต่อเฟรมทั้งหมดที่ไม่เกี่ยวกับ UI (tracker → features → smoothing → classify → state machines → fall detection → break timer) อยู่ในโมดูล `src/lib/` ที่ไม่ใช้ React รับ landmarks, ขนาดเฟรม, `now`, settings แล้วคืน started/ended events, fall events และ break-due ทำให้เทสต์พฤติกรรมตลอดช่วงเวลาได้โดยไม่ต้องมีกล้อง ส่วน `CameraStage` เหลือหน้าที่จัดการแหล่งภาพ, วาด, เสียง และ callback

**Blocked by:** 05, 06, 13

**Status:** done

อ้างอิง: guide ขั้น 5.6 · plan Phase 5.6 · branch `phase-5-engine`

- [x] เทสต์ระดับ engine (a): ท่าผิดจำลอง 10 วิ ได้ posture start event 1 ครั้งพอดี
- [x] เทสต์ระดับ engine (b): ไหล่ร่วงเร็ว แล้วหายไป 5 วิ ได้ `fall_suspected_left_frame` 1 ครั้งพอดี
- [x] `CameraStage` ไม่เรียก `stepSustainedAlert` สำหรับท่านั่งโดยตรงอีก
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 14-browser-smoke.md) — ผู้ใช้เลือก skip และปิด Ticket นี้โดยอิง code review + automated verification ที่ผ่านแล้ว
