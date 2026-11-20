# Camwell — Frontend

Webapp เชื่อมกล้องเพื่อตรวจจับท่านั่ง ความเหนื่อยล้า และการหกล้มของพนักงานออฟฟิศ แล้วแจ้งเตือนเมื่อพบปัญหาต่อเนื่อง

- **AI รันในเครื่อง** — โหมด YOLO ส่งเฟรมผ่าน localhost ไปยัง Python vision service ที่ผูกกับ `127.0.0.1`; ภาพไม่ออกจากเครื่อง ส่วน face/fatigue และ fallback MediaPipe ยังรันใน browser
- **camwell-backend (`backend/`)** — ใช้เฉพาะฟีเจอร์ "จำหน้า/ระบุตัวตนพนักงาน" (เก็บ face descriptor ลง SQLite และจับคู่ใบหน้าแทนเบราว์เซอร์)
  ไม่รัน backend แอปก็ยังตรวจจับท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ/หกล้มได้ปกติ — ดู `backend/README.md`
- ยังไม่ได้ทำ: ส่ง log เหตุการณ์แจ้งเตือนไป backend, dashboard HR, แจ้งเตือนผ่าน LINE — ดู "แผนถัดไป" ด้านล่าง

## ฟีเจอร์ที่มีตอนนี้

1. **ท่านั่ง** — ก้มคอ/ยื่นคอ, หลังค่อม/โน้มตัว, นั่งเอียงข้าง (YOLO person/pose detection + CamWell posture classifier; MediaPipe ยังเลือกใช้ได้)
   พร้อมปุ่ม **Calibrate ท่านั่ง** (นั่งท่าดี 3 วินาที → เก็บเป็น baseline แยกต่อกล้อง)
2. **หกล้ม / ตกจากเก้าอี้** — ลำตัวร่วงเร็ว + เอียงใกล้แนวนอน หรือร่วงเร็วแล้วหายจากเฟรม (แจ้งทันที ไม่ต้องรอสะสมเวลา)
3. **ความเหนื่อยล้า** — ง่วง/หลับตานาน (Eye Aspect Ratio), หาวถี่ผิดปกติ (Mouth Aspect Ratio) (@vladmandic/face-api)
4. **ระยะห่างจากจอ** — เตือนเมื่อนั่งใกล้จอเกินกว่าค่าที่ calibrate ไว้
5. **เตือนพัก** — นั่งต่อเนื่องนานเกินไปโดยไม่ลุก (ตัวจับเวลาแยกต่อกล้อง ไม่เกี่ยวกับท่านั่งถูก/ผิด)
6. **Face recognition (ระบุตัวตน)** — ลงทะเบียนใบหน้าผ่าน camwell-backend ⚠️ ดูคำเตือนเรื่อง PDPA ด้านล่าง
7. **หลายกล้อง / หลายคน** — ต่อกล้องพร้อมกันได้สูงสุด 2 ตัว (กล้องในเครื่อง/USB หรือกล้อง IP แบบ MJPEG)
   และเลือกโหมด Workstation (1 คน) หรือ Multi-person (สูงสุด 4 คนต่อกล้อง)
8. **Dev Console** (`/?console`) — หน้าผู้ดูแลระบบสำหรับดูสถานะ/ปรับเกณฑ์/เก็บ dataset — ดูหัวข้อด้านล่าง

ฟีเจอร์ที่ใช้ใบหน้า (3, 4, 6) ปิดอยู่เป็นค่าเริ่มต้น เปิดได้จาก checkbox "ฟีเจอร์ใบหน้า"

## เทคโนโลยีที่ใช้

- **React 19 + TypeScript + Vite**
- **react-webcam** — เข้าถึงกล้องผ่าน `getUserMedia`
- **@mediapipe/tasks-vision (Pose Landmarker / BlazePose)** — ตรวจท่านั่ง/หกล้ม รันในเบราว์เซอร์ผ่าน WebAssembly
  (ไม่เรียก API ภายนอกตอนใช้งานจริง) — License Apache 2.0 ใช้เชิงพาณิชย์ได้ฟรี
