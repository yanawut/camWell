# ระบบ MediaPipe

ระบบ MediaPipe ประมวลผลในเบราว์เซอร์ของเครื่องที่เปิดหน้าไว้ และเก็บข้อมูลที่ camwell-backend
ระบบตรวจจับเฉพาะตอนเปิดหน้าค้างไว้ ปิดแท็บแล้วการตรวจจับหยุด

วิธีติดตั้งและเปิด frontend กับ camwell-backend อยู่ใน [README](../README.md)
ขั้นตอนที่ระบบทำต่อเฟรมอยู่ใน [การตรวจจับและแจ้งเตือนของระบบ MediaPipe](mediapipe-how-it-works.md)

## หน้า

| URL | หน้า |
|---|---|
| `/?dashboard` | ภาพรวมห้อง วาดผังห้องจากกล้องแต่ละตัวพร้อมตารางคนในห้อง กล้องทำงานเบื้องหลัง ติ๊กช่องเพื่อดูภาพ |
| `/?camera` | หน้ากล้อง มีภาพกล้อง แผงตั้งค่าเกณฑ์ และประวัติแจ้งเตือน ใช้โมเดล `lite` และโครงร่างแบบ `basic` เสมอ |
| `/?gait` | ท่ายืนหน้าตรง ท่ายืนด้านข้าง ทดสอบ Romberg และวิเคราะห์ท่าเดิน |
| `/?people` | รายชื่อคนที่ลงทะเบียนใบหน้าใน camwell-backend หน้านี้ไม่โหลดกล้องหรือโมเดล |
| `/?alerts` | ประวัติแจ้งเตือนจาก camwell-backend กรองตามคนและหมวดได้ ส่งออก CSV ได้ กรองคนจาก URL ได้ด้วย `?alerts&employee=<id>` |
| `/?report` | รายงานประจำวันจาก camwell-backend แสดงความเสี่ยง Office Syndrome รายคน |
| `/?console` | Dev Console ใช้ state และ logic ชุดเดียวกับหน้ากล้อง แต่จัดหน้าใหม่และเพิ่มเครื่องมือสำหรับนักพัฒนา |

`frontend/src/main.tsx` เลือกหน้า `/?people` และ `/?alerts` เอง หน้าที่เหลือในตารางนี้ `frontend/src/App.tsx` เป็นตัวเลือก

## ฟีเจอร์

- **ท่านั่ง** ตรวจการก้มคอหรือยื่นคอ หลังค่อมหรือโน้มตัว และการนั่งเอียงข้าง ด้วย MediaPipe Pose Landmarker
  ปุ่ม "Calibrate ท่านั่งดี" ให้นั่งท่าดี 3 วินาที แล้วเก็บเป็น baseline ของกล้องตัวนั้น
- **หกล้มหรือตกจากเก้าอี้** ตรวจลำตัวที่ร่วงเร็วแล้วเอียงใกล้แนวนอน หรือร่วงเร็วแล้วหายจากเฟรม แจ้งทันทีโดยไม่รอสะสมเวลา
- **ความเหนื่อยล้า** ตรวจการหลับตานานด้วย Eye Aspect Ratio และการหาวถี่ผิดปกติด้วย Mouth Aspect Ratio ผ่าน @vladmandic/face-api
- **ระยะห่างจากจอ** เตือนเมื่อนั่งใกล้จอกว่าค่าที่ calibrate ไว้
- **เตือนพัก** เตือนเมื่อนั่งต่อเนื่องนานเกินไปโดยไม่ลุก ตัวจับเวลาแยกต่อกล้อง และไม่ขึ้นกับว่าท่านั่งถูกหรือผิด
- **ระบุตัวตนจากใบหน้า** ลงทะเบียนและจับคู่ใบหน้าผ่าน camwell-backend
  ช่อง "ลงทะเบียนใบหน้าที่ไม่รู้จักอัตโนมัติ" เปิดอยู่เป็นค่าเริ่มต้น
  เมื่อเจอใบหน้าที่ไม่ตรงกับใคร camwell-backend ลงทะเบียนใบหน้านั้นเป็น "คนที่ N" ทันทีโดยยังไม่มีความยินยอม แล้วค่อยเปลี่ยนชื่อภายหลัง
  อ่าน [ข้อมูลใบหน้า PDPA และ license ของโมเดล](privacy-and-licenses.md) ก่อนใช้
