# 09: โหมดตรวจจับ Workstation (1 คน) / Multi (สูงสุด 4 คน)

**What to build:** ผู้ใช้เลือกได้ใน Settings ว่าจะใช้โหมด Personal Workstation (ค่าเริ่มต้น ตรวจ 1 คน เบาที่สุด) หรือ Multi (สูงสุด 4 คน) โหมดนี้ใช้ร่วมกันทุกกล้อง เมื่อเปลี่ยนโหมด pose model ของทุก `CameraStage` จะโหลดใหม่ด้วย `numPoses` ที่ถูกต้อง และผลใบหน้าถูกจำกัดตามจำนวนเดียวกัน

**Blocked by:** 01

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 3.1 · plan Step 3.1 · branch `phase-3-performance`

- [ ] `DetectionMode = 'workstation' | 'multi'` และ `maxPeopleFor(mode)` (1 / 4) อยู่ในโมดูล multiPerson
- [ ] `usePoseLandmarker(numPoses)` ใส่ `[numPoses]` เป็น dependency ของ effect
- [ ] state ของโหมดอยู่ใน `App` (ค่าเริ่มต้น `'workstation'`), มี radio ใน SettingsPanel, ส่งเป็น prop และเพิ่มเข้า `propsRef` ของ `CameraStage`
- [ ] ผลตรวจใบหน้าถูกตัดเหลือ `maxPeopleFor(mode)`
- [ ] ไม่เหลือการอ้างถึง `MAX_TRACKED_PEOPLE` นอกโมดูล multiPerson (รวมถึงข้อความในบรรทัดสถานะ)
- [ ] Gate เขียว