- **Ultralytics YOLOv8m + YOLOv8m-pose** — person/chair/table detection, ByteTrack และ COCO keypoints ผ่าน Python service บน localhost
- **@vladmandic/face-api** — ตรวจความเหนื่อยล้า/ระยะห่างจอ/ดึง face descriptor รันในเบราว์เซอร์ผ่าน TensorFlow.js
  — License MIT ใช้เชิงพาณิชย์ได้ฟรีเช่นกัน
- **vitest** (test) · **oxlint** (lint)

## เริ่มต้นใช้งาน

เตรียม YOLO service ครั้งแรกจาก root ของโปรเจกต์:

```bat
py -3.12 -m venv yolo-backend\.venv
yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements.txt
```

เปิด service และ frontend ในคนละ terminal:

```bash
npm run dev:vision
```

```bash
cd frontend
npm install       # ติดตั้ง dependency + รัน postinstall (scripts/setup-assets.mjs) ที่จะ:
                   #   1) คัดลอก WASM runtime ของ MediaPipe มาไว้ที่ public/wasm
                   #   2) ดาวน์โหลดโมเดล pose_landmarker_{lite,full,heavy}.task (~44MB รวม) มาไว้ที่ public/models
                   #      (จาก storage.googleapis.com)
                   #   3) ดาวน์โหลดโมเดลของ face-api มาไว้ที่ public/models/face-api
                   #      (จาก raw.githubusercontent.com — เครือข่ายองค์กรส่วนใหญ่มักไม่บล็อก)
npm run dev        # เปิด dev server (http://localhost:5173)
```

ครั้งแรกที่ YOLO ทำ inference จะดาวน์โหลด `yolov8m.pt` และ `yolov8m-pose.pt` หากยังไม่มีไฟล์ใน cache ของ Ultralytics
ถ้า YOLO service ไม่ทำงาน CamWell จะใช้ MediaPipe Lite ต่อ และแสดงสถานะ service ใน Dev Console

เพิ่มกล้อง RTSP ได้จากการตั้งค่าแหล่งภาพ เลือก **กล้องเครือข่าย (RTSP / go2rtc)** แล้วใส่ URL กล้องโดยตรง เช่น
`rtsp://user:password@192.168.1.50:554/cam/realmonitor?channel=1&subtype=1` หรือ URL หน้า go2rtc เช่น
`http://go2rtc:1984/stream.html?src=cam` — vision service จะลอง RTSP port 8554 ก่อนแล้ว fallback เป็น MJPEG
URL พร้อม credential ถูกเก็บใน localStorage ของ browser เครื่องนี้ อย่าใช้ URL ที่ฝังรหัสผ่านซึ่งแชร์กับผู้อื่น

ไฟล์ที่ข้ามไปแล้วจะไม่ดาวน์โหลดซ้ำ ถ้าเครือข่ายบล็อกการดาวน์โหลดโมเดลใด ดูวิธีดาวน์โหลดเองที่ `frontend/public/models/README.md`
และ `frontend/public/models/face-api/README.md` หรือรัน `npm run setup:assets` ใน `frontend/` ใหม่ภายหลัง

ถ้าต้องการฟีเจอร์ระบุตัวตน ให้รัน backend ด้วย (`cd backend && npm install && npm run dev` — รายละเอียดใน `backend/README.md`)
ที่อยู่ backend ตั้งได้ผ่าน `VITE_API_BASE_URL` ใน `frontend/.env` (ค่าเริ่มต้น `http://localhost:4000`)

คำสั่งอื่นใน `frontend/`: `npm test` (vitest) · `npm run lint` (oxlint) · `npm run build` (tsc + vite build)

### หน้าที่เปิดได้

| URL | หน้า |
|---|---|
| `/` | หน้าหลักเดิม — กล้อง + แผงตั้งค่าความไว + ประวัติแจ้งเตือน (ใช้โมเดล `lite` และโครงร่างแบบ `basic` เสมอ) |
| `/?console` | Dev Console — ใช้ state และ logic ชุดเดียวกับหน้าหลัก แต่จัดหน้าใหม่ + มีเครื่องมือสำหรับนักพัฒนา |

