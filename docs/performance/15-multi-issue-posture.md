# 15: คนหนึ่งคนมีหลายปัญหาท่านั่งพร้อมกันได้

**What to build:** ถ้าผู้ใช้ทั้งเอนตัวและศีรษะตกพร้อมกัน แอปจะแจ้งเตือนแยกกัน 2 รายการ แต่ละรายการเริ่มและจบได้อิสระ แทนที่จะเลือกแสดงแค่ปัญหาเดียว

**Blocked by:** 13

**Status:** skipped

## เหตุผลที่ข้าม

ขั้นถัดไปของโปรเจกต์คือให้คะแนนตามมาตรฐาน RULA (Rapid Upper Limb Assessment, McAtamney & Corlett 1993) เฉพาะ Group B คือ คอ/ลำตัว/ขา RULA รวมคะแนนแต่ละส่วนผ่านตาราง B ออกมาเป็นคะแนนเดียว แล้วรวมต่อเป็นคะแนนสุดท้ายตัวเดียว เส้นทางแจ้งเตือนหลักจึงจะเป็นเหตุการณ์เดียวตามระดับคะแนน (1–2 ยอมรับได้, 3–4 ต้องตรวจสอบ, 5–6 ต้องแก้ในไม่ช้า, 7 ต้องแก้ทันที)

- `SustainedAlertState` แยกต่อปัญหาตาม ticket นี้จึงเป็นโครงสร้างที่ต้องรื้อทีหลัง
- คนที่ท่าแย่ที่สุดจะโดนเตือนหลายเด้งพร้อมกัน ซึ่งเป็นสาเหตุหลักที่ระบบแบบนี้ถูกผู้ใช้ปิดใช้งาน
- ไม่มีข้อมูลสูญหายจากการข้าม เพราะ `PostureFeatures` (ticket 12) เก็บมุมทั้งสามไว้ครบแล้ว

ถ้าภายหลังต้องการแยกแสดงหลายปัญหาจริง ให้ทำบนฐาน RULA เพราะตารางจะบอกเองว่าส่วนไหนดันคะแนนขึ้น ไม่ต้องมี state machine ต่อปัญหา

## ขอบเขตเดิม (ไม่ทำ)

อ้างอิง: guide ขั้น 6.1 · plan Step 6.1 · branch `phase-6-issues-dataset`

- [ ] `PostureProblem = 'forward_head' | 'slouching' | 'leaning'` และ `POSTURE_PROBLEMS`
- [ ] `classifyPosture` คืน `PostureProblem[]` (array ว่าง = ท่าถูกต้อง)
- [ ] `PersonState.postureStates: Record<PostureProblem, SustainedAlertState>` แต่ละ machine เดินด้วย `issues.includes(p) ? p : 'good'`
- [ ] `recomputeAlertUi` และการเก็บกวาดตอนลบ track วนครบทั้ง 3 ปัญหา (ปิด active event ที่ค้างอยู่)
- [ ] ไม่แก้ตัว state machine และ fall detection
- [ ] เทสต์ทั้งหมด 17 ข้อ: เทสต์เดิมเปลี่ยนเป็น `toEqual([])` / `toEqual(['leaning'])` และมีเทสต์ใหม่ที่ pose เดียวได้ทั้ง `forward_head` และ `leaning`
- [ ] Gate เขียว