- **หลายกล้องและหลายคน** ต่อกล้องพร้อมกันได้สูงสุด 2 ตัว ได้แก่ กล้องในเครื่อง กล้อง USB หรือกล้อง IP แบบ MJPEG
  โหมดมีสามแบบ คือ Workstation 1 คน, Multi-person สูงสุด 4 คนต่อกล้อง และไม่จำกัด
  โหมดไม่จำกัดรับได้สูงสุด 20 คนตามเพดานของ MediaPipe และยิ่งคนเยอะยิ่งช้า
  หน้าภาพรวมเริ่มที่ Multi-person ส่วนหน้ากล้องและ Dev Console เริ่มที่ Workstation
- **ท่ายืนและท่าเดิน** หน้า `/?gait` มีท่ายืนหน้าตรง ท่ายืนด้านข้าง ทดสอบ Romberg และวิเคราะห์ท่าเดิน
  Romberg ให้ลืมตาและหลับตาอย่างละ 10 วินาที การวิเคราะห์ท่าเดินอัด 8 วินาที
- **ส่งเหตุการณ์ไป camwell-backend** frontend ส่งทุกการแจ้งเตือนไปที่ `POST /api/alerts` ตอนเริ่มและตอนจบ
  และบันทึกการเข้า-ออกหน้ากล้องที่ `/api/presence` หน้าประวัติแจ้งเตือนและหน้ารายงานประจำวันอ่านข้อมูลจากสองที่นี้
- **Dev Console** หน้า `/?console` สำหรับดูสถานะ ปรับเกณฑ์ และเก็บ dataset

ฟีเจอร์ที่ใช้ใบหน้า ได้แก่ ความเหนื่อยล้า ระยะห่างจากจอ และการระบุตัวตน เปิดอยู่เป็นค่าเริ่มต้น
ค่าเริ่มต้นนี้คือ `DEFAULT_FACE_FEATURES_ENABLED` ใน `frontend/src/lib/featureVisibility.ts`
ปิดได้สองที่ คือช่อง "ฟีเจอร์ใบหน้า" บน header ของ Dev Console และช่อง "เปิดใช้ความเหนื่อยล้า, ระยะห่างจากจอ และการระบุตัวตน" ในแผงตั้งค่าของหน้ากล้อง

## Dev Console (`/?console`)

ทุก build เปิดหน้านี้ได้ เพราะยังอยู่ช่วงพัฒนาและยังไม่ได้กำหนดสิทธิ์
เข้าจากปุ่ม "Console" บนแถบเมนูของระบบ MediaPipe ปุ่ม "← Back to Dashboard" พากลับไป `?dashboard`

- **Sidebar** มีปุ่มสลับ Engine ระหว่าง MediaPipe กับ YOLO เมนู 4 หน้า และสถานะของ Pose Landmarker, face-api, camwell-backend และ error ของกล้องแต่ละตัว
- **Header** มีตัวเลือกโหมด (Workstation, Multi, ไม่จำกัด) รุ่นโมเดล Pose (lite, full, heavy) โครงร่าง (basic, full) ช่อง "เสียงแจ้งเตือน" ช่อง "ฟีเจอร์ใบหน้า" ช่อง "Dataset Recorder" และสถานะ backend ที่ตรวจ `/health` ทุก 10 วินาที

เมนูมี 4 หน้า

| เมนู | เนื้อหา |
|---|---|
| Monitor | แถบสถิติ การ์ดกล้อง และแจ้งเตือนล่าสุด จอที่กว้างตั้งแต่ 1700px ขึ้นไปแสดงการ์ดเกณฑ์การตรวจจับทางขวาด้วย |
| Thresholds | slider ของทุกเกณฑ์ ได้แก่ ท่านั่ง หกล้ม ความเหนื่อยล้า ระยะห่างจากจอ และเตือนพัก บอกว่าค่าไหนต่างจากค่าเริ่มต้น และมีปุ่มคืนค่าทั้งหมด |
| Events | กรองตามหมวดหรือเฉพาะที่ยัง active และ Export JSON ได้ |
| People | รายชื่อพนักงานที่ลงทะเบียนใน camwell-backend และลบข้อมูลได้ |

แถบสถิติของ Monitor แสดงเวลา Pose inference เป็น ms แบบ EMA จำนวนคนที่ติดตาม และจำนวนแจ้งเตือนที่ยัง active
การ์ดกล้องแสดงชิป GPU หรือ CPU เวลาเป็น ms จำนวนคน สถานะ baseline และปุ่มเปลี่ยนแหล่งภาพ

การสลับเมนูแค่ซ่อนกล้องไว้โดยไม่ unmount จึงไม่ต้องโหลดกล้องและโมเดลใหม่

### รุ่นโมเดล Pose

