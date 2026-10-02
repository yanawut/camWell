# 15: คนหนึ่งคนมีหลายปัญหาท่านั่งพร้อมกันได้

**What to build:** ถ้าผู้ใช้ทั้งเอนตัวและศีรษะตกพร้อมกัน แอปจะแจ้งเตือนแยกกัน 2 รายการ แต่ละรายการเริ่มและจบได้อิสระ แทนที่จะเลือกแสดงแค่ปัญหาเดียว

**Blocked by:** 13

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 6.1 · plan Step 6.1 · branch `phase-6-issues-dataset`

- [ ] `PostureProblem = 'forward_head' | 'slouching' | 'leaning'` และ `POSTURE_PROBLEMS`
- [ ] `classifyPosture` คืน `PostureProblem[]` (array ว่าง = ท่าถูกต้อง)
- [ ] `PersonState.postureStates: Record<PostureProblem, SustainedAlertState>` แต่ละ machine เดินด้วย `issues.includes(p) ? p : 'good'`
- [ ] `recomputeAlertUi` และการเก็บกวาดตอนลบ track วนครบทั้ง 3 ปัญหา (ปิด active event ที่ค้างอยู่)
- [ ] ไม่แก้ตัว state machine และ fall detection
- [ ] เทสต์ทั้งหมด 17 ข้อ: เทสต์เดิมเปลี่ยนเป็น `toEqual([])` / `toEqual(['leaning'])` และมีเทสต์ใหม่ที่ pose เดียวได้ทั้ง `forward_head` และ `leaning`
- [ ] Gate เขียว
