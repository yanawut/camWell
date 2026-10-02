# 10: จำกัดการรัน pose ไว้ที่ ~12 ครั้ง/วินาที

**What to build:** ใช้ CPU น้อยลงชัดเจน โดยเฉพาะกล้อง IP (MJPEG) ที่ตอนนี้รัน pose ทุก rAF tick เพราะไม่มีสัญญาณ "เฟรมใหม่" โดยโครงร่างยังแสดงนิ่ง (tick ที่ข้ามไปวาดผลล่าสุดจาก ticket 04)

**Blocked by:** 04 (tick ที่ข้ามต้องใช้ `latestPoseResultRef` ไม่อย่างนั้นโครงร่างจะกลับมากระพริบ)

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 3.2 · plan Step 3.2

- [ ] `shouldProcessPose` มีเงื่อนไข `perfNow - lastPoseRunAtRef.current >= POSE_INTERVAL_MS` (`1000 / 12`) ใช้กับแหล่งภาพทั้งสองแบบ
- [ ] ยังคงเช็คเฟรมใหม่ด้วย `currentTime` สำหรับ `<video>` ไว้เหมือนเดิม
- [ ] ส่ง `perfNow` ตัวเดียวกันเข้า `detectForVideo`
- [ ] Gate เขียว
