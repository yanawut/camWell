# Camwell — Frontend (Phase 1: MVP)

Webapp เชื่อมกล้องเพื่อตรวจจับท่านั่งและความเหนื่อยล้าของพนักงานออฟฟิศ และแจ้งเตือนเมื่อพบปัญหาต่อเนื่อง

**Phase 1 (โค้ดชุดนี้)**: ทำงานแบบ client-side ล้วน — กล้อง + AI + ตรรกะแจ้งเตือนทั้งหมดรันในเบราว์เซอร์
ไม่มีวิดีโอ/ภาพส่งออกจากเครื่องผู้ใช้เลย

**Phase 2 (ขั้นถัดไป)**: เชื่อมกับ backend เพื่อรวม dashboard ของ HR/หัวหน้างาน เก็บ log ลงฐานข้อมูล
และแจ้งเตือนผ่านช่องทางอื่น (เช่น LINE Messaging API) — ดูหัวข้อ "แผน Phase 2" ด้านล่าง

## ฟีเจอร์ที่มีตอนนี้

1. **ท่านั่ง** — ก้มคอ/ยื่นคอ, หลังค่อม/โน้มตัว, นั่งเอียงข้าง (MediaPipe Pose Landmarker)
2. **ความเหนื่อยล้า** — ง่วง/หลับตานาน (Eye Aspect Ratio), หาวถี่ผิดปกติ (Mouth Aspect Ratio) (@vladmandic/face-api)
3. **ระยะห่างจากจอ** — เตือนเมื่อนั่งใกล้จอเกินกว่าค่าที่ calibrate ไว้
4. **เตือนพัก** — นั่งต่อเนื่องนานเกินไปโดยไม่ลุก (ไม่เกี่ยวกับท่านั่งถูก/ผิด)
5. **Face recognition (ระบุตัวตน)** — ลงทะเบียนใบหน้าไว้ในเครื่อง จับคู่ว่าใครกำลังนั่งอยู่ ⚠️ ดูคำเตือนเรื่อง PDPA ด้านล่าง

## เทคโนโลยีที่ใช้

- **React 19 + TypeScript + Vite**
- **react-webcam** — เข้าถึงกล้องผ่าน `getUserMedia`
- **@mediapipe/tasks-vision (Pose Landmarker / BlazePose)** — ตรวจท่านั่ง รันในเบราว์เซอร์ผ่าน WebAssembly
  ล้วนๆ (ไม่เรียก API ภายนอกตอนใช้งานจริง) — License Apache 2.0 ใช้เชิงพาณิชย์ได้ฟรี
- **@vladmandic/face-api** — ตรวจความเหนื่อยล้า/ระยะห่างจอ/ระบุตัวตน รันในเบราว์เซอร์ผ่าน TensorFlow.js
  (bundle มาในตัว ไม่มี dependency แยก) — License MIT ใช้เชิงพาณิชย์ได้ฟรีเช่นกัน

ทั้งสองโมเดลตั้งใจเลือกเฉพาะที่ license เป็น Apache 2.0 / MIT เพื่อให้ใช้ในซอฟต์แวร์เชิงพาณิชย์ปิด
(closed-source) ของบริษัทได้โดยไม่มีปัญหาลิขสิทธิ์ — ดูหัวข้อ "ข้อควรทราบเรื่องโมเดล AI" ด้านล่าง

## เริ่มต้นใช้งาน

```bash
npm install       # ติดตั้ง dependency + รัน postinstall ที่จะ:
                   #   1) คัดลอก WASM runtime ของ MediaPipe มาไว้ที่ public/wasm
                   #   2) ดาวน์โหลดไฟล์โมเดล pose_landmarker_lite.task มาไว้ที่ public/models
                   #      (จาก storage.googleapis.com)
                   #   3) ดาวน์โหลดไฟล์โมเดลของ face-api มาไว้ที่ public/models/face-api
                   #      (จาก raw.githubusercontent.com — เครือข่ายองค์กรส่วนใหญ่มักไม่บล็อก)
npm run dev        # เปิด dev server (http://localhost:5173)
```

ถ้าเครือข่ายของคุณบล็อกการดาวน์โหลดโมเดลใดอัตโนมัติ ให้ดูวิธีดาวน์โหลดเองที่ `public/models/README.md`
และ `public/models/face-api/README.md` หรือรัน `npm run setup:assets` ใหม่อีกครั้งภายหลัง

