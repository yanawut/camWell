# 05: ตัวจับเวลาเตือนพักระดับโต๊ะ (ต่อกล้อง) ที่ไม่รีเซ็ตเมื่อลุกไปแป๊บเดียว

**What to build:** การเตือนพักนับ "เวลานั่งต่อเนื่องหน้ากล้องนี้" ไม่ใช่ต่อ track ของคน ลุกไปหยิบของ 10 วินาทีแล้วกลับมาจะนับต่อจากเดิม จะรีเซ็ตก็ต่อเมื่อไม่มีใครอยู่นานเกิน `breakResetMs` (ตั้งได้จากสไลเดอร์ใน ticket 03) แต่ละกล้องมีตัวจับเวลาของตัวเอง ข้อความเตือนใช้คำว่า "คุณ" หรือ "คนที่นั่งหน้า<ชื่อกล้อง>" เมื่อต่อหลายกล้อง

**Blocked by:** 01, 03 (`breakResetMs` และสไลเดอร์)

**Status:** done

อ้างอิง: guide ขั้น 1.4, §5.3 · plan Step 1.4

- [x] `BreakReminderState` มี `lastPresentAtMs`; `stepBreakReminder(prev, isPresent, now, thresholds)` รีเซ็ตเฉพาะเมื่อหายไป ≥ `breakResetMs`
- [x] ลบ `breakState` ออกจาก `PersonState`; มี `deskBreakStateRef` หนึ่งตัวต่อ `CameraStage` เดินหนึ่งครั้งต่อ pose frame ด้วย `isPresent = matches.length > 0`
- [x] ป้ายชื่อ: `'คุณ'` ในโหมดกล้องเดียว, `` `คนที่นั่งหน้า${p.cameraLabel}` `` ในโหมดหลายกล้อง
- [x] ค่าใหม่ที่ loop อ่านถูกเพิ่มเข้า `propsRef` ทั้งสองจุด
- [x] เทสต์ของ break reminder (guide §5.3) ผ่าน: หายไป 10 วิยังนับต่อ, หายไป 4 นาทีรีเซ็ต, เตือนครั้งเดียว
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 05-browser-smoke.md) — เลื่อนไปทดสอบซ้ำภายหลังตามการตัดสินใจของผู้ใช้