## Dev Console (`/?console`)

ออกแบบจาก `docs/camWell/project/Camwell Dev Console.dc.html` (แผนงานใน `docs/camWell/IMPLEMENTATION_PLAN.md`)
ตอนนี้เปิดได้ทุก build (ยังอยู่ช่วงพัฒนา — จะกำหนดสิทธิ์ใหม่ภายหลัง)

- **Sidebar** — 4 เมนู + สถานะโมเดล/บริการ (Pose Landmarker, face-api, camwell-backend, error ของกล้องแต่ละตัว)
- **Header** — โหมด Workstation/Multi · **Pose: lite / full / heavy** · **Skeleton: basic / full** · เสียงแจ้งเตือน ·
  ฟีเจอร์ใบหน้า · Dataset Recorder · สถานะ backend (`/health` ทุก 10 วินาที)
- **ภาพรวมระบบ** — แถบสถิติ (Pose inference ms แบบ EMA, จำนวนคนที่ติดตาม, แจ้งเตือนที่ยัง active), การ์ดกล้อง
  (ชิป GPU/CPU · ms · จำนวนคน, สถานะ baseline, เปลี่ยนแหล่งภาพ), แจ้งเตือนล่าสุด
  — จอกว้าง ≥1700px จะแสดงการ์ดเกณฑ์การตรวจจับทางขวาด้วย
- **เกณฑ์การตรวจจับ** — slider ทุกค่า (ท่านั่ง/หกล้ม/ความเหนื่อยล้า/ระยะห่างจอ/เตือนพัก) บอกว่าค่าไหนแก้จากค่าเริ่มต้น + ปุ่มคืนค่าทั้งหมด
- **เหตุการณ์** — กรองตามหมวด/เฉพาะที่ยัง active + Export JSON
- **ข้อมูลใบหน้า** — รายชื่อพนักงานที่ลงทะเบียนใน backend + ลบข้อมูล

กล้องไม่ถูก unmount ตอนสลับแท็บ (แค่ซ่อน) จึงไม่ต้องโหลดกล้อง/โมเดลใหม่

### เลือก Pose model

MediaPipe ให้ landmark 33 จุด ส่วน YOLO ให้ 17 จุด COCO ที่ map เข้าช่อง landmark เดิมและทำจุดที่ไม่มีเป็น invisible
— ดูค่า ms ในแถบสถิติเพื่อเทียบบนเครื่องจริง (ระบบจำกัดไว้ 12 fps = งบ ~83 ms ต่อรอบต่อกล้อง)

| รุ่น | โมเดล | ขนาดโดยประมาณ |
|---|---|---|
| yolo (ค่าเริ่มต้น) | `yolov8m.pt` + `yolov8m-pose.pt` | ดาวน์โหลดครั้งแรกจาก Ultralytics |
| lite | `pose_landmarker_lite.task` | ~5.5 MB |
| full | `pose_landmarker_full.task` | ~9 MB |
| heavy | `pose_landmarker_heavy.task` | ~29 MB |

YOLO ส่ง keypoints 17 จุดแบบ COCO; CamWell map จุดหู ไหล่ สะโพก และจุดที่เกี่ยวข้องเข้า posture feature เดิม จุดที่โมเดลไม่มีจะถูกทำเครื่องหมายว่าไม่เห็น ค่า baseline, smoothing และ alert logic ยังใช้ของ CamWell โหมด YOLO โหลดโมเดลแยกต่อกล้อง (สูงสุด 2 กล้อง) และอาจใช้หน่วยความจำ GPU มากกว่า MediaPipe

- เปลี่ยนรุ่นแล้วโมเดลโหลดใหม่ทุกกล้อง — **ควร Calibrate ท่านั่งใหม่** เพราะมุมที่วัดได้ต่างกันเล็กน้อย
- เปลี่ยนรุ่นไม่ได้ระหว่างกำลังบันทึก dataset

### โครงร่าง (Skeleton: basic / full)