เปิดเบราว์เซอร์แล้วอนุญาตการใช้กล้องเมื่อถูกถาม จะเห็นโครงร่างร่างกาย (skeleton) + กรอบใบหน้า วาดทับตัวเอง
แบบเรียลไทม์ พร้อมสถานะต่างๆ ด้านล่างวิดีโอ

## วิธีทำงานของแต่ละฟีเจอร์

### ท่านั่ง
1. `usePoseLandmarker` โหลดโมเดล BlazePose (33 keypoints) จากไฟล์ local
2. ทุกเฟรมวิดีโอ เรียก `detectForVideo()` ได้พิกัด keypoint ของไหล่ หู จมูก สะโพก ฯลฯ
3. `lib/postureAnalysis.ts` คำนวณมุมคอ/มุมลำตัว/มุมเอียงไหล่ → จำแนกเป็น forward_head / slouching / leaning

### ความเหนื่อยล้า + ระยะห่างจอ + ระบุตัวตน
1. `useFaceApiModels` โหลดโมเดล TinyFaceDetector + FaceLandmark68 + FaceRecognition จากไฟล์ local
2. ตรวจจับใบหน้าแบบ throttled (ทุก ~400ms ไม่ใช่ทุกเฟรม เพราะหนักกว่า pose และไม่จำเป็นต้องไวเท่า)
3. `lib/fatigueAnalysis.ts` คำนวณ Eye Aspect Ratio (ตาหลับ) และ Mouth Aspect Ratio (อ้าปาก/หาว) จาก
   68 จุด landmark ใบหน้า
4. `lib/distanceAnalysis.ts` เทียบขนาดกรอบใบหน้าปัจจุบันกับค่า baseline ที่ calibrate ไว้ (ปุ่มใต้วิดีโอ)
5. `services/faceEnrollment.ts` + `types/identity.ts` จับคู่ descriptor 128 มิติกับรายชื่อที่ลงทะเบียนไว้ใน
   localStorage (Euclidean distance)

### เตือนพัก
`lib/breakReminder.ts` จับเวลาต่อเนื่องที่ "มีคนอยู่หน้าจอ" (จาก pose หรือ face-api อย่างใดอย่างหนึ่ง) ถ้าลุกไป
นานพอถือว่าพักแล้วและรีเซ็ตตัวนับ

### กลไกแจ้งเตือนกลาง
`lib/sustainedAlertMachine.ts` เป็น state machine กลางที่ใช้ร่วมกันทุกฟีเจอร์ (ยกเว้นเตือนพักซึ่งเป็น
timer ธรรมดา) — ต้องเจอปัญหาต่อเนื่องนานเกิน threshold (ปรับได้ในหน้าเว็บ) ก่อนจะยิงแจ้งเตือนจริง และต้อง
กลับปกติสักพักก่อนจะเคลียร์ (hysteresis) กันแจ้งเตือนกระพริบ ทุกเหตุการณ์ใช้โครงสร้าง `AlertEvent` เดียวกัน
(ดู `types/alerts.ts`) ไม่ว่าจะเป็นหมวดไหน

แจ้งเตือนแสดงเป็น banner สีแดง + เสียงบี๊บ (ปิด/เปิดได้) + บันทึกลงตาราง "ประวัติการแจ้งเตือน"

## โครงสร้างโค้ดที่สำคัญ

```
src/
  hooks/usePoseLandmarker.ts    โหลด/สร้าง instance ของ MediaPipe Pose Landmarker
  hooks/useFaceApiModels.ts     โหลดโมเดลของ face-api (detector + landmark68 + recognition)
  lib/postureAnalysis.ts        คำนวณมุมท่านั่งจาก pose landmarks
  lib/fatigueAnalysis.ts        คำนวณ EAR/MAR จาก face landmarks (ง่วง/หาว)
  lib/distanceAnalysis.ts       เทียบขนาดใบหน้ากับ baseline (ระยะห่างจอ)
  lib/breakReminder.ts          ตัวจับเวลานั่งต่อเนื่อง (เตือนพัก)
  lib/sustainedAlertMachine.ts  state machine กลาง: ตัดสินว่าเมื่อไหร่ควร "แจ้งเตือน" จริง
  services/alertReporter.ts     จุดเชื่อมต่อไป backend (Phase 2) — Phase 1 แค่ log ไว้ในเครื่อง
  services/faceEnrollment.ts    จัดการรายชื่อที่ลงทะเบียนใบหน้าไว้ (localStorage)
  services/beep.ts              เสียงแจ้งเตือน (Web Audio API ล้วน ไม่มีไฟล์เสียงภายนอก)
  components/CameraStage.tsx    กล้อง + canvas overlay + detection loop ทั้งหมด (pose + face)
  components/SettingsPanel.tsx  ปรับ threshold ความไวของทุกฟีเจอร์
  components/EnrollmentPanel.tsx รายชื่อที่ลงทะเบียนใบหน้าไว้ + ลบ
  components/EventLog.tsx       ตารางประวัติการแจ้งเตือนทุกหมวด
  types/alerts.ts                AlertEvent กลาง ใช้ร่วมกันทุกหมวด
  types/posture.ts, wellbeing.ts, identity.ts  ประเภทข้อมูลเฉพาะแต่ละหมวด
```

