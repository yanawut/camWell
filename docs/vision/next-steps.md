# Vision service: สถานะและงานถัดไป

เอกสารนี้ส่งต่องาน `vision_service` หลังเอาระบบจับคนจาก Cam-Well-YoLo-ByteTrack เข้ามา โปรเจกต์นั้นพักไว้ที่ commit `9bc5f9b` งานต่อจากนี้ทำใน repo นี้

## สถานะตอนนี้

`vision_service/people.py` ตัดสินว่าแต่ละกรอบของ ByteTrack เป็นใคร คนหนึ่งคนได้กรอบเดียว คนนั่งนิ่งได้ ID เดิมแม้ detector มองไม่เห็นชั่วคราว และกรอบคนที่ตรงกับกรอบเก้าอี้ไม่นับเป็นคน `CameraRunner` ใน `app.py` เรียกใช้หลัง tracking และรัน pose เฉพาะคนที่เห็นในเฟรมนั้น คนที่ถูกบังชั่วคราวส่งไปเป็น `held: true` โดยไม่มี keypoints frontend จึงข้ามคนนั้นเหมือนเดิม

API ไม่เปลี่ยน frontend แก้แค่เพิ่ม `held?: boolean` ใน `YoloPerson`

## วิธีวัดผล

ทุกการเปลี่ยน tracking หรือความเร็วควรวัดกับคลิปจริงก่อน merge

```bat
vision_service\.venv\Scripts\python.exe vision_service\tools\eval_clips.py run "<clip.mp4>" --logs vision_service\tools\logs
vision_service\.venv\Scripts\python.exe vision_service\tools\eval_clips.py replay "vision_service\tools\logs\<clip>.jsonl"
vision_service\.venv\Scripts\python.exe vision_service\tools\record_clip.py "http://localhost:1984/api/stream.mjpeg?src=imou" "<out.mp4>" 240
```

- `run` รัน YOLO จริงที่ 11 เฟรมต่อวินาทีของวิดีโอ ใช้เวลาเท่าความยาวคลิปโดยประมาณ บันทึก log ไว้ใช้ replay
- `replay` เอา track ใน log ป้อนเข้า `people.py` ใหม่โดยไม่รัน YOLO ใช้เวลาไม่กี่วินาที เหมาะกับการลองแก้ `people.py` ตัวเลข `on_screen` ของ replay สูงกว่า `run` เล็กน้อย เพราะไม่รู้ว่า pose จะหาจุดเจอหรือไม่
- ความหมายของแต่ละคะแนนอยู่ที่หัวไฟล์ `eval_clips.py`

คลิปที่ใช้วัดมาจากกล้องตัวเดียวกัน

| คลิป | ที่อยู่ | ลักษณะ |
|---|---|---|
| 4 นาที | `C:\Users\WutGiiz\Videos\camwell-eval\2026-11-20 office 4min.mp4` | คนนั่งทำงาน มีคนลุกเดิน header เขียน 15 fps แต่อัดจริงที่ 25 fps |
| 2 นาที | `C:\Users\WutGiiz\Videos\camwell-eval\2026-11-20 office 2min.mp4` | คนแถวหลังถูกบังบ่อย |
| 5 พ.ย. | `C:\Users\WutGiiz\Videos\2026-11-05 11-42-29.mp4` | คนเดินไปมาเยอะ นับด้วยตา 8 เฟรมได้เฉลี่ยราว 3.9 คน |
| 16 ต.ค. | `C:\Users\WutGiiz\Videos\example clip.mp4` | ฉากเงียบ คนนั่งเป็นหลัก |

ตัวเลขตั้งต้น เทียบ `app.py` ก่อนและหลังการเปลี่ยนนี้ วัดคลิปละรอบบน RTX 2060

| คลิป | คนบนจอต่อเฟรม | slots ("คนที่ N" ใหม่) | เฟรมที่มีกรอบซ้ำ | ms ต่อเฟรม |
|---|---|---|---|---|
| 4 นาที | 5.81 → 3.45 | 116 → 10 | 2691 → 0 | 77.1 → 72.4 |
| 2 นาที | 3.77 → 2.52 | 37 → 8 | 81 → 0 | 65.5 → 61.5 |
| 5 พ.ย. | 5.00 → 3.84 | 90 → 44 | 114 → 1 | 66.9 → 65.3 |
| 16 ต.ค. | 4.84 → 3.05 | 44 → 11 | 227 → 0 | 68.0 → 64.4 |

## งานถัดไป เรียงตามลำดับที่แนะนำ

### 1. ให้ server วิเคราะห์ภาพ RTSP เอง

ตอนนี้กล้อง RTSP ส่งภาพไปกลับหนึ่งรอบทุกเฟรม server อ่าน RTSP แล้วเข้ารหัส JPEG เป็น MJPEG preview จากนั้น browser วาดลง canvas เข้ารหัส JPEG อีกรอบแล้วส่งกลับมาที่ `POST /api/infer` และ browser ส่งได้ทีละเฟรมต่อกล้อง (`yoloBusyRef`)