- **basic** (ค่าเริ่มต้น) — โครงร่างเดิม 10 เส้นช่วงบน (ไหล่ แขน ลำตัว หู-ไหล่) วาดทุกจุดที่โมเดลส่งมา
- **full** — ครบ 35 เส้นตาม BlazePose (หน้า แขน มือ ลำตัว ขา) เฉพาะจุดที่ visibility ≥ `minVisibility` (0.5)
  + **เส้นสีเหลือง** = เส้นคอ (กึ่งกลางไหล่ → กึ่งกลางหู/จมูก) และกระดูกสันหลัง (กึ่งกลางสะโพก → กึ่งกลางไหล่)
  ซึ่งเป็นเส้นเดียวกับที่ใช้วัด `neckAngleDeg` / `torsoAngleDeg` จริง
  — ตอนเห็นแค่ช่วงบน แขน/สะโพกที่มองไม่ชัดจะไม่ถูกวาด (ตั้งใจ)

การเลือกโครงร่างเป็นแค่การแสดงผล ไม่มีผลกับการตรวจจับ

### Dataset Recorder

เก็บตัวเลข landmark/feature (ไม่เก็บภาพ) ไว้ปรับจูนเกณฑ์ท่านั่ง — เปิดจาก checkbox "Dataset Recorder" บน header
(แผงจะอยู่ในหน้าภาพรวม) หน้าหลัก `/` ก็มีแผงแบบง่ายให้ใช้เช่นกัน (แสดงเฉพาะตอนรัน dev)

- เลือก **กล้อง** + **label** (`GOOD`, `FORWARD_HEAD`, `SLOUCH`, `LEAN_LEFT`, `LEAN_RIGHT`) → เริ่ม/หยุดบันทึก → Export JSON
- เก็บเฉพาะเฟรมที่มี **คนเดียวในเฟรม** · ประมาณ 12 sample/วินาที · ค่าดิบก่อน smoothing
- ระหว่างบันทึกจะเห็น `● REC` + ค่า 4 feature ซ้อนบนภาพกล้องที่กำลังบันทึก
- **ไม่ปน dataset ข้ามรุ่นโมเดล** — dataset ล็อกตามรุ่นของ sample แรก ถ้ารุ่นไม่ตรงจะเริ่มบันทึกไม่ได้จนกว่าจะ Export แล้วล้างข้อมูล
- ไฟล์ export มี `meta.schemaVersion`, `exportedAt`, `poseModel`, `thresholdsAtExport` + `samples[]`
  (แต่ละ sample มี `cameraId`, `label`, มุมต่างๆ, `quality`, `landmarks` 33 จุดพร้อม `visibility`, `minVisibility`; YOLO map เฉพาะจุด COCO ที่มีและ `worldLandmarks` เป็น `[]`)

ข้อควรระวัง:
- เก็บในหน่วยความจำของแท็บเท่านั้น — **รีเฟรช/ปิดแท็บแล้วหาย ต้อง Export ก่อน** และกินหน่วยความจำเพิ่มขึ้นระหว่างบันทึก (อัดเป็นช่วงแล้ว export ทยอย)
- CameraStage เก็บ sample เฉพาะตอนรัน dev (`import.meta.env.DEV`) — production build จะไม่เก็บ
- ไม่มีผลกับการตรวจจับ/แจ้งเตือน (การแจ้งเตือนยังทำงานระหว่างอัด — ปิดเสียงได้ถ้ารำคาญ)

แนวทางเก็บข้อมูลให้ใช้งานได้: อัด `GOOD` ก่อนทุกรอบ (ใช้เป็น baseline ตอนวิเคราะห์) · ท่าละ 30–60 วินาทีต่อเนื่อง ·
ครบทุก label · หลายคน/หลายวัน ดีกว่าอัดคนเดียวนานๆ · ห้ามย้ายกล้อง/เปลี่ยนรุ่นโมเดลกลางคัน

## วิธีทำงานของแต่ละฟีเจอร์

