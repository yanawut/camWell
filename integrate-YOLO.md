# แผนนำ YOLO เข้าหน้ากล้องและ Dashboard

เอกสารนี้สรุปสิ่งที่ต้องรู้ก่อนพัฒนาให้หน้า `?camera` และ `?dashboard` สลับไปใช้ YOLO ได้ ข้อมูลมาจากการอ่านโค้ด การรันทดสอบ และเอกสารต้นทางที่อยู่ในหัวข้อ "แหล่งอ้างอิง" ท้ายไฟล์

## สถานะตอนนี้

| หน้า | โมเดลที่ใช้ |
|---|---|
| `?dashboard`, `?camera` | MediaPipe Pose (รันในเบราว์เซอร์) และ face-api ผ่าน `CameraStage` (`frontend/src/components/CameraStage.tsx:187-194`) |
| `?gait` | MediaPipe Pose รุ่น lite (`frontend/src/pages/GaitAssessmentPage.tsx:166`) |
| `?people`, `?alerts`, `?report` | ไม่รันโมเดล อ่านข้อมูลจาก camwell-backend อย่างเดียว |
| `?yolo-console` | yolo-backend ใช้ `yolov8m.pt` และ `yolov8m-pose.pt` แยกคนเป็นนั่ง ยืน หรือเดิน (`yolo-backend/room_analytics.py:43`) |

- หน้ากล้องเคยมีโหมด YOLO แต่ commit `bc61319` ถอดออก เพราะ yolo-backend ตัวใหม่ไม่มี endpoint ที่ frontend เคยเรียก
- ดึงโค้ด frontend เดิมกลับมาได้ด้วย `git show bc61319^:<path>` เพราะตั้งแต่ commit นั้น `CameraStage.tsx` เปลี่ยนไปแค่ 3 บรรทัด และ `postureEngine.ts` ไม่เปลี่ยนเลย

## ตัวโมเดล yolov8 ให้อะไรมา

ผมโหลดไฟล์ทั้งสองตัวใน `yolo-backend/.venv` แล้วดูว่าโมเดลให้ข้อมูลอะไรออกมา

| ไฟล์ | งาน | สิ่งที่ได้ |
|---|---|---|
| `yolov8m.pt` | detect | กรอบวัตถุ 80 คลาสของ COCO เช่น person, chair, dining table, tv, laptop ไม่มีคลาสที่เกี่ยวกับการล้ม |
| `yolov8m-pose.pt` | pose | คลาสเดียวคือ `person` และจุดร่างกาย 17 จุดต่อคน (`kpt_shape [17, 3]` คือ x, y และค่าความมั่นใจ) |

จุด 17 จุดนี้เป็นแบบ COCO ซึ่งไม่มีส้นเท้าและปลายเท้า ส่วนโค้ดวิเคราะห์ใน `frontend/src/lib/` อ่านจุดตามลำดับของ BlazePose ที่มี 33 จุด จึงต้องมีตัวแปลงก่อนส่งข้อมูลเข้าไป

## เลือกโมเดลให้แต่ละฟีเจอร์

| ฟีเจอร์ | ใช้อะไร |
|---|---|
| ท่านั่ง (คอ หลัง ไหล่เอียง) | yolov8-pose เพราะ 17 จุดมีจมูก หู ไหล่ และสะโพกครบตามที่ต้องใช้ |
| หกล้ม | yolov8-pose แล้วเขียนกฎจากความเร็วที่ไหล่หรือสะโพกตกลงร่วมกับมุมลำตัว หรือ train yolov8 ต่อเพื่อเพิ่มคลาส fall |
| เตือนพัก | yolov8 หาคน ใช้ `model.track(..., persist=True)` ให้คนเดิมได้หมายเลขเดิมข้ามเฟรม ใช้ pose แยกว่านั่งหรือยืน แล้วจับเวลาในโค้ด |
| ความเหนื่อยล้า (หลับตา หาว) | face-api ใช้จุดบนหน้า 68 จุด ระบบมีอยู่แล้ว |
| ระยะห่างจากจอ | MediaPipe Face Landmarker วัดขนาดม่านตา ดูหัวข้อ "ระยะห่างจากจอ" ด้านล่าง |
| จำหน้าพนักงาน | face-api ระบบมีอยู่แล้ว |
| ท่ายืนและท่าเดิน (`?gait`) | MediaPipe ต่อ เพราะ COCO ไม่มีส้นเท้าและปลายเท้า ถ้าใช้ YOLO ผล steppage, toe walking และมุมเท้าจะหายไปโดยไม่มี error |

ผมรัน test ชั่วคราวโดยป้อนจุดแบบ yolov8-pose ผ่าน mapping เดิมเข้า `PostureEngine` ตัวจริง แล้วได้ผลดังนี้