## ⚠️ ข้อควรระวังเรื่อง Face Recognition และ PDPA

ฟีเจอร์ระบุตัวตนพนักงานใช้ face descriptor ซึ่งเป็น**ข้อมูลชีวภาพ (biometric data)** ถือเป็นข้อมูลส่วนบุคคล
ที่มีความอ่อนไหวภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ของไทย ก่อนนำไปใช้งานจริงกับพนักงานต้อง:

1. ขอความยินยอม (consent) จากพนักงานอย่างชัดเจนก่อนลงทะเบียนใบหน้า
2. แจ้งวัตถุประสงค์การใช้ข้อมูลให้ชัดเจน และเก็บเท่าที่จำเป็น
3. มีสิทธิ์ให้พนักงานขอลบข้อมูลของตัวเองได้ตลอดเวลา (มีปุ่ม "ลบ" ในหน้า Settings แล้ว)

โค้ดชุดนี้ (Phase 1) เก็บ descriptor ไว้ใน **localStorage ของเบราว์เซอร์เครื่องนั้นๆ เท่านั้น ไม่ส่งออกไปไหน**
แต่ยังไม่ใช่ระบบที่ผ่านกระบวนการขอความยินยอมที่ถูกต้องตามกฎหมาย — **โปรดปรึกษาฝ่ายกฎหมาย/HR ก่อนนำไปใช้งาน
จริงกับพนักงาน** (ปิดฟีเจอร์นี้ได้จาก checkbox "เปิดฟีเจอร์เกี่ยวกับใบหน้า" ในหน้า Settings ถ้ายังไม่พร้อม)

## ข้อควรทราบเรื่องโมเดล AI

โปรเจกต์นี้ตั้งใจใช้เฉพาะโมเดลที่ license เป็น Apache 2.0 (MediaPipe) หรือ MIT (face-api.js) เพื่อให้ใช้ใน
ซอฟต์แวร์เชิงพาณิชย์ปิด (closed-source) ของบริษัทได้โดยไม่มีปัญหาลิขสิทธิ์ — **หลีกเลี่ยง YOLOv8/YOLO11-pose
ของ Ultralytics ในโปรดักต์ปิด** เพราะติด license AGPL-3.0 ต้องซื้อ enterprise license แยกต่างหาก

รุ่นโมเดล Pose ที่ใช้ตอนนี้คือ `pose_landmarker_lite` (เร็ว เบา เหมาะ real-time) ถ้าต้องการความแม่นยำสูงขึ้น
(แลกกับความเร็ว) แก้ `POSE_MODEL_URL` ใน `scripts/setup-assets.mjs` และ path ใน `src/hooks/usePoseLandmarker.ts`
เป็น `pose_landmarker_full` หรือ `pose_landmarker_heavy` ได้

## แผน Phase 2 (ยังไม่ได้ทำในโค้ดชุดนี้)

- Backend (Node/Express หรือ Spring Boot เดิมของทีม) รับเหตุการณ์แจ้งเตือนผ่าน WebSocket/REST
- เก็บ log ลง Oracle/Postgres พร้อม employeeId/cameraId
- Dashboard รวมสำหรับ HR/หัวหน้างาน ดูสถานะพนักงานหลายคนพร้อมกัน
- แจ้งเตือนภายนอกผ่าน LINE Messaging API + LINE Official Account (LINE Notify ปิดให้บริการไปแล้วตั้งแต่
  31 มี.ค. 2025)
- `src/services/alertReporter.ts` เตรียม `createWebSocketAlertReporter()` ไว้เป็นจุดเริ่มต้นสำหรับต่อ backend แล้ว
  (ใช้โครงสร้าง `AlertEvent` เดียวกันทุกหมวด)