### ท่านั่ง + หกล้ม + เตือนพัก (PostureEngine)
1. แหล่ง RTSP ให้ `yolo-backend` เปิดสตรีมด้วย OpenCV/FFmpeg ผ่าน TCP และส่งภาพ preview แบบ MJPEG ผ่าน localhost; go2rtc page จะลอง RTSP port 8554 ก่อน fallback เป็น MJPEG; แหล่งอื่นส่ง JPEG เฟรมจาก browser เข้า service
2. YOLOv8m ตรวจคน/เก้าอี้/โต๊ะ, ByteTrack (`bytetrack_room.yaml`) จับกรอบข้ามเฟรม, `yolo-backend/people.py` ตัดสินว่าแต่ละกรอบเป็นใคร (คนเดียวได้กรอบเดียว, คนนั่งนิ่งได้ ID เดิม, กรอบที่ตรงกับเก้าอี้ไม่นับเป็นคน) แล้ว YOLOv8m-pose หา COCO 17 keypoints ให้คนที่เห็นในเฟรมนั้น คนที่ถูกบังชั่วคราวส่งเป็น `held: true` โดยไม่มี keypoints
3. `lib/yoloPose.ts` map keypoints เข้ากับ posture engine; โหมด MediaPipe เดิมยังอยู่เป็น fallback และเป็นตัวเลือกใน Dev Console
4. `lib/poseThrottle.ts` จำกัดการรันไว้ 12 fps ต่อกล้องและส่งเฉพาะเฟรมใหม่ของวิดีโอ
5. `lib/postureEngine.ts` (หนึ่ง instance ต่อกล้อง) รวมขั้นตอนต่อเฟรม:
   - `yolo-backend/people.py` ให้ ID ในโหมด YOLO; `lib/tracker.ts` จับคู่คนข้ามเฟรมในโหมด MediaPipe
   - `lib/postureAnalysis.ts` คำนวณมุมคอ/มุมลำตัว/มุมเอียงไหล่/`headHeightRatio` (ข้ามจุดที่ visibility < `minVisibility`)
     และแยก `full_body` / `upper_body`
   - `lib/smoothing.ts` ทำค่าให้นิ่ง (EMA) ก่อนจัดท่า → `classifyPosture` → forward_head / slouching / leaning / good
     (ถ้า Calibrate แล้ว ตัดสินจากส่วนต่างเทียบ baseline ของกล้องนั้น + สัดส่วนหัวที่ต่ำลง)
   - `lib/fallDetection.ts` ตรวจการร่วงตัวเร็ว / หายจากเฟรม
   - `lib/breakReminder.ts` จับเวลานั่งต่อเนื่อง
6. Baseline ท่านั่งเก็บใน localStorage แยกต่อกล้อง (`camwell:posture-baseline:v1:<cameraId>`, ดู `services/postureBaselineStore.ts`)

### ความเหนื่อยล้า + ระยะห่างจอ + ระบุตัวตน
1. `useFaceApiModels` โหลดโมเดล TinyFaceDetector + FaceLandmark68 + FaceRecognition จากไฟล์ local
2. ตรวจจับใบหน้าแบบ throttled (ทุก ~400ms) แล้วจับคู่ใบหน้ากับคนจาก pose ที่ตำแหน่งใกล้ที่สุด
3. `lib/fatigueAnalysis.ts` คำนวณ EAR (ตาหลับ) และ MAR (อ้าปาก/หาว) จาก 68 จุด landmark ใบหน้า
4. `lib/distanceAnalysis.ts` เทียบขนาดกรอบใบหน้ากับ baseline ที่ calibrate ไว้
5. `services/faceEnrollment.ts` ส่ง descriptor 128 มิติไปให้ camwell-backend จับคู่ (เช็คซ้ำทุก ~3 วินาทีต่อคน)
   — browser ไม่ได้เก็บ descriptor ของใครไว้เลย

### กลไกแจ้งเตือนกลาง
`lib/sustainedAlertMachine.ts` เป็น state machine กลางของท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ — ต้องเจอปัญหาต่อเนื่อง
นานเกิน threshold ก่อนจะแจ้งเตือนจริง และต้องกลับปกติสักพักก่อนเคลียร์ (hysteresis) กันกระพริบ
(หกล้มเป็น edge-triggered แจ้งทันที, เตือนพักเป็นตัวจับเวลา) ทุกเหตุการณ์ใช้โครงสร้าง `AlertEvent` เดียวกัน (`types/alerts.ts`)