- ระบบคำนวณมุมคอ มุมลำตัว และไหล่เอียงได้ครบ คุณภาพสัญญาณเป็น `full_body`
- ร่างล้มจากท่ายืนลงไปนอนราบใน 0.6 วินาที ระบบแจ้ง `fall_detected`
- ร่างค่อยๆ นั่งลงใน 2 วินาที ระบบไม่แจ้งเหตุการณ์ใด
- ร่างอยู่หน้ากล้องต่อเนื่อง ระบบเตือนให้พักครั้งเดียวที่นาทีที่ 45

test นี้ใช้โครงร่างที่สร้างขึ้นเอง ไม่ใช่วิดีโอจริง และยังไม่ได้เพิ่มเข้า repo ตอนลงมือทำ ให้เพิ่ม test แบบเดียวกันไว้คู่กับตัวแปลง

## งานฝั่ง yolo-backend

1. เพิ่ม endpoint pose สำหรับแต่ละกล้อง ให้รับภาพ JPEG หนึ่งเฟรมพร้อม camera id แล้วคืน `{ width, height, people: [{ id, box, conf, held, keypoints }], processMs }` โดยไม่ต้องส่งภาพกลับ รูปแบบนี้ตรงกับ `YoloFrameResult` เดิม และ `PersonDet` มี field ครบแล้ว (`room_analytics.py:119-126`)
2. แยก endpoint นี้ออกจาก `Session` และ `Manager` เพราะ `Manager` เปิดได้ครั้งละ session เดียว (`app/main.py:77`) แต่ dashboard เปิดได้ 2 กล้องพร้อมกัน (`MAX_CAMERA_SLOTS = 2`)
3. สร้าง `YoloRunner` แยกให้แต่ละกล้อง เพราะ `det.track(persist=True)` เก็บสถานะของ ByteTrack ไว้ในตัวโมเดล (`room_analytics.py:1054`) ถ้าสองกล้องใช้ตัวเดียวกัน หมายเลขคนจะปนกัน
4. ใส่ lock ตอนเรียก GPU และกำหนดว่า YOLO Console กับหน้ากล้องจะแบ่ง GPU กันอย่างไร
5. เพิ่ม endpoint สำหรับปิดกล้อง เพื่อคืน runner ที่ไม่ใช้แล้ว
6. ถ้าจะเปิดใช้นอก `localhost:5173` ให้แก้ `ALLOWED_ORIGINS` (`app/config.py:8`) และ proxy `/yolo` ใน `frontend/vite.config.ts`

## งานฝั่ง frontend

1. ดึง `frontend/src/lib/yoloPose.ts` และ test ของมันกลับมาจาก `bc61319^` ไฟล์นี้แปลงจุด COCO 17 จุดเป็นตำแหน่งแบบ BlazePose 33 จุด และแปลงพิกเซลเป็นค่า 0 ถึง 1 ไฟล์อื่นใน `lib/` ไม่ต้องแก้
2. เพิ่ม setting `poseEngine: 'mediapipe' | 'yolo'` แยกจาก `PoseModelVariant` อย่าใส่ `'yolo'` เข้า `POSE_MODELS` แบบเดิม เพราะแบบนั้นทำให้ MediaPipe lite ถูกโหลดคู่ไปด้วยทุกครั้ง
3. ใน `CameraStage.tsx:711-732` แยกขั้นตอนเรียกโมเดล MediaPipe เรียกแบบ sync ส่วน YOLO ต้องเรียกแบบ async แล้วเก็บผลล่าสุดพร้อมเลขลำดับ
4. ส่ง track ID ของ YOLO เข้า `PostureEngine` ผ่านพารามิเตอร์ `externalTrackIds` ที่ถูกลบออกใน `bc61319` แทนการใช้ `PositionTracker`
5. ใส่สวิตช์เลือก engine ใน `SettingsPanel` ของหน้า `?camera` และเก็บค่าด้วย `usePersistentState` เพื่อให้ dashboard ใช้ค่าเดียวกัน
6. แสดงสถานะ yolo-backend แบบเดียวกับ `useBackendHealth` และขึ้น banner เมื่อ backend ไม่ตอบ
7. ให้ข้อความความเป็นส่วนตัวเปลี่ยนตาม engine ข้อความ "วิดีโอไม่ถูกส่งออกจากอุปกรณ์" (`App.tsx:381`) และ "ประมวลผลในเบราว์เซอร์นี้เท่านั้น" (`CameraStage.tsx:1118`) จะไม่จริงในโหมด YOLO ข้อนี้เกี่ยวกับ PDPA
8. แยก key ของ baseline ท่านั่งตาม engine ตอนนี้ key ผูกกับกล้องอย่างเดียว (`postureBaselineStore.ts:3`)

