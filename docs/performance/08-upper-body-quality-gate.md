# 08: รองรับการนั่งหน้า webcam โน้ตบุ๊กที่มองไม่เห็นสะโพก

**What to build:** ผู้ใช้ที่นั่งหน้า webcam โน้ตบุ๊ก (เห็นแค่ศีรษะและไหล่) ยังถูกตรวจท่านั่งได้ ไม่หายไปเป็น "ไม่พบคน" และไม่โดนรายงานว่า `leaning` ทั้งที่นั่งตรง ป้ายสถานะต่อท้ายด้วย `(เห็นแค่ช่วงบน)` ส่วนการตรวจการล้มยังทำงานต่อและไม่แจ้งผิดเมื่อไม่รู้มุมลำตัว

**Blocked by:** 07

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 2.3 · plan Step 2.2

> ทางเลือก: ถ้าจะทำ ticket 12 ต่อในรอบเดียวกัน ทำ ticket นี้ในรูปแบบ Phase 4 ไปเลยได้ (`extractPostureFeatures` คืน `null` เมื่อไม่พบคน) จะได้ไม่ต้องเขียน `analyzePosture` ใหม่ระหว่างทาง

- [ ] ต้องเห็นศีรษะและไหล่ ไม่อย่างนั้นถือว่าไม่พบคน ส่วนสะโพกไม่บังคับ
- [ ] ผลลัพธ์มี `quality: 'full_body' | 'upper_body'` และ `torsoAngleDeg: number | null`; ข้ามการเช็ค slouch เมื่อเป็น `null`
- [ ] ป้ายใน UI ต่อท้าย `(เห็นแค่ช่วงบน)` เมื่อ `upper_body`
- [ ] บล็อก fall detection: `isNearHorizontal` เป็น false เมื่อ torso angle เป็น `null`; metrics ใช้ `?? 0`
- [ ] เทสต์: pose ที่มีแค่หู + ไหล่ ได้ `quality === 'upper_body'` และ `torsoAngleDeg === null`
- [ ] เทสต์ของ fall detection ยังเขียว
- [ ] Gate เขียว
