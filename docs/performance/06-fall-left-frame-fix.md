# 06: แจ้งเตือน "หกล้มแล้วหายไปจากเฟรม" ทำงานได้จริงด้วยค่าเริ่มต้น

**What to build:** เมื่อคนร่วงตัวเร็วแล้วหลุดออกนอกเฟรม แอปขึ้นแบนเนอร์ `fall_suspected_left_frame` ได้จริง ปัจจุบันเงื่อนไขนี้ไม่มีทางเป็นจริง: เช็คตอนลบ track (≥ 4 วิหลังเห็นครั้งสุดท้าย) โดยเทียบกับ `now` แต่ `disappearGraceMs` มีค่าเริ่มต้น 2.5 วิ ให้เปลี่ยนไปวัดจาก "เห็นครั้งสุดท้ายเมื่อไร" แทน

**Blocked by:** 01

**Status:** done

อ้างอิง: guide ขั้น 1.5 · plan Step 1.5

- [x] `PersonState` มี `lastSeenAt` กำหนดตอนสร้าง person และทุกครั้งที่ match
- [x] เงื่อนไขเปลี่ยนเป็น `person.lastSeenAt - person.lastRapidDropAt <= disappearGraceMs` และไม่อ้างถึง `now` อีก
- [x] การตรวจการล้มแบบ edge-triggered ปกติ (`fall_detected`) ทำงานเหมือนเดิม และเทสต์ของ fall detection ยังเขียว
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 06-browser-smoke.md) — เลื่อนไปทดสอบซ้ำภายหลังตามการตัดสินใจของผู้ใช้