ถ้าให้ `RTSPStream` ส่งเฟรมล่าสุดเข้า `CameraRunner` ฝั่ง server แล้วส่งแค่ผล JSON ไปที่ browser ผ่าน WebSocket หรือ SSE จะตัดการเข้ารหัสและส่งภาพไปกลับออกทั้งหมด ผมเดาว่าจะได้จากราว 9 เป็นราว 14 ครั้งต่อวินาที ค่านี้ยังเป็นการเดา ให้วัดอัตราการวิเคราะห์จริงใน browser ก่อนลงมือ (`poseInferenceMs` บนหน้ากล้องเป็นจุดเริ่มต้นที่ดี)

ไฟล์ที่ต้องแก้คือ `vision_service/app.py` (loop วิเคราะห์ต่อกล้องและ endpoint ส่งผล), `src/services/yoloPoseClient.ts` และเส้นทาง YOLO ใน `src/components/CameraStage.tsx` กล้อง webcam ยังต้องใช้ `POST /api/infer` เหมือนเดิม

### 2. หลายกล้อง

`MAX_CAMERAS = 2` และแต่ละกล้องโหลดโมเดลตรวจจับกับ pose ของตัวเอง หน่วยความจำ GPU จึงโตตามจำนวนกล้อง ทางเลือกคือใช้โมเดลร่วมกันแล้วแยก tracker ต่อกล้อง (สร้าง `BYTETracker` ต่อกล้องเองแทน `persist=True`) และรวมเฟรมจากหลายกล้องเป็น batch เดียว ก่อนเลือกให้วัด ms ต่อเฟรมกับหน่วยความจำ GPU ที่ 1 และ 2 กล้อง

### 3. เพิ่มความเร็วต่อ

YOLO ตรวจจับกับ pose ใช้เวลาเกือบเท่ากัน ราว 34 ms ต่อเฟรมทั้งคู่ วัดด้วย backend ของ Room Analytics บน RTX 2060 เครื่องนี้ ซึ่งใช้โมเดลและขนาดภาพเดียวกับ `CameraRunner` ทางเลือกที่ยังไม่ได้ลอง ได้แก่ FP16 (`half=True`), export เป็น TensorRT, ลด `imgsz` จาก 960 เป็น 640 และรัน pose คนที่นั่งนิ่งถี่น้อยลง ทุกข้ออาจทำให้ความแม่นเปลี่ยน ต้องรัน `eval_clips.py run` กับทั้ง 4 คลิปแล้วเทียบกับตารางด้านบนทุกครั้ง การปิด pose ไม่ใช่ทางเลือก เพราะ posture engine ต้องใช้ keypoints

### 4. MJPEG preview

`rtsp_preview` เข้ารหัสทุกเฟรมเต็มความละเอียดด้วยคุณภาพค่าเริ่มต้นของ OpenCV (95) ถ้าทำข้อ 1 แล้ว ภาพ preview มีไว้แสดงอย่างเดียว ลดคุณภาพหรือขนาดได้ ควรวัด CPU ก่อนและหลัง

### 5. pose อาจได้จุดของคนข้างๆ

`CameraRunner` ใช้ `keypoints.data[0]` ซึ่งเป็นคนที่ pose มั่นใจที่สุดใน crop ไม่จำเป็นต้องเป็นคนที่ crop ถูกตัดมาให้ เมื่อคนนั่งชิดกัน posture อาจคำนวณจากคนผิด Room Analytics เลือกคนที่ทับกลาง crop มากที่สุดแทน (`YoloRunner._pose_crops` ใน `room_analytics.py`) ควรวัดก่อนว่าเกิดบ่อยแค่ไหน

### 6. คนที่ถูกบังหายจากจอ

คนที่เป็น `held` ไม่มี keypoints frontend จึงไม่วาดกรอบ และ posture engine ลบคนนั้นหลังไม่เห็น 4 วินาที (`POSE_TRACK_STALE_MS`) คนที่นั่งอยู่ถ้ากลับมาภายในราว 40 วินาที (450 เฟรม) จะได้ ID เดิม แต่ตัวจับเวลาของคนนั้นเริ่มใหม่ คนที่ไม่ได้นั่งค้างได้แค่ 15 เฟรม ถ้าอยากให้นับต่อ ต้องให้ engine ถือว่าคน `held` ยังอยู่โดยไม่ประเมินท่าจากภาพที่ถูกบัง

## ข้อจำกัดที่รู้แล้ว

- คนในภาพบนจอมอนิเตอร์ถูกนับเป็นคน และค้างไว้นานเพราะกรอบนิ่ง
- คนที่ยืนนิ่งแล้วเดินออกไปตอน detector มองไม่เห็น กรอบค้างได้ถึง 450 เฟรม
- คนที่ถูกบังจะหายไป ถ้ามีคนมาอยู่ตรงนั้นด้วยกรอบขนาดใกล้กัน เช่นก้มลงข้างเขา
- ค่าใน `PersonSettings` ปรับจากกล้องตัวนี้ในห้องนี้ ถ้าย้ายกล้องหรือใช้กล้องใหม่ ให้อัดคลิปใหม่แล้ววัดก่อนใช้

## Gate ที่พังอยู่แล้วบน main

- `npm run build` พังจาก import ที่ไม่ได้ใช้ใน `src/App.tsx` (TS6133 ห้าที่)
- `npx vitest run` อ่าน `backend/src/lib/officeSyndromeRisk.test.ts` ไม่ได้ ("No test suite found") เทสต์อื่นผ่านทั้งหมด
