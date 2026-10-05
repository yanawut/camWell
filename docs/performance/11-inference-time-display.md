# 11: แสดงเวลาที่ AI ใช้ต่อเฟรม (ms) บนบรรทัดสถานะ

**What to build:** ผู้ใช้และนักพัฒนาเห็นเวลาที่ pose inference ใช้ (เฉลี่ยแบบ EMA) ข้างจำนวนคนที่ตรวจพบในแต่ละกล้อง ใช้เทียบผลของโหมด Workstation กับ Multi และกล้อง 1 ตัวกับ 2 ตัว

**Blocked by:** 10 (วัดเฉพาะรอบที่รันจริงหลังมี throttle)

**Status:** done

อ้างอิง: guide ขั้น 3.3 · plan Step 3.3

- [x] วัดเวลารอบ `detectForVideo` แล้วเก็บแบบ EMA (0.9 ค่าเก่า / 0.1 ค่าใหม่) ใน `poseInferenceMsRef`
- [x] ส่งค่าออกไปใน summary tick เดิมทุก 500 ms (ไม่เพิ่ม `setState` รายเฟรม)
- [x] ค่าแสดงในบรรทัดสถานะข้างจำนวนคน
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 11-browser-smoke.md) — เลื่อนไปทดสอบซ้ำภายหลังตามการตัดสินใจของผู้ใช้
