# 11: แสดงเวลาที่ AI ใช้ต่อเฟรม (ms) บนบรรทัดสถานะ

**What to build:** ผู้ใช้และนักพัฒนาเห็นเวลาที่ pose inference ใช้ (เฉลี่ยแบบ EMA) ข้างจำนวนคนที่ตรวจพบในแต่ละกล้อง ใช้เทียบผลของโหมด Workstation กับ Multi และกล้อง 1 ตัวกับ 2 ตัว

**Blocked by:** 10 (วัดเฉพาะรอบที่รันจริงหลังมี throttle)

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 3.3 · plan Step 3.3

- [ ] วัดเวลารอบ `detectForVideo` แล้วเก็บแบบ EMA (0.9 ค่าเก่า / 0.1 ค่าใหม่) ใน `poseInferenceMsRef`
- [ ] ส่งค่าออกไปใน summary tick เดิมทุก 500 ms (ไม่เพิ่ม `setState` รายเฟรม)
- [ ] ค่าแสดงในบรรทัดสถานะข้างจำนวนคน
- [ ] Gate เขียว
