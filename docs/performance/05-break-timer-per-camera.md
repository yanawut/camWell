# 05: ตัวจับเวลาเตือนพักระดับโต๊ะ (ต่อกล้อง) ที่ไม่รีเซ็ตเมื่อลุกไปแป๊บเดียว

**What to build:** การเตือนพักนับ "เวลานั่งต่อเนื่องหน้ากล้องนี้" ไม่ใช่ต่อ track ของคน ลุกไปหยิบของ 10 วินาทีแล้วกลับมาจะนับต่อจากเดิม จะรีเซ็ตก็ต่อเมื่อไม่มีใครอยู่นานเกิน `breakResetMs` (ตั้งได้จากสไลเดอร์ใน ticket 03) แต่ละกล้องมีตัวจับเวลาของตัวเอง ข้อความเตือนใช้คำว่า "คุณ" หรือ "คนที่นั่งหน้า<ชื่อกล้อง>" เมื่อต่อหลายกล้อง

**Blocked by:** 01, 03 (`breakResetMs` และสไลเดอร์)

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 1.4, §5.3 · plan Step 1.4

- [ ] `BreakReminderState` มี `lastPresentAtMs`; `stepBreakReminder(prev, isPresent, now, thresholds)` รีเซ็ตเฉพาะเมื่อหายไป ≥ `breakResetMs`
- [ ] ลบ `breakState` ออกจาก `PersonState`; มี `deskBreakStateRef` หนึ่งตัวต่อ `CameraStage` เดินหนึ่งครั้งต่อ pose frame ด้วย `isPresent = matches.length > 0`
- [ ] ป้ายชื่อ: `'คุณ'` ในโหมดกล้องเดียว, `` `คนที่นั่งหน้า${p.cameraLabel}` `` ในโหมดหลายกล้อง
- [ ] ค่าใหม่ที่ loop อ่านถูกเพิ่มเข้า `propsRef` ทั้งสองจุด
- [ ] เทสต์ของ break reminder (guide §5.3) ผ่าน: หายไป 10 วิยังนับต่อ, หายไป 4 นาทีรีเซ็ต, เตือนครั้งเดียว
- [ ] Gate เขียว