ทุกรุ่นให้ landmark 33 จุดในรูปแบบเดียวกัน ต่างกันที่ความแม่นยำและความเร็ว
ระบบจำกัดไว้ที่ 12 fps ต่อกล้อง แต่ละรอบจึงมีเวลาประมาณ 83 ms ค่า ms ในแถบสถิติบอกว่าแต่ละรุ่นใช้เวลาเท่าไรบนเครื่องจริง

| รุ่น | ไฟล์ | ขนาดประมาณ |
|---|---|---|
| lite (ค่าเริ่มต้น) | `pose_landmarker_lite.task` | 5.5 MB |
| full | `pose_landmarker_full.task` | 9 MB |
| heavy | `pose_landmarker_heavy.task` | 29 MB |

- รายชื่อรุ่นอยู่ที่ `POSE_MODELS` ใน `frontend/src/hooks/usePoseLandmarker.ts` และต้องตรงกับ `POSE_MODELS` ใน `frontend/scripts/setup-assets.mjs`
- เลือกรุ่นได้เฉพาะใน Dev Console หน้ากล้องใช้ `lite` เสมอ
- เมื่อเปลี่ยนรุ่น ทุกกล้องโหลดโมเดลใหม่ มุมที่แต่ละรุ่นวัดได้ต่างกันเล็กน้อย baseline ที่ Calibrate ด้วยรุ่นเดิมจึงคลาดได้
- ระหว่างบันทึก dataset เปลี่ยนรุ่นไม่ได้

### โครงร่าง

โครงร่างมีผลกับการแสดงผลเท่านั้น และไม่มีผลกับการตรวจจับ

| แบบ | วาดอะไร |
|---|---|
| basic (ค่าเริ่มต้น) | โครงร่างช่วงบน 10 เส้น ได้แก่ ไหล่ แขน ลำตัว และหู-ไหล่ จากทุกจุดที่โมเดลส่งมา |
| full | ครบ 35 เส้นตาม BlazePose ได้แก่ หน้า แขน มือ ลำตัว และขา เฉพาะจุดที่ visibility ไม่ต่ำกว่า `minVisibility` (0.5) |

แบบ full วาดเส้นสีเหลืองเพิ่มสองเส้น เส้นแรกคือเส้นคอ จากกึ่งกลางไหล่ถึงกึ่งกลางหูหรือจมูก เส้นที่สองคือกระดูกสันหลัง จากกึ่งกลางสะโพกถึงกึ่งกลางไหล่
สองเส้นนี้คือเส้นเดียวกับที่ใช้วัด `neckAngleDeg` และ `torsoAngleDeg`
ถ้ากล้องเห็นแค่ช่วงบน แบบ full ไม่วาดแขนหรือสะโพกที่มองไม่ชัด

### Dataset Recorder

Dataset Recorder เก็บตัวเลข landmark และ feature โดยไม่เก็บภาพ เพื่อใช้ปรับจูนเกณฑ์ท่านั่ง
วิธีใช้อยู่ใน [เก็บ dataset ท่านั่ง](mediapipe-dataset.md)

- label มีห้าค่า คือ `GOOD`, `FORWARD_HEAD`, `SLOUCH`, `LEAN_LEFT` และ `LEAN_RIGHT`
- ระบบเก็บเฉพาะเฟรมที่มีคนเดียว ประมาณ 12 sample ต่อวินาที เป็นค่าดิบก่อน smoothing
- CameraStage เก็บ sample เฉพาะตอนรัน dev (`import.meta.env.DEV`) production build ไม่เก็บ
- ไฟล์ export มี `meta.schemaVersion`, `exportedAt`, `poseModel`, `thresholdsAtExport` และ `samples[]`
- แต่ละ sample มี `cameraId`, `label`, มุมต่างๆ, `quality`, `landmarks` และ `worldLandmarks` 33 จุด พร้อม `visibility` และ `minVisibility`
- รูปแบบไฟล์กำหนดไว้ใน `frontend/src/lib/datasetJson.ts`

## โครงสร้างโค้ด