`npm run dev:all` เปิด yolo-backend ให้อยู่แล้วถ้ามี `yolo-backend\.venv` (`scripts/dev-all.mjs:13`)

## ระยะห่างจากจอ

ตอนนี้ `distanceAnalysis.ts` เทียบความกว้างใบหน้ากับค่าตอน calibrate แล้วเตือนเมื่อหน้าใหญ่ขึ้นถึง 1.35 เท่า (`wellbeing.ts:59`) ค่า 1.35 ไม่ได้อิงมาตรฐานใด และวัดเป็นเซนติเมตรไม่ได้

ให้เปลี่ยนมาวัดระยะจริงจากขนาดม่านตา

- เส้นผ่านศูนย์กลางม่านตาแนวนอนมีขนาดใกล้เคียงกันในคนส่วนใหญ่ ที่ 11.7±0.5 มม. วิธีนี้คลาดเฉลี่ย 4.3% (SD 2.4%) และ 4.8% เมื่อใส่แว่น (Google Research)
- MediaPipe Face Landmarker ให้จุดบนหน้า 478 จุด และใช้บนเว็บได้ผ่าน `@mediapipe/tasks-vision` ที่ติดตั้งอยู่แล้ว เวอร์ชัน 1.0.1 ที่ติดตั้งมี `FACE_LANDMARKS_LEFT_IRIS` และ `FACE_LANDMARKS_RIGHT_IRIS` ใน class `FaceLandmarker`
- วิธีนี้ต้องรู้ focal length ของกล้อง ให้ calibrate ครั้งเดียวต่อกล้อง โดยให้คนนั่งห่างจอในระยะที่วัดด้วยตลับเมตร แล้วคำนวณ focal length จากขนาดม่านตาในภาพ
- ให้เตือนเมื่อระยะต่ำกว่า 50 ซม. OSHA แนะนำระยะจากตาถึงจอที่ 50 ถึง 100 ซม.

## face-api

### เลือกตัวหาใบหน้า

ตอนนี้ระบบใช้ Tiny Face Detector (`CameraStage.tsx:464`) ซึ่ง README ของ face-api.js ระบุว่าหาหน้าเล็กได้ไม่ค่อยดี

| | Tiny Face Detector (ใช้อยู่) | SSD Mobilenet V1 |
|---|---|---|
| ขนาด | ราว 190 KB | ราว 5.4 MB |
| จุดเด่น | เร็วกว่าและใช้ทรัพยากรน้อยกว่า | หากรอบใบหน้าได้แม่นกว่า |
| จุดอ่อน | หาหน้าเล็กได้ไม่ค่อยดี | ช้ากว่า |
| ข้อมูลที่ใช้ train | ภาพราว 14K ภาพ | WIDERFACE |

1. ลองตั้ง `inputSize` ของ `TinyFaceDetectorOptions` เป็น 512 หรือ 608 ก่อน ตามที่ README แนะนำไว้สำหรับหน้าเล็ก ตอนนี้โค้ดใช้ค่า default คือ 416
2. ถ้ายังไม่พอ ให้เปลี่ยนเป็น SSD Mobilenet V1 ไฟล์โมเดลมีอยู่แล้วใน `node_modules/@vladmandic/face-api/model/` ต้องแก้สามไฟล์
   - `frontend/scripts/setup-assets.mjs:37-42` เพิ่ม `ssd_mobilenetv1_model.bin` และไฟล์ manifest ของมัน
   - `frontend/src/hooks/useFaceApiModels.ts` โหลด `faceapi.nets.ssdMobilenetv1` เพิ่ม
   - `CameraStage.tsx:464` เปลี่ยนเป็น `new faceapi.SsdMobilenetv1Options({ minConfidence })` (README ระบุ default เป็น 0.5)

ตัวหาหน้าทำงานแยกจากโมเดลจับท่าทาง จึงใช้ได้ทั้งตอนเลือก MediaPipe และตอนเลือก YOLO

### ขั้นตอนการจำหน้า

1. face-api หากรอบใบหน้า
2. face-api หาจุดบนหน้า 68 จุดเพื่อจัดหน้าให้ตรง
3. face-api แปลงใบหน้าเป็น descriptor ที่มี 128 ค่า โมเดลนี้ได้ 99.38% บนชุดทดสอบ LFW
4. backend เทียบ descriptor กับข้อมูลที่เก็บไว้ทั้งหมดด้วยระยะห่าง euclidean และถือว่าเป็นคนเดียวกันเมื่อระยะไม่เกิน 0.55 (`backend/src/faceMatch.ts:6`) README ไม่ได้กำหนดค่านี้ไว้ ค่า 0.55 เป็นค่าที่โค้ดเลือกเอง

