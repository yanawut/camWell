# 12: วัดท่านั่งใน pixel space + ทำค่าให้เรียบ (smoothing)

**What to build:** มุมคอ/ลำตัว/ไหล่ไม่เพี้ยนตามสัดส่วนภาพ (คำนวณในหน่วยพิกเซลก่อน `atan2`) และค่าที่ใช้ตัดสินท่านั่งเรียบขึ้น สถานะไม่สลับไปมาจาก noise รายเฟรม แยกขั้น "ดึง feature" กับ "จัดประเภท" ออกจากกันเพื่อรองรับ calibration ใน ticket 13 ส่วน fall detection ยังอ่านค่า **raw**

**Blocked by:** 08 (ขยายจาก `quality` / torso ที่เป็น `null` ได้)

**Status:** done

อ้างอิง: guide ขั้น 4.1–4.3 และส่วนเชื่อม smoothing ใน 4.5, §5.4 · plan Phase 4

สัญญา (จาก plan):

```ts
type PoseQuality = 'full_body' | 'upper_body'
interface PostureFeatures { quality; neckAngleDeg: number; torsoAngleDeg: number | null; shoulderTiltDeg: number; headHeightRatio: number | null }
extractPostureFeatures(landmarks, frame: { width; height }, minVisibility): PostureFeatures | null
classifyPosture(features, thresholds, baseline: PostureBaseline | null)  // ณ ขั้นนี้คืนปัญหาเดียว
ema(prev: number | null, cur, alpha); smoothFeatures(prev | null, cur, alpha)
```

- [x] geometry ทั้งหมดคำนวณใน pixel space (`x * width`, `y * height`) โดยใช้ `canvas.width/height` เป็นขนาดเฟรม
- [x] `headHeightRatio = (shoulderMid.y − head.y) / shoulderWidthPx` คิดเฉพาะเมื่อเห็นไหล่ทั้งสองข้าง
- [x] ลำดับต่อเฟรมใน `CameraStage`: extract → `smoothFeatures` (alpha 0.3 เก็บใน `PersonState.smoothedFeatures`) → classify → posture state machine
- [x] fall detection อ่าน `features.torsoAngleDeg` ที่เป็นค่า raw (ยังไม่ผ่าน smoothing)
- [x] ไม่เหลือการอ้างถึง `analyzePosture` หรือ `analysis.` ใน `CameraStage`
- [x] เทสต์ของ posture analysis ผ่านในส่วนที่ไม่ต้องมี baseline: ไหล่ระดับเดียวกัน ≈ 0°, upper-body quality, ไม่เห็นไหล่ → `null`, `good`, `leaning`; มีเทสต์ของ `ema`/`smoothFeatures`
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 12-browser-smoke.md) — ผู้ใช้เลือก skip และปิด Ticket นี้โดยอิง code review + automated verification ที่ผ่านแล้ว