```
frontend/src/
  main.tsx                        เลือกหน้าตาม URL: / (LandingPage), ?systems, ?yolo-dashboard, ?alerts, ?people ที่เหลือส่งให้ App
  App.tsx                         state กลางของระบบ MediaPipe: ?dashboard, ?camera, ?console และส่งต่อไป ?report, ?gait, ?yolo-console
  envelope/                       ธีมซองยา: token สีและฟอนต์ (envelope.css), เครื่องหมายลายเส้น (marks.tsx), ป้ายของเครื่องหมาย
  pages/                          LandingPage (/), SystemChooserPage (?systems), PeoplePage, AlertsPage, ReportsPage, GaitAssessmentPage
  dashboard/                      OfficeDashboard และ OfficeRoom ภาพรวมห้องของระบบ MediaPipe (?dashboard)
  components/AppNavigation.tsx    แถบเมนูของหน้าในระบบ MediaPipe
  components/CameraStage.tsx      กล้อง, canvas overlay และ detection loop (pose และ face) ของกล้อง 1 ตัว
  components/CameraSourceSelector.tsx  เลือกกล้องในเครื่องหรือกล้อง IP (MJPEG)
  components/SettingsPanel.tsx    แผงตั้งค่าเกณฑ์ของหน้ากล้อง
  components/EnrollmentPanel.tsx  รายชื่อที่ลงทะเบียนใบหน้าและปุ่มลบ ในหน้ากล้อง
  components/AttendancePanel.tsx  การเข้า-ออกหน้ากล้องล่าสุด ในหน้ากล้องเมื่อเปิดฟีเจอร์ใบหน้า
  components/EventLog.tsx         ตารางประวัติแจ้งเตือนของหน้ากล้อง
  components/DatasetRecorderPanel.tsx  แผงบันทึก dataset แบบง่ายของหน้ากล้อง
  console/                        Dev Console (DevConsole, EngineSwitch, MonitorTab, RecorderPanel, ThresholdsTab,
                                  EventsTab, PeopleTab, useBackendHealth, format, console.css)
  hooks/usePoseLandmarker.ts      โหลด MediaPipe Pose Landmarker เลือกรุ่น lite, full, heavy และรายงาน GPU หรือ CPU
  hooks/useFaceApiModels.ts       โหลดโมเดลของ face-api
  hooks/useCameraDevices.ts       รายชื่อกล้องในเครื่อง
  hooks/usePersistentState.ts     state ที่จำค่าใน localStorage
  hooks/useTheme.ts               ธีมสว่างและมืด (key camwell:theme)
  lib/postureEngine.ts            pipeline ต่อเฟรมของกล้อง 1 ตัว (tracker, posture, fall, break)
  lib/postureAnalysis.ts          คำนวณมุมท่านั่งและจัดท่า
  lib/postureCalibration.ts       คำนวณ baseline จากช่วง Calibrate
  lib/standingPostureAnalysis.ts  ท่ายืน (หน้า ?gait)
  lib/gaitAnalysis.ts, multiPersonGait.ts  ท่าเดินและ Romberg (หน้า ?gait)
  lib/smoothing.ts                EMA ของ feature
  lib/tracker.ts                  จับคู่คนข้ามเฟรม
  lib/fallDetection.ts            ตรวจการหกล้ม
  lib/breakReminder.ts            ตัวจับเวลานั่งต่อเนื่อง
  lib/fatigueAnalysis.ts          EAR และ MAR (หลับตาและหาว)
  lib/distanceAnalysis.ts         ระยะห่างจากจอ
  lib/sustainedAlertMachine.ts    state machine แจ้งเตือนกลาง
  lib/poseThrottle.ts             จำกัด 12 fps
  lib/skeletonOverlay.ts          เส้นโครงร่าง basic และ full (แสดงผลอย่างเดียว)
  lib/datasetJson.ts              รูปแบบไฟล์ dataset ที่ export
  lib/multiPerson.ts              โหมด workstation, multi, unlimited
  services/alertReporter.ts       ส่งเหตุการณ์แจ้งเตือนไป camwell-backend
  services/alertHistory.ts        อ่านประวัติแจ้งเตือนจาก camwell-backend (?alerts)
  services/presence.ts            บันทึกและอ่านการเข้า-ออกหน้ากล้อง
  services/dailyReport.ts         รายงานประจำวันจาก camwell-backend (?report)
  services/faceEnrollment.ts      ลงทะเบียน ลบ และจับคู่ใบหน้าผ่าน camwell-backend
  services/datasetRecorder.ts     เก็บ sample dataset (เลือกกล้อง, ล็อกรุ่นโมเดล)
  services/postureBaselineStore.ts baseline ท่านั่งต่อกล้อง (localStorage)
  services/apiConfig.ts           API_BASE_URL และ fetch helper
  services/beep.ts                เสียงแจ้งเตือน (Web Audio API)
  types/                          alerts, posture, fall, wellbeing, identity, person, cameraSource
backend/                          camwell-backend (Express, SQLite ที่ data/camwell.sqlite): employees, alerts, presence, reports
```