การลงทะเบียนมีสองแบบ

- **ลงทะเบียนเอง** ผู้ใช้พิมพ์ชื่อและติ๊กยืนยันความยินยอม แล้วระบบส่ง descriptor ไป `POST /api/employees` backend ปฏิเสธคำขอที่ไม่มี `consentGiven: true` (`backend/src/routes/employees.ts:51`)
- **ลงทะเบียนอัตโนมัติ** ถ้าระบบเจอหน้าที่กว้างอย่างน้อย 80 พิกเซลและไม่ตรงกับใคร backend จะสร้างพนักงานชื่อ "คนที่ N" ให้ (`employees.ts:176`)

ระหว่างใช้งาน ระบบเช็คตัวตนของแต่ละคนทุก 3 วินาทีผ่าน `POST /api/employees/identify`

### ความเสี่ยงของ face-api

- `@vladmandic/face-api` ถูก archive ไปตั้งแต่ 5 ก.พ. 2025 และอยู่ในสถานะอ่านอย่างเดียว ถ้าเจอบั๊กจะไม่มีใครแก้ให้
- ถ้าเปลี่ยนโมเดลจำหน้า พนักงานทุกคนต้องลงทะเบียนหน้าใหม่ เพราะ descriptor ที่เก็บไว้ (`backend/src/db.ts:45`) มาจาก face-api และเอามาเทียบกับผลของโมเดลอื่นไม่ได้

ถ้าต้องเปลี่ยนโมเดลจำหน้า มีทางเลือกดังนี้

| ตัวเลือก | license | หมายเหตุ |
|---|---|---|
| OpenCV SFace คู่กับ YuNet | SFace ใช้ Apache 2.0 และ YuNet ใช้ MIT | SFace ได้ 0.9940 จากเครื่องมือ eval ของ repo ซึ่งไม่ได้ระบุชื่อ dataset รันฝั่ง Python ใน yolo-backend ได้ แต่ต้องตรวจก่อนว่า OpenCV เวอร์ชันที่ติดตั้งรองรับ |
| InsightFace (buffalo_l) | โค้ดใช้ MIT แต่โมเดลใช้ได้เฉพาะงานวิจัยที่ไม่ใช่เชิงพาณิชย์ | ถ้าจะใช้ในบริษัท ต้องติดต่อซื้อ license ก่อน |

## ข้อควรระวัง

- ตัวเลขความแม่นทั้งหมดมาจากเอกสารและบทคัดย่อ ยังไม่ได้ทดสอบกับกล้องของเรา
- ก่อนใช้งานจริง ให้ทดสอบการตรวจล้มและการจำหน้ากับกล้องและตำแหน่งติดตั้งจริงก่อน

## แหล่งอ้างอิง

**YOLO**
- [Ultralytics docs, Pose estimation](https://docs.ultralytics.com/tasks/pose)
- [Ultralytics docs, Track mode](https://docs.ultralytics.com/modes/track)
- [Ye (2024), Elderly Fall Detection Based on YOLO and Pose Estimation](https://www.scitepress.org/PublishedPapers/2024/134865)
- [Khawam et al. (2025), Real-Time Fall Detection Using a YOLOv8-Pose Model](https://jqcsm.qu.edu.iq/index.php/journalcm/article/download/2425/1119/6408)
- [Ukampan et al. (2025), Real-Time Fall Detection for Elderly Care Using YOLOv8](https://ph02.tci-thaijo.org/index.php/mijet/article/view/258751)
- [Hackster, Fall detection customizing YOLOv8](https://www.hackster.io/pattshibang/fall-detection-on-jetson-nano-customizing-yolov8-f10879)
- [Chulalongkorn thesis, YOLO pose dwell-time for sedentary behavior](https://digital.car.chula.ac.th/chulaetd/75098)
- [Computer prompts to break sedentary behaviour, meta-analysis](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12164069/)

**ระยะห่างจากจอ**
- [MediaPipe Iris: Real-time Iris Tracking & Depth Estimation (Google Research)](https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/)
- [MediaPipe Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)
- [OSHA eTool, Computer Workstations, Monitors](https://www.osha.gov/etools/computer-workstations/components/monitors)

**ใบหน้า**
- [face-api.js README](https://github.com/justadudewhohacks/face-api.js)
- [vladmandic/face-api README](https://github.com/vladmandic/face-api)
- [OpenCV Zoo, SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)
- [OpenCV Zoo, YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)
- [InsightFace README](https://github.com/deepinsight/insightface)