แจ้งเตือนแสดงเป็นกรอบ/banner สีแดงบนกล้อง + banner หกล้ม/เตือนพัก + เสียง (ปิดได้) + บันทึกลงตารางเหตุการณ์
(เก็บในหน่วยความจำของเบราว์เซอร์ — `services/alertReporter.ts` ตอนนี้แค่ log ใน console)

## โครงสร้างโค้ดที่สำคัญ

```
frontend/src/
  App.tsx                         state กลาง + หน้าหลัก (/) — ถ้ามี ?console จะแสดง DevConsole แทน
  hooks/usePoseLandmarker.ts      โหลด MediaPipe Pose Landmarker (เลือกรุ่น lite/full/heavy, รายงาน GPU/CPU)
  hooks/useFaceApiModels.ts       โหลดโมเดลของ face-api
  hooks/useCameraDevices.ts       รายชื่อกล้องในเครื่อง
  lib/postureEngine.ts            pipeline ต่อเฟรมของกล้อง 1 ตัว (tracker + posture + fall + break)
  lib/postureAnalysis.ts          คำนวณมุมท่านั่ง + จัดท่า
  lib/postureCalibration.ts       คำนวณ baseline จากช่วง Calibrate
  lib/smoothing.ts                EMA ของ feature
  lib/tracker.ts                  จับคู่คนข้ามเฟรม
  lib/fallDetection.ts            ตรวจการหกล้ม
  lib/breakReminder.ts            ตัวจับเวลานั่งต่อเนื่อง
  lib/fatigueAnalysis.ts          EAR/MAR (ง่วง/หาว)
  lib/distanceAnalysis.ts         ระยะห่างจอ
  lib/sustainedAlertMachine.ts    state machine แจ้งเตือนกลาง
  lib/poseThrottle.ts             จำกัด 12 fps
  lib/skeletonOverlay.ts          เส้นโครงร่าง basic/full (แสดงผลอย่างเดียว)
  lib/datasetJson.ts              รูปแบบไฟล์ dataset ที่ export
  lib/multiPerson.ts              โหมด workstation/multi
  services/datasetRecorder.ts     เก็บ sample dataset (เลือกกล้อง, ล็อกรุ่นโมเดล)
  services/postureBaselineStore.ts baseline ท่านั่งต่อกล้อง (localStorage)
  services/faceEnrollment.ts      ลงทะเบียน/ลบ/จับคู่ใบหน้าผ่าน backend
  services/apiConfig.ts           API_BASE_URL + fetch helper
  services/alertReporter.ts       จุดเชื่อมต่อส่งเหตุการณ์ออกนอกแอป (ตอนนี้ log ในเครื่อง)
  services/beep.ts                เสียงแจ้งเตือน (Web Audio API)
  components/CameraStage.tsx      กล้อง + canvas overlay + detection loop (pose + face) ของกล้อง 1 ตัว
  components/CameraSourceSelector.tsx  เลือกกล้องในเครื่อง / กล้อง IP (MJPEG)
  components/SettingsPanel.tsx    ปรับ threshold (หน้าหลัก)
  components/EnrollmentPanel.tsx  รายชื่อที่ลงทะเบียนใบหน้า + ลบ (หน้าหลัก)
  components/EventLog.tsx         ตารางประวัติการแจ้งเตือน (หน้าหลัก)
  components/DatasetRecorderPanel.tsx  แผงบันทึก dataset แบบง่าย (หน้าหลัก)
  console/                        Dev Console (DevConsole, MonitorTab, RecorderPanel, ThresholdsTab,
                                  EventsTab, PeopleTab, useBackendHealth, format, console.css)
  types/                          alerts, posture, fall, wellbeing, identity, person, cameraSource
backend/                          camwell-backend (Express + SQLite) สำหรับข้อมูลใบหน้า
docs/camWell/                     design handoff ของ Dev Console + IMPLEMENTATION_PLAN.md
docs/performance/                 บันทึกงานปรับประสิทธิภาพ/ตรวจสอบแต่ละ ticket
```

