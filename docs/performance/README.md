# Camwell MVP1.1: tickets

แตกมาจาก spec [camwell-agent-implementation-plan.md](camwell-agent-implementation-plan.md) (base `1be4407`) ซึ่งอยู่ในโฟลเดอร์นี้ ใช้โค้ดที่ตรวจแล้วจาก [camwell-step-by-step-guide.md](camwell-step-by-step-guide.md) ในโฟลเดอร์เดียวกัน (อ้างว่า "guide" ในแต่ละ ticket) ขอบเขต: `src/` เท่านั้น ไม่แตะ `backend/`

Gate ของทุก ticket: `npm run build` · `npm run lint` · `npx vitest run` ต้องเขียวทั้งหมด

> หมายเหตุ: find-block ใน guide เขียนไว้ให้ทำตามลำดับเลข ticket ถ้าทำ ticket ที่ไม่ได้ติดกันแบบขนานกัน (เช่น 06 ก่อน 05) อาจต้องปรับ find-block เอง ลำดับที่แนะนำคือเรียงตามเลข ยกเว้น guide ขั้น 6.2 (ticket 16) ซึ่งเขียนบนโครงโค้ดก่อน ticket 14 ย้าย tracker/posture logic เข้า `PostureEngine` จึงใช้ find-block ไม่ได้ทั้งขั้น ต้อง implement ใหม่ตามโครง engine (ดูหมายเหตุใน ticket 16)

| # | Ticket | Blocked by | Plan step |
|---|---|---|---|
| 01 | [Vitest + แก้ null-check ของ state machine](01-test-harness.md) | – | 0 |
| 02 | [ลบ stub ที่ไม่มีใครใช้](02-remove-dead-stubs.md) | 01 | 1.1 |
| 03 | [UI ท่านั่ง/เตือนพักไม่ผูกกับฟีเจอร์ใบหน้า](03-posture-ui-independent-of-face.md) | 01 | 1.2 |
| 04 | [โครงร่างไม่กระพริบ](04-skeleton-flicker.md) | 01 | 1.3 |
| 05 | [ตัวจับเวลาเตือนพักต่อกล้อง](05-break-timer-per-camera.md) | 01, 03 | 1.4 |
| 06 | [แก้ fall แบบหลุดเฟรม](06-fall-left-frame-fix.md) | 01 | 1.5 |
| 07 | [มุมไหล่เอียงไม่ขึ้นกับทิศกล้อง](07-shoulder-tilt-orientation.md) | 01 | 2.1 |
| 08 | [รองรับการเห็นแค่ช่วงบน](08-upper-body-quality-gate.md) | 07 | 2.2 |
| 09 | [โหมด Workstation / Multi](09-detection-mode.md) | 01 | 3.1 |
| 10 | [จำกัด pose ~12 fps](10-pose-throttle.md) | 04 | 3.2 |
| 11 | [แสดง inference ms](11-inference-time-display.md) | 10 | 3.3 |
| 12 | [วัดใน pixel space + smoothing](12-pixel-space-features-smoothing.md) | 08 | 4 (ส่วน 1) |
| 13 | [Calibration ต่อกล้อง](13-per-camera-calibration.md) | 12 | 4 (ส่วน 2) |
| 14 | [แยก posture engine](14-posture-engine-extraction.md) (ทำแล้ว ticket 16 จึงต้องยึดโครง engine) | 05, 06, 13 | 5.6 |
| 15 | ~~[หลายปัญหาพร้อมกัน](15-multi-issue-posture.md)~~ **skipped**: RULA รวมเป็นคะแนนเดียว การเตือนแยกต่อปัญหาจะต้องรื้อทิ้ง | 13 | 6.1 |
| 16 | [Dataset recorder (dev)](16-dataset-recorder.md) | 13 | 6.2 |
| 17 | [[HITL] ตรวจกับกล้องจริง + รายงาน](17-hitl-camera-verification.md) | 01–14, 16 | Hand-off |

ถัดไป: ticket RULA Group B (คอ/ลำตัว/ขา) จะตามมาหลัง 16–17
