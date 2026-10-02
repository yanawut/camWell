# 13: Calibrate ท่านั่งส่วนตัวแยกต่อกล้อง

**What to build:** ผู้ใช้กดปุ่ม "Calibrate" ตอนนั่งท่าที่ถูกต้อง แอปเก็บตัวอย่าง 3 วินาทีแล้วสร้าง baseline ส่วนตัวสำหรับกล้องนั้น ซึ่งยังอยู่หลัง reload จากนั้นการตัดสินท่านั่งจะเทียบกับ baseline (เช่น ก้มดูโทรศัพท์จนศีรษะต่ำลงเกินเกณฑ์ → `forward_head`) กล้องที่สองเริ่มแบบยังไม่ calibrate และมีสไลเดอร์ปรับเกณฑ์ศีรษะตก

**Blocked by:** 12

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 4.4–4.5, §5.4 · plan Phase 4

สัญญา (จาก plan):

```ts
interface PostureBaseline { neckAngleDeg; torsoAngleDeg: number | null; shoulderTiltDeg; headHeightRatio: number | null; createdAt: number }
// PostureThresholds เพิ่ม headDropThreshold (ค่าเริ่มต้น 0.15)
median(values): number | null; computeBaseline(samples, now): PostureBaseline | null  // ต้องมี ≥ 12 ตัวอย่าง
// key: 'camwell:posture-baseline:v1:' + cameraId
loadPostureBaseline(cameraId) / savePostureBaseline(cameraId, b) / clearPostureBaseline(cameraId)
```

- [ ] เมื่อมี baseline เปรียบเทียบด้วยค่าเบี่ยงเบน (`current − baseline`); `headDrop = 1 − current.headHeightRatio / baseline.headHeightRatio` ≥ `headDropThreshold` → `forward_head`
- [ ] เก็บตัวอย่าง **raw** (ก่อน smoothing) ระหว่าง calibrate และเฉพาะเมื่อตรวจพบคนเดียวพอดี
- [ ] ปุ่มตั้ง `calibrationRef = { endsAt: now + 3000, samples: [] }`; เมื่อครบเวลาให้คำนวณ baseline → `savePostureBaseline(p.cameraId, …)` → set state → แสดงข้อความสำเร็จหรือล้มเหลว
- [ ] `CameraStage` เป็นเจ้าของ baseline: `useState(() => loadPostureBaseline(cameraId))`; เพิ่ม `cameraId` และ `postureBaseline` เข้า `propsRef`; **ไม่แตะ `App`** ใน ticket นี้
- [ ] สไลเดอร์ `headDropThreshold` (5–40 %)
- [ ] เทสต์ของ posture analysis ผ่านครบ รวมเคส calibrated head drop → `forward_head`
- [ ] Gate เขียว