## ข้อจำกัดที่ควรรู้

- **กล้อง IP ต่าง origin (CORS)** — ภาพแสดงได้แต่ AI อ่านพิกเซลไม่ได้ (canvas tainted) ต้องมีตัวกลางแปลงสตรีม
  กล้องที่ใช้ RTSP เปิดในเบราว์เซอร์ตรงๆ ไม่ได้
- **กล้องหน้าตรง** มองการยื่นคอ/หลังค่อมได้จำกัด (เป็นการเคลื่อนเข้าหากล้อง) — เกณฑ์ปัจจุบันยังต้องปรับจูนจาก dataset จริง
- `minVisibility` (0.5) ยังไม่มีให้ปรับในหน้าเว็บ (มีผลกับการคำนวณมุม, dataset และโครงร่างแบบ full)

## ⚠️ ข้อควรระวังเรื่อง Face Recognition และ PDPA

ฟีเจอร์ระบุตัวตนพนักงานใช้ face descriptor ซึ่งเป็น**ข้อมูลชีวภาพ (biometric data)** ถือเป็นข้อมูลส่วนบุคคล
ที่มีความอ่อนไหวภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ของไทย ก่อนนำไปใช้งานจริงกับพนักงานต้อง:

1. ขอความยินยอม (consent) จากพนักงานอย่างชัดเจนก่อนลงทะเบียนใบหน้า — UI บังคับให้ติ๊กยืนยันก่อนกดลงทะเบียน
   และ backend ปฏิเสธคำขอที่ไม่มี `consentGiven: true`
2. แจ้งวัตถุประสงค์การใช้ข้อมูลให้ชัดเจน และเก็บเท่าที่จำเป็น
3. มีสิทธิ์ให้พนักงานขอลบข้อมูลของตัวเองได้ตลอดเวลา (ปุ่มลบในหน้าหลัก และแท็บ "ข้อมูลใบหน้า" ใน Dev Console)

descriptor เก็บไว้ที่ **camwell-backend (SQLite) เท่านั้น** ไม่ถูกส่งกลับมาที่เบราว์เซอร์หลังลงทะเบียน
ยังไม่ใช่ระบบที่ผ่านกระบวนการขอความยินยอมที่ถูกต้องตามกฎหมายครบทุกขั้นตอน — **โปรดปรึกษาฝ่ายกฎหมาย/HR ก่อนนำไปใช้งานจริง**
(ปิดฟีเจอร์นี้ได้จาก checkbox "ฟีเจอร์ใบหน้า" ถ้ายังไม่พร้อม)

## ข้อควรทราบเรื่องโมเดล AI

CamWell ใช้ YOLO เป็นค่าเริ่มต้นสำหรับตรวจคน/วัตถุ/โครงร่าง และยังเลือก MediaPipe Lite/Full/Heavy ได้จาก Dev Console
หรือใช้ MediaPipe Lite อัตโนมัติเมื่อ YOLO service ไม่พร้อม รายการ license ของ dependency และโมเดลที่นำไปแจกจ่าย
ต้องสอดคล้องกับรูปแบบการใช้งานและการเผยแพร่ของระบบ

## แผนถัดไป (ยังไม่ได้ทำ)

- ส่งเหตุการณ์แจ้งเตือนไป backend (`createWebSocketAlertReporter()` ใน `frontend/src/services/alertReporter.ts` เตรียมไว้แล้ว
  ใช้โครงสร้าง `AlertEvent` เดียวกันทุกหมวด) และเก็บ log พร้อม employeeId/cameraId
- Dashboard รวมสำหรับ HR/หัวหน้างาน
- แจ้งเตือนภายนอกผ่าน LINE Messaging API + LINE Official Account (LINE Notify ปิดให้บริการไปแล้วตั้งแต่ 31 มี.ค. 2025)
- ปรับจูนเกณฑ์ท่านั่งจาก dataset จริง (หลายคน ครบทุก label)
- กำหนดสิทธิ์การเข้า Dev Console
