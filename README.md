# Camwell

Webapp ที่ใช้กล้องตรวจท่านั่ง ระยะห่างจากจอ เวลานั่งต่อเนื่อง ความเหนื่อยล้า และการหกล้มของพนักงานออฟฟิศ
แล้วแจ้งเตือนเมื่อปัญหาเกิดต่อเนื่องนานพอ ยกเว้นการหกล้มที่แจ้งทันที

หลังเข้าสู่ระบบ ผู้ใช้เลือกระบบตรวจจับได้สองระบบ ทั้งสองระบบใช้หน้าตาและเมนูชุดเดียวกัน แต่ประมวลผลคนละที่และเก็บข้อมูลแยกกัน

| ระบบ | ประมวลผลที่ | โมเดล | เก็บข้อมูลที่ |
|---|---|---|---|
| YOLOv8 (แนะนำ) | yolo-backend (Python) ซึ่งอ่านกล้องผ่าน go2rtc เองได้ จึงไม่ต้องเปิดหน้าเว็บค้างไว้ | ท่าทาง `yolov8m-pose.pt` (17 จุด), คนและสิ่งของ `yolov8m.pt` กับ ByteTrack, ใบหน้า InsightFace `buffalo_l` หรือ YuNet กับ SFace | ไฟล์ใน `yolo-backend/data/` |
| MediaPipe | เบราว์เซอร์ของเครื่องที่เปิดหน้าไว้ | Pose Landmarker (33 จุด), @vladmandic/face-api | camwell-backend (SQLite) |

โปรเจกต์มีสามส่วน ทุกส่วนรันบนเครื่องในออฟฟิศ และไม่ส่งภาพหรือวิดีโอขึ้นคลาวด์

| ส่วน | โฟลเดอร์ | พอร์ต | หน้าที่ |
|---|---|---|---|
| frontend | `frontend/` | 5173 | หน้าเว็บทุกหน้าของทั้งสองระบบ (React, Vite) |
| camwell-backend | `backend/` | 4000 | เก็บข้อมูลของระบบ MediaPipe (Express, SQLite) |
| yolo-backend | `yolo-backend/` | 8000 | ระบบ YOLOv8 ทั้งระบบ (FastAPI, YOLOv8) |

## เริ่มต้นใช้งาน

ต้องติดตั้งครบทั้งสามส่วนจึงจะใช้ได้ทั้งสองระบบ ติดตั้งแต่ละส่วนตามหัวข้อด้านล่างครั้งแรกครั้งเดียว
แล้วเปิดทุกส่วนพร้อมกันตามหัวข้อ "เปิดทั้งหมดพร้อมกัน"

### frontend

หน้าเว็บทุกหน้าของทั้งสองระบบ รันที่พอร์ต 5173 ต้องใช้ Node.js 22.12 ขึ้นไป เพราะ Vite 8 ใช้กับ Node.js 22 รุ่นก่อน 22.12 ไม่ได้

```bash
cd frontend
npm install       # ติดตั้ง dependency แล้วรัน scripts/setup-assets.mjs ต่อให้เอง
npm run dev       # http://localhost:5173
```

`scripts/setup-assets.mjs` เตรียมไฟล์ที่หน้าเว็บต้องใช้ตอนรัน

1. คัดลอก WASM runtime ของ MediaPipe ไปไว้ที่ `public/wasm`
2. ดาวน์โหลดโมเดล `pose_landmarker_{lite,full,heavy}.task` (รวมประมาณ 44 MB) จาก storage.googleapis.com ไปไว้ที่ `public/models`
3. ดาวน์โหลดโมเดลของ face-api จาก raw.githubusercontent.com ไปไว้ที่ `public/models/face-api`

- สคริปต์ข้ามไฟล์ที่มีอยู่แล้ว เครือข่ายองค์กรบางแห่งบล็อก storage.googleapis.com ถ้าดาวน์โหลดไม่สำเร็จ สคริปต์จะพิมพ์ลิงก์และ path ที่ต้องวางไฟล์
  ดาวน์โหลดเองตาม `frontend/public/models/README.md` และ `frontend/public/models/face-api/README.md`
  หรือรัน `npm run setup:assets` ใน `frontend/` อีกครั้งภายหลัง
- ตั้งที่อยู่ของ camwell-backend ได้ที่ `VITE_API_BASE_URL` ใน `frontend/.env` ค่าเริ่มต้นคือ `http://localhost:4000`
- เปิดหน้าเว็บที่ `http://localhost:5173` ถ้าพอร์ต 5173 ไม่ว่าง Vite จะย้ายไปพอร์ตอื่น แล้ว backend ทั้งสองตัวจะปฏิเสธคำขอจากหน้าเว็บ
  เพราะ yolo-backend รับเฉพาะ origin `localhost:5173` กับ `127.0.0.1:5173` (`yolo-backend/app/config.py`)
  และ camwell-backend รับเฉพาะ origin ใน `CORS_ORIGIN` ซึ่งค่าเริ่มต้นคือ `http://localhost:5173`
- คำสั่งอื่นใน `frontend/` ได้แก่ `npm test` รันเทสต์ด้วย vitest, `npm run lint` ตรวจโค้ดด้วย oxlint
  และ `npm run build` ตรวจ type ด้วย tsc แล้ว build ด้วย Vite

### camwell-backend

เก็บข้อมูลของระบบ MediaPipe ได้แก่ ใบหน้าที่ลงทะเบียน (`/api/employees`), ประวัติแจ้งเตือน (`/api/alerts`),
การเข้า-ออกหน้ากล้อง (`/api/presence`) และรายงานประจำวัน (`/api/reports/daily`)
รันที่พอร์ต 4000 ต้องใช้ Node.js 22.5 ขึ้นไป เพราะใช้ `node:sqlite` ที่มากับ Node.js

```bash
cd backend
npm install
cp .env.example .env    # พอร์ต, path ไฟล์ DB และ origin ที่อนุญาต
npm run dev             # http://localhost:4000
```

- ข้อมูลเก็บที่ `backend/data/camwell.sqlite` เปลี่ยนได้ที่ `DB_PATH` ใน `.env`
- ถ้าไม่เปิด camwell-backend ระบบ MediaPipe ยังตรวจจับและเตือนบนจอได้ แต่จะไม่จำหน้า
  และหน้ารายชื่อ ประวัติแจ้งเตือน และรายงานประจำวันจะไม่มีข้อมูล
- รายละเอียด API และตารางในฐานข้อมูลอยู่ที่ `backend/README.md`

### yolo-backend

ระบบ YOLOv8 ทั้งระบบ ได้แก่ วิเคราะห์ภาพทั้งห้อง จำหน้า แจ้งเตือน และรายงาน ใช้ FastAPI, YOLOv8 และ ByteTrack รันที่พอร์ต 8000
ต้องใช้ Python 3.12 และ torch รุ่น CUDA 12.8 ซึ่งต้องลงจาก index ของ PyTorch จึงไม่อยู่ใน `requirements.txt`

```bat
py -3.12 -m venv yolo-backend\.venv
yolo-backend\.venv\Scripts\python.exe -m pip install torch==2.11.0+cu128 torchvision==0.26.0+cu128 --index-url https://download.pytorch.org/whl/cu128
yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements.txt
rem ชุดจดจำใบหน้า: ลง insightface แล้วเปลี่ยน onnxruntime เป็นรุ่น GPU ที่เข้ากับ torch cu128
yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements-face.txt
yolo-backend\.venv\Scripts\python.exe -m pip uninstall -y onnxruntime onnxruntime-gpu
yolo-backend\.venv\Scripts\python.exe -m pip install "onnxruntime-gpu>=1.22,<1.27"
npm run dev:yolo        # รันที่ root ได้ http://127.0.0.1:8000
```

- ถ้าไม่เปิด yolo-backend ระบบ YOLOv8 ใช้ไม่ได้เลย
- ถ้าเปิดด้วย `scripts\dev.bat` ไม่ต้องรันคำสั่ง pip ที่อยู่หลังบรรทัดที่ลง torch เพราะ dev.bat ตรวจแพ็กเกจทุกครั้งที่เปิด
  แล้วลง `requirements.txt` และชุดจดจำใบหน้าให้เองเมื่อแพ็กเกจไม่ตรง ส่วน venv และ torch ต้องสร้างและลงเองตามสองบรรทัดแรก
- อย่าใช้ onnxruntime-gpu รุ่น 1.27 ขึ้นไป รุ่นเหล่านั้นสร้างมาสำหรับ CUDA 13 และใช้คู่กับ torch cu128 ไม่ได้
- ถ้าลงชุดจดจำใบหน้าไม่สำเร็จ yolo-backend ยังเปิดได้ แต่จะไม่ขึ้นชื่อคน และวัดระยะจอและความล้าไม่ได้
- InsightFace ดาวน์โหลดไฟล์โมเดล `buffalo_l` ไปที่ `%USERPROFILE%\.insightface` ตอนใช้ครั้งแรก ครั้งแรกจึงต้องมีอินเทอร์เน็ต
- frontend เรียก yolo-backend ผ่าน `/yolo/...` แล้ว Vite ส่งต่อไปที่ `127.0.0.1:8000` (`frontend/vite.config.ts`)
- ข้อมูลเก็บที่ `yolo-backend/data/` ดูรายการไฟล์ในหัวข้อ "ระบบ YOLOv8"
- ถ้าเคยใช้โปรเจกต์รุ่นเก่าที่มีโฟลเดอร์ `vision_service\` โค้ดในนั้นย้ายมาอยู่ที่ `yolo-backend\` แล้ว
  หลัง `git pull` โฟลเดอร์ `vision_service\` ยังค้างอยู่เพราะมี `.venv` ที่ git ไม่ได้เก็บ ลบทิ้งได้เลย
  รวมถึง `node_modules\` ที่ root ซึ่งเหลือจากรุ่นที่ frontend ยังอยู่ที่ root
  อย่าย้าย `vision_service\.venv` มาใช้ เพราะ venv บน Windows ผูกกับ path เดิม ให้สร้าง `yolo-backend\.venv` ใหม่ตามขั้นตอนด้านบน

### เปิดทั้งหมดพร้อมกัน

```bat
scripts\dev.bat
```

`scripts\dev.bat` (Windows) ตรวจทีละตัวแล้วเปิด camwell-backend, yolo-backend และ frontend คนละหน้าต่าง จากนั้นสรุปผลรายตัว

- ถ้าพอร์ตของตัวใดถูกใช้อยู่แล้ว dev.bat จะไม่เปิดตัวนั้นซ้ำ
- ปัญหาที่ซ่อมเองได้ dev.bat ซ่อมให้ด้วย `npm ci` หรือ `pip install` ถ้าซ่อมไม่ได้จะข้ามตัวนั้นแล้วบอกวิธีแก้
- หน้าต่างของ frontend เปิดเบราว์เซอร์ไปที่ `http://localhost:5173` ให้เอง

อีกทางคือรัน `npm run dev:all` ที่ root เพื่อเปิดทุกตัวใน terminal เดียว คำสั่งนี้ข้าม yolo-backend ถ้ายังไม่มี `yolo-backend\.venv`
และถ้าตัวใดหยุด ตัวอื่นจะหยุดตาม

## หน้าที่เปิดได้

จากหน้าแรก (`/`) กด "เข้าสู่ระบบ" เพื่อไปหน้าเลือกระบบ (`/?systems`) แล้วเลือก YOLOv8 หรือ MediaPipe
ทุกลิงก์เข้าแอปบนหน้าแรกพาไปหน้าเลือกระบบ

| URL | หน้า |
|---|---|
| `/` | หน้าแรกก่อนเข้าระบบ อธิบายว่ากล้องดูอะไร เตือนเมื่อไร และเรื่องความเป็นส่วนตัว หน้านี้ไม่โหลดกล้องหรือโมเดล |
| `/?systems` | เลือกระบบตรวจจับระหว่าง YOLOv8 (แนะนำ) กับ MediaPipe พร้อมรายชื่อโมเดลที่แต่ละระบบใช้ |
| **ระบบ YOLOv8** | |
| `/?yolo-dashboard` | ภาพรวมห้อง หน้าอื่นของระบบอยู่ที่ `?yolo-dashboard=<หน้า>` ดูหัวข้อ "ระบบ YOLOv8" |
| `/?yolo-console` | YOLO Console สำหรับนักพัฒนา |
| **ระบบ MediaPipe** | |
| `/?dashboard` | ภาพรวมห้อง วาดผังห้องจากกล้องแต่ละตัวพร้อมตารางคนในห้อง กล้องทำงานเบื้องหลัง ติ๊กช่องเพื่อดูภาพ |
| `/?camera` | ตั้งค่ากล้อง มีภาพกล้อง แผงปรับเกณฑ์ และประวัติแจ้งเตือน ใช้โมเดล `lite` และโครงร่างแบบ `basic` เสมอ |
| `/?gait` | ท่ายืนหน้าตรง ท่ายืนด้านข้าง ทดสอบ Romberg และวิเคราะห์ท่าเดิน |
| `/?people` | รายชื่อคนที่ลงทะเบียนใบหน้าใน camwell-backend หน้านี้ไม่โหลดกล้องหรือโมเดล |
| `/?alerts` | ประวัติแจ้งเตือนจาก camwell-backend กรองตามคน (`?alerts&employee=<id>`) และหมวดได้ ส่งออก CSV ได้ |
| `/?report` | รายงานประจำวันจาก camwell-backend แสดงความเสี่ยง Office Syndrome รายคน |
| `/?console` | Dev Console ใช้ state และ logic ชุดเดียวกับหน้ากล้อง แต่จัดหน้าใหม่และเพิ่มเครื่องมือสำหรับนักพัฒนา |

ทุกหน้าใช้ธีม "ซองยาประจำออฟฟิศ" มีโหมดสว่างและมืด เริ่มตามการตั้งค่าของ OS จนกว่าผู้ใช้จะกดสลับ
รายละเอียดของระบบดีไซน์อยู่ใน `DESIGN.md`

## ระบบ YOLOv8

### หน้าของเจ้าหน้าที่ (`/?yolo-dashboard`)

แถบเมนูด้านบนมี 7 หน้า การเปลี่ยนหน้าไม่โหลดหน้าเว็บใหม่ WebSocket และกล้องที่กำลังส่งภาพจึงทำงานต่อ
เมื่อมีคนล้ม แถบแดงพร้อมเสียงเตือนจะขึ้นบนสุดของทุกหน้า จนกว่าจะกด "รับทราบเหตุการณ์"

| เมนู | URL | เนื้อหา |
|---|---|---|
| ภาพรวม | `?yolo-dashboard` | ผังห้องพร้อมคนในห้อง ตารางคนในห้องนี้ และส่วน "ภาพจากกล้อง" ที่เลือกแหล่งภาพได้ คือ ไฟล์วิดีโอ, ไฟล์รูปภาพ, กล้อง browser, go2rtc และ Simulator เมื่อเข้าหน้านี้ ระบบเปิดกล้อง browser ให้เอง ยกเว้นตอนที่กำลังวิเคราะห์แหล่งอื่นอยู่ |
| เกณฑ์แจ้งเตือน | `?yolo-dashboard=camera` | เปิด ปิด และปรับเกณฑ์ของแต่ละหมวด มีโหมดทดสอบที่ย่นเวลาให้สั้นลง |
| พื้นห้องและโซน | `?yolo-dashboard=floor` | วางมุมพื้นบนภาพจากกล้องเพื่อแปลงตำแหน่งเป็นเมตร แล้วแบ่งโซน |
| รายชื่อบุคคล | `?yolo-dashboard=people` | ลงทะเบียนใบหน้าจากไฟล์หรือกล้องหลังติ๊กความยินยอม ลบรูปหรือลบคน ปรับเกณฑ์จับคู่ใบหน้า และดูคู่ที่หน้าคล้ายกัน |
| ประวัติแจ้งเตือน | `?yolo-dashboard=alerts` | กรองตามช่วงวัน คน และหมวด ส่งออก CSV ได้ |
| รายงานประจำวัน | `?yolo-dashboard=report` | ความเสี่ยง Office Syndrome รายคน กราฟรายชั่วโมง และการ์ดรายคนที่บันทึกเป็น PNG หรือคัดลอกได้ ส่งออก CSV หรือ JSON และพิมพ์ได้ |
| สถิติการใช้ห้อง | `?yolo-dashboard=rooms` | สรุปทุกรอบที่วิเคราะห์จบแล้ว ได้แก่ จำนวนคน ช่วงที่คนเยอะที่สุด เวลาในแต่ละท่าทาง และเวลาในแต่ละโซน |

ค่าเริ่มต้นของเกณฑ์อยู่ใน `yolo-backend/wellness.py` และปรับได้ที่หน้าเกณฑ์แจ้งเตือน

| หมวด | เตือนเมื่อ |
|---|---|
| ท่านั่ง | นั่งท่าไม่ดีต่อเนื่อง 30 วินาที |
| ระยะห่างจอ | หน้าใหญ่กว่าขนาดปกติ 1.25 เท่า ต่อเนื่อง 30 วินาที ระบบเรียนรู้ขนาดหน้าปกติจากเวลานั่ง 120 วินาที |
| นั่งนาน | นั่งต่อเนื่อง 45 นาที การลุกหรือออกไปนาน 60 วินาทีนับเป็นการพักและเริ่มนับใหม่ |
| ความเหนื่อยล้า | หลับตา 2 วินาที หรือหาว 3 ครั้งใน 10 นาที |
| หกล้ม | ลำตัวร่วงลง 30% ของความสูงตัวภายใน 1 วินาที แล้วเอียงจากแนวตั้ง 60° ขึ้นไป |

ข้อมูลของระบบนี้อยู่ใน `yolo-backend/data/`

| ไฟล์หรือโฟลเดอร์ | เก็บอะไร |
|---|---|
| `settings.json` | พื้นและโซน |
| `wellness_settings.json` | เกณฑ์แจ้งเตือน |
| `wellness_baselines.json` | ขนาดหน้าปกติที่ระบบเรียนรู้ไว้ |
| `face_settings.json` | เกณฑ์จับคู่ใบหน้า |
| `faces/<ชื่อ>/` | รูปที่ลงทะเบียน |
| `alerts/` | แจ้งเตือนและการอยู่หน้ากล้อง แยกไฟล์ละวัน |
| `reports/` | รายงานของแต่ละรอบ |
| `uploads/` | ไฟล์ที่อัปโหลด |

### YOLO Console (`/?yolo-console`)

หน้าสำหรับนักพัฒนา เข้าจากปุ่ม "Console" บนแถบเมนูของ `?yolo-dashboard`
ปุ่ม "← Back to Dashboard" พากลับไป `?yolo-dashboard` โดยไม่หยุดการวิเคราะห์
ปุ่ม Engine (MediaPipe, YOLO) ใน sidebar สลับไป Dev Console ของ MediaPipe ได้ การสลับจะหยุด session ของ YOLO ก่อนแล้วเปลี่ยนทั้งหน้า

เมนูด้านซ้ายมี 6 หน้า

- **หน้าหลัก**
  - เลือกแหล่งภาพได้จากไฟล์วิดีโอ, ไฟล์รูปภาพ, กล้อง browser, go2rtc หรือ Simulator
  - ภาพสดแสดงกรอบคนพร้อมชื่อจากใบหน้า (มี ⚠ เมื่อมีการเตือน) กรอบสิ่งของ และเส้นทางเดิน
  - แผง "คนในห้องนี้" แสดงท่านั่ง ระยะจอ เวลานั่ง ความล้า และการล้ม พร้อมเสียงเตือน และมีปุ่มรับทราบเมื่อมีคนล้ม
  - แผงสถิติ, heatmap และผังพื้น
  - ปุ่มหยุดชั่วคราว เลื่อนคลิป จบ และเริ่มใหม่
- **ตั้งค่า**
  - calibrate พื้นด้วยการลากมุมทั้ง 4 (คลิกบนเส้นกรอบเพื่อเพิ่มจุด) แล้วแบ่งโซน บันทึกลง `yolo-backend/data/settings.json`
  - ปรับเกณฑ์แจ้งเตือนแต่ละหมวดและโหมดทดสอบ บันทึกลง `yolo-backend/data/wellness_settings.json`
- **ใบหน้า** ลงทะเบียนคนจากไฟล์รูปหรือถ่ายจากกล้อง browser หลังติ๊กความยินยอมตาม PDPA ปรับเกณฑ์จับคู่ และดูคู่ที่หน้าคล้ายกัน
  รูปเก็บที่ `yolo-backend/data/faces/<ชื่อ>/`
- **ประวัติการแจ้งเตือน** กรองตามวัน คน และหมวด ส่งออก CSV ได้
- **รายงานประจำวัน** ความเสี่ยง Office Syndrome รายคน กราฟรายชั่วโมง และการ์ดรายคนที่บันทึกเป็น PNG หรือคัดลอกได้
  ส่งออก CSV หรือ JSON และพิมพ์ได้
- **รายงาน** รายงานของทุก session ที่จบแล้ว และดาวน์โหลด `tracks.csv` ได้

## ระบบ MediaPipe

### ฟีเจอร์

1. **ท่านั่ง** ตรวจการก้มคอหรือยื่นคอ หลังค่อมหรือโน้มตัว และการนั่งเอียงข้าง ด้วย MediaPipe Pose Landmarker
   ปุ่ม "Calibrate ท่านั่ง" ให้นั่งท่าดี 3 วินาที แล้วเก็บเป็น baseline ของกล้องตัวนั้น
2. **หกล้มหรือตกจากเก้าอี้** ตรวจลำตัวที่ร่วงเร็วแล้วเอียงใกล้แนวนอน หรือร่วงเร็วแล้วหายจากเฟรม แจ้งทันทีโดยไม่ต้องรอสะสมเวลา
3. **ความเหนื่อยล้า** ตรวจการหลับตานาน (Eye Aspect Ratio) และการหาวถี่ผิดปกติ (Mouth Aspect Ratio) ด้วย @vladmandic/face-api
4. **ระยะห่างจากจอ** เตือนเมื่อนั่งใกล้จอกว่าค่าที่ calibrate ไว้
5. **เตือนพัก** เตือนเมื่อนั่งต่อเนื่องนานเกินไปโดยไม่ลุก ตัวจับเวลาแยกต่อกล้อง และไม่เกี่ยวกับว่าท่านั่งถูกหรือผิด
6. **ระบุตัวตนจากใบหน้า** ลงทะเบียนและจับคู่ใบหน้าผ่าน camwell-backend
   ช่อง "ลงทะเบียนใบหน้าที่ไม่รู้จักอัตโนมัติ" เปิดอยู่เป็นค่าเริ่มต้น เมื่อเจอใบหน้าที่ไม่ตรงกับใคร camwell-backend
   จะลงทะเบียนเป็น "คนที่ N" ทันทีโดยยังไม่มีความยินยอม แล้วค่อยเปลี่ยนชื่อภายหลัง อ่านเรื่อง PDPA ด้านล่างก่อนใช้
7. **หลายกล้องและหลายคน** ต่อกล้องพร้อมกันได้สูงสุด 2 ตัว (กล้องในเครื่อง, USB หรือกล้อง IP แบบ MJPEG)
   และเลือกโหมด Workstation (1 คน), Multi-person (สูงสุด 4 คนต่อกล้อง) หรือไม่จำกัด (MediaPipe รับได้สูงสุด 20 คน ยิ่งคนเยอะยิ่งช้า)
   หน้าภาพรวมเริ่มที่ Multi-person ส่วนหน้ากล้องเริ่มที่ Workstation
8. **ท่ายืนและท่าเดิน** (`/?gait`) ท่ายืนหน้าตรง ท่ายืนด้านข้าง ทดสอบ Romberg (ลืมตาและหลับตาอย่างละ 10 วินาที)
   และวิเคราะห์ท่าเดิน (อัด 8 วินาที)
9. **ส่งเหตุการณ์ไป backend** frontend ส่งทุกการแจ้งเตือนไป camwell-backend (`POST /api/alerts`) ตอนเริ่มและตอนจบ
   และบันทึกการเข้า-ออกหน้ากล้องที่ `/api/presence` หน้าประวัติแจ้งเตือนและรายงานประจำวันอ่านข้อมูลจากสองที่นี้
10. **Dev Console** (`/?console`) หน้าผู้ดูแลระบบสำหรับดูสถานะ ปรับเกณฑ์ และเก็บ dataset ดูหัวข้อถัดไป

ฟีเจอร์ที่ใช้ใบหน้า (ข้อ 3, 4 และ 6) เปิดอยู่เป็นค่าเริ่มต้น (`DEFAULT_FACE_FEATURES_ENABLED` ใน `frontend/src/lib/featureVisibility.ts`)
ปิดได้ที่ช่อง "ฟีเจอร์ใบหน้า" บน header ของ Dev Console หรือช่อง "เปิดใช้ความเหนื่อยล้า, ระยะห่างจากจอ และการระบุตัวตน" ในแผงตั้งค่าของหน้ากล้อง

### Dev Console (`/?console`)

ตอนนี้ทุก build เปิดหน้านี้ได้ เพราะยังอยู่ช่วงพัฒนาและจะกำหนดสิทธิ์ภายหลัง
เข้าจากปุ่ม "Console" บนแถบเมนูของระบบ MediaPipe ปุ่ม "← Back to Dashboard" พากลับไป `?dashboard`

- Sidebar มีปุ่มสลับ Engine (MediaPipe, YOLO), เมนู 4 หน้า และสถานะของ Pose Landmarker, face-api, camwell-backend และ error ของกล้องแต่ละตัว
- Header มีตัวเลือกโหมด (Workstation, Multi, ไม่จำกัด), รุ่นโมเดล Pose (lite, full, heavy), โครงร่าง (basic, full), เสียงแจ้งเตือน,
  ฟีเจอร์ใบหน้า, Dataset Recorder และสถานะ backend ที่ตรวจ `/health` ทุก 10 วินาที

เมนูทั้ง 4 หน้า

- **Monitor** แถบสถิติ (เวลา Pose inference เป็น ms แบบ EMA, จำนวนคนที่ติดตาม, แจ้งเตือนที่ยัง active)
  การ์ดกล้อง (ชิป GPU หรือ CPU, ms, จำนวนคน, สถานะ baseline, ปุ่มเปลี่ยนแหล่งภาพ) และแจ้งเตือนล่าสุด
  จอที่กว้างตั้งแต่ 1700px ขึ้นไปจะแสดงการ์ดเกณฑ์การตรวจจับทางขวาด้วย
- **Thresholds** slider ของทุกเกณฑ์ (ท่านั่ง หกล้ม ความเหนื่อยล้า ระยะห่างจอ เตือนพัก) บอกว่าค่าไหนต่างจากค่าเริ่มต้น และมีปุ่มคืนค่าทั้งหมด
- **Events** กรองตามหมวดหรือเฉพาะที่ยัง active และ Export JSON ได้
- **People** รายชื่อพนักงานที่ลงทะเบียนใน camwell-backend และลบข้อมูลได้

การสลับเมนูแค่ซ่อนกล้องไว้โดยไม่ unmount จึงไม่ต้องโหลดกล้องและโมเดลใหม่

#### เลือกรุ่นโมเดล Pose (lite, full, heavy)

ทุกรุ่นให้ landmark 33 จุดในรูปแบบเดียวกัน ต่างกันที่ความแม่นยำและความเร็ว ดูค่า ms ในแถบสถิติเพื่อเทียบบนเครื่องจริง
ระบบจำกัดไว้ที่ 12 fps ต่อกล้อง จึงมีเวลาประมาณ 83 ms ต่อรอบ

| รุ่น | ไฟล์ | ขนาดประมาณ |
|---|---|---|
| lite (ค่าเริ่มต้น) | `pose_landmarker_lite.task` | 5.5 MB |
| full | `pose_landmarker_full.task` | 9 MB |
| heavy | `pose_landmarker_heavy.task` | 29 MB |

- เปลี่ยนรุ่นแล้วทุกกล้องจะโหลดโมเดลใหม่ ควร Calibrate ท่านั่งใหม่ เพราะมุมที่แต่ละรุ่นวัดได้ต่างกันเล็กน้อย
- เปลี่ยนรุ่นระหว่างบันทึก dataset ไม่ได้

#### โครงร่าง (basic, full)

- basic (ค่าเริ่มต้น) วาดโครงร่างช่วงบน 10 เส้น (ไหล่ แขน ลำตัว หู-ไหล่) จากทุกจุดที่โมเดลส่งมา
- full วาดครบ 35 เส้นตาม BlazePose (หน้า แขน มือ ลำตัว ขา) เฉพาะจุดที่ visibility ไม่ต่ำกว่า `minVisibility` (0.5)
  และวาดเส้นสีเหลืองสองเส้น คือเส้นคอ (กึ่งกลางไหล่ถึงกึ่งกลางหูหรือจมูก) และกระดูกสันหลัง (กึ่งกลางสะโพกถึงกึ่งกลางไหล่)
  ซึ่งเป็นเส้นเดียวกับที่ใช้วัด `neckAngleDeg` และ `torsoAngleDeg` จริง
  ถ้ากล้องเห็นแค่ช่วงบน โปรแกรมจะไม่วาดแขนหรือสะโพกที่มองไม่ชัด

โครงร่างมีผลแค่การแสดงผล ไม่มีผลกับการตรวจจับ

#### Dataset Recorder

เก็บตัวเลข landmark และ feature โดยไม่เก็บภาพ เพื่อใช้ปรับจูนเกณฑ์ท่านั่ง
เปิดจากช่อง "Dataset Recorder" บน header แล้วแผงจะอยู่ในหน้า Monitor หน้ากล้อง (`/?camera`) ก็มีแผงแบบง่าย แต่แสดงเฉพาะตอนรัน dev

- เลือกกล้องและ label (`GOOD`, `FORWARD_HEAD`, `SLOUCH`, `LEAN_LEFT`, `LEAN_RIGHT`) กดเริ่มและหยุดบันทึก แล้ว Export JSON
- เก็บเฉพาะเฟรมที่มีคนเดียว ประมาณ 12 sample ต่อวินาที เป็นค่าดิบก่อน smoothing
- ระหว่างบันทึก ภาพของกล้องที่กำลังบันทึกจะมี `● REC` และค่า 4 feature ซ้อนอยู่
- dataset หนึ่งชุดใช้ได้กับรุ่นโมเดลเดียว ระบบล็อกรุ่นตาม sample แรก ถ้ารุ่นไม่ตรงจะเริ่มบันทึกไม่ได้จนกว่าจะ Export แล้วล้างข้อมูล
- ไฟล์ export มี `meta.schemaVersion`, `exportedAt`, `poseModel`, `thresholdsAtExport` และ `samples[]`
  แต่ละ sample มี `cameraId`, `label`, มุมต่างๆ, `quality`, `landmarks` และ `worldLandmarks` 33 จุดพร้อม `visibility` และ `minVisibility`

ข้อควรระวัง

- แท็บเก็บข้อมูลไว้ในหน่วยความจำเท่านั้น **รีเฟรชหรือปิดแท็บแล้วข้อมูลหาย ต้อง Export ก่อน**
  หน่วยความจำจะเพิ่มขึ้นเรื่อยๆ ระหว่างบันทึก จึงควรอัดเป็นช่วงแล้ว Export ทีละช่วง
- CameraStage เก็บ sample เฉพาะตอนรัน dev (`import.meta.env.DEV`) production build จะไม่เก็บ
- การบันทึกไม่มีผลกับการตรวจจับและการแจ้งเตือน การแจ้งเตือนยังทำงานระหว่างอัด ปิดเสียงได้ถ้ารบกวน

แนวทางเก็บข้อมูลให้ใช้งานได้

- อัด `GOOD` ก่อนทุกรอบ เพื่อใช้เป็น baseline ตอนวิเคราะห์
- อัดท่าละ 30 ถึง 60 วินาทีต่อเนื่อง ให้ครบทุก label
- เก็บจากหลายคนและหลายวัน ดีกว่าอัดคนเดียวนานๆ
- ห้ามย้ายกล้องหรือเปลี่ยนรุ่นโมเดลกลางคัน

### วิธีทำงานของแต่ละฟีเจอร์

#### ท่านั่ง หกล้ม และเตือนพัก (PostureEngine)

1. `usePoseLandmarker` โหลดโมเดล BlazePose (33 keypoints) รุ่นที่เลือกจากไฟล์ในเครื่อง ใช้ GPU delegate และเปลี่ยนไปใช้ CPU ถ้า GPU ใช้ไม่ได้
2. `lib/poseThrottle.ts` จำกัดการรันโมเดลไว้ที่ 12 fps ต่อกล้อง และรันเฉพาะเมื่อเฟรมวิดีโอเปลี่ยนจริง
3. `lib/postureEngine.ts` (หนึ่ง instance ต่อกล้อง) ทำขั้นตอนเหล่านี้ทุกเฟรม
   - `lib/tracker.ts` จับคู่คนข้ามเฟรมให้มี trackId คงที่
   - `lib/postureAnalysis.ts` คำนวณมุมคอ มุมลำตัว มุมเอียงไหล่ และ `headHeightRatio` โดยข้ามจุดที่ visibility ต่ำกว่า `minVisibility`
     และแยกระหว่าง `full_body` กับ `upper_body`
   - `lib/smoothing.ts` ทำค่าให้นิ่งด้วย EMA แล้ว `classifyPosture` จัดท่าเป็น forward_head, slouching, leaning หรือ good
     ถ้า Calibrate แล้ว จะตัดสินจากส่วนต่างเทียบกับ baseline ของกล้องนั้นและสัดส่วนหัวที่ต่ำลง
   - `lib/fallDetection.ts` ตรวจการร่วงตัวเร็วและการหายจากเฟรม
   - `lib/breakReminder.ts` จับเวลานั่งต่อเนื่อง
4. `services/postureBaselineStore.ts` เก็บ baseline ท่านั่งใน localStorage แยกต่อกล้อง (key `camwell:posture-baseline:v1:<cameraId>`)

#### ความเหนื่อยล้า ระยะห่างจอ และการระบุตัวตน

1. `useFaceApiModels` โหลดโมเดล TinyFaceDetector, FaceLandmark68 และ FaceRecognition จากไฟล์ในเครื่อง
2. CameraStage ตรวจใบหน้าทุก 400 ms (ไม่ใช่ทุกเฟรม) แล้วจับคู่ใบหน้ากับคนจาก pose ที่อยู่ใกล้ที่สุด
3. `lib/fatigueAnalysis.ts` คำนวณ EAR (ตาหลับ) และ MAR (อ้าปากหรือหาว) จาก landmark ใบหน้า 68 จุด
4. `lib/distanceAnalysis.ts` เทียบขนาดกรอบใบหน้ากับ baseline ที่ calibrate ไว้
5. `services/faceEnrollment.ts` ส่ง descriptor 128 มิติไปให้ camwell-backend จับคู่ และตรวจซ้ำทุก 3 วินาทีต่อคน
   เบราว์เซอร์ไม่เก็บ descriptor ของใครไว้เลย

#### กลไกแจ้งเตือนกลาง

`lib/sustainedAlertMachine.ts` เป็น state machine กลางของท่านั่ง ความเหนื่อยล้า และระยะห่างจอ
ปัญหาต้องเกิดต่อเนื่องนานเกินเกณฑ์ก่อนจึงจะแจ้งเตือนจริง และต้องกลับเป็นปกติสักพักก่อนจึงจะเคลียร์ (hysteresis) เพื่อกันการกระพริบ
การหกล้มไม่ผ่าน state machine นี้ แต่แจ้งทันที (edge-triggered) ส่วนเตือนพักใช้ตัวจับเวลา
ทุกเหตุการณ์ใช้โครงสร้าง `AlertEvent` เดียวกัน (`types/alerts.ts`)

การแจ้งเตือนแสดงเป็นกรอบหรือ banner สีแดงบนภาพกล้อง, banner หกล้มและเตือนพัก, เสียง (ปิดได้) และแถวในตารางเหตุการณ์
`backendAlertReporter` (`services/alertReporter.ts`) ส่งเหตุการณ์ไปเก็บที่ camwell-backend ตอนเริ่มและตอนจบ

## โครงสร้างโค้ดที่สำคัญ

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
  components/SettingsPanel.tsx    ปรับเกณฑ์ (หน้ากล้อง)
  components/EnrollmentPanel.tsx  รายชื่อที่ลงทะเบียนใบหน้าและลบ (หน้ากล้อง)
  components/AttendancePanel.tsx  การเข้า-ออกหน้ากล้องล่าสุด (หน้ากล้อง เมื่อเปิดฟีเจอร์ใบหน้า)
  components/EventLog.tsx         ตารางประวัติการแจ้งเตือน (หน้ากล้อง)
  components/DatasetRecorderPanel.tsx  แผงบันทึก dataset แบบง่าย (หน้ากล้อง)
  console/                        Dev Console (DevConsole, EngineSwitch, MonitorTab, RecorderPanel, ThresholdsTab,
                                  EventsTab, PeopleTab, useBackendHealth, format, console.css)
  hooks/usePoseLandmarker.ts      โหลด MediaPipe Pose Landmarker (เลือกรุ่น lite, full, heavy และรายงาน GPU หรือ CPU)
  hooks/useFaceApiModels.ts       โหลดโมเดลของ face-api
  hooks/useCameraDevices.ts       รายชื่อกล้องในเครื่อง
  hooks/usePersistentState.ts     state ที่จำค่าใน localStorage
  hooks/useTheme.ts               ธีมสว่างและมืด (camwell:theme)
  lib/postureEngine.ts            pipeline ต่อเฟรมของกล้อง 1 ตัว (tracker, posture, fall, break)
  lib/postureAnalysis.ts          คำนวณมุมท่านั่งและจัดท่า
  lib/postureCalibration.ts       คำนวณ baseline จากช่วง Calibrate
  lib/standingPostureAnalysis.ts  ท่ายืน (หน้า ?gait)
  lib/gaitAnalysis.ts, multiPersonGait.ts  ท่าเดินและ Romberg (หน้า ?gait)
  lib/smoothing.ts                EMA ของ feature
  lib/tracker.ts                  จับคู่คนข้ามเฟรม
  lib/fallDetection.ts            ตรวจการหกล้ม
  lib/breakReminder.ts            ตัวจับเวลานั่งต่อเนื่อง
  lib/fatigueAnalysis.ts          EAR และ MAR (ง่วงและหาว)
  lib/distanceAnalysis.ts         ระยะห่างจอ
  lib/sustainedAlertMachine.ts    state machine แจ้งเตือนกลาง
  lib/poseThrottle.ts             จำกัด 12 fps
  lib/skeletonOverlay.ts          เส้นโครงร่าง basic และ full (แสดงผลอย่างเดียว)
  lib/datasetJson.ts              รูปแบบไฟล์ dataset ที่ export
  lib/multiPerson.ts              โหมด workstation, multi, unlimited
  services/alertReporter.ts       ส่งเหตุการณ์แจ้งเตือนไป camwell-backend
  services/alertHistory.ts        อ่านประวัติแจ้งเตือนจาก camwell-backend (?alerts)
  services/presence.ts            บันทึกและอ่านการเข้า-ออกหน้ากล้อง
  services/dailyReport.ts         รายงานประจำวันจาก camwell-backend (?report)
  services/faceEnrollment.ts      ลงทะเบียน ลบ และจับคู่ใบหน้าผ่าน backend
  services/datasetRecorder.ts     เก็บ sample dataset (เลือกกล้อง, ล็อกรุ่นโมเดล)
  services/postureBaselineStore.ts baseline ท่านั่งต่อกล้อง (localStorage)
  services/apiConfig.ts           API_BASE_URL และ fetch helper
  services/beep.ts                เสียงแจ้งเตือน (Web Audio API)
  types/                          alerts, posture, fall, wellbeing, identity, person, cameraSource
  yoloConsole/                    YOLO Console (?yolo-console) และโมดูลที่ระบบ YOLOv8 ใช้ร่วม: yoloService (REST และ WebSocket ไป yolo-backend),
                                  useYoloLive, store, types, wellness, drawLive, คณิตศาสตร์พื้นห้อง (homography, floorCalibration, zoneLayout)
  yoloDashboard/                  หน้าของเจ้าหน้าที่ระบบ YOLOv8 (?yolo-dashboard) 7 หน้า, แถบเมนู YoloNav และ CSS ของตัวเอง (yd-*)
backend/                          camwell-backend (Express, SQLite ที่ data/camwell.sqlite): employees, alerts, presence, reports
yolo-backend/                     FastAPI (app/main.py), YOLOv8 และ ByteTrack (room_analytics.py), จำหน้า (face_id.py),
                                  แจ้งเตือนสุขภาพ (wellness.py), ข้อมูลใน data/
scripts/                          dev.bat และ dev-windows.mjs (เปิด dev server คนละหน้าต่าง), dev-all.mjs (npm run dev:all)
DESIGN.md, PRODUCT.md             ระบบดีไซน์ "ซองยาประจำออฟฟิศ" และบริบทของผลิตภัณฑ์
```

## ข้อจำกัดที่ควรรู้

- ในระบบ MediaPipe กล้อง IP ที่อยู่ต่าง origin (CORS) แสดงภาพได้ แต่ AI อ่านพิกเซลไม่ได้เพราะ canvas ถูก taint จึงต้องมีตัวกลางแปลงสตรีม
  เบราว์เซอร์เปิดกล้อง RTSP ตรงๆ ไม่ได้ แต่ระบบ YOLOv8 อ่าน RTSP ผ่าน go2rtc ได้
- กล้องที่หันหน้าตรงเข้าหาคนมองการยื่นคอและหลังค่อมได้จำกัด เพราะท่าทั้งสองเป็นการเคลื่อนเข้าหากล้อง เกณฑ์ปัจจุบันยังต้องปรับจูนจาก dataset จริง
- หน้าเว็บยังไม่มีที่ปรับ `minVisibility` (0.5) ค่านี้มีผลกับการคำนวณมุม dataset และโครงร่างแบบ full
- ระบบ MediaPipe ตรวจจับเฉพาะตอนเปิดหน้าค้างไว้ ปิดแท็บแล้วการตรวจจับหยุด

## ข้อควรระวังเรื่อง Face Recognition และ PDPA

ฟีเจอร์ระบุตัวตนพนักงานใช้ข้อมูลใบหน้า ได้แก่ face descriptor (embedding) และรูปที่ลงทะเบียน
ข้อมูลเหล่านี้เป็นข้อมูลชีวภาพ (biometric data) ซึ่งเป็นข้อมูลส่วนบุคคลที่มีความอ่อนไหวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ของไทย
ก่อนใช้งานจริงกับพนักงานต้อง

1. ขอความยินยอมจากพนักงานอย่างชัดเจนก่อนลงทะเบียนใบหน้า
   การลงทะเบียนด้วยมือในทั้งสองระบบบังคับให้ติ๊กยืนยันก่อน และ `POST /api/employees` ของ camwell-backend ปฏิเสธคำขอที่ไม่มี `consentGiven: true`
   แต่การลงทะเบียนอัตโนมัติของระบบ MediaPipe (`POST /api/employees/identify` ที่ส่ง `autoEnroll: true`) เก็บใบหน้าโดยยังไม่มีความยินยอม
   และเปิดอยู่เป็นค่าเริ่มต้น ปิดได้ที่ช่อง "ลงทะเบียนใบหน้าที่ไม่รู้จักอัตโนมัติ" ในแผงตั้งค่าของหน้ากล้อง
2. แจ้งวัตถุประสงค์การใช้ข้อมูลให้ชัดเจน และเก็บเท่าที่จำเป็น
3. ให้พนักงานขอลบข้อมูลของตัวเองได้ตลอดเวลา ระบบ MediaPipe ลบได้ที่ `/?people`, แผงรายชื่อในหน้ากล้อง และเมนู People ใน Dev Console
   ระบบ YOLOv8 ลบได้ที่ `/?yolo-dashboard=people` และเมนู "ใบหน้า" ใน YOLO Console

ระบบ MediaPipe เก็บ descriptor ไว้ที่ camwell-backend (SQLite) เท่านั้น และไม่ส่งกลับมาที่เบราว์เซอร์หลังลงทะเบียน
ระบบ YOLOv8 เก็บรูปที่ลงทะเบียนไว้ที่ `yolo-backend/data/faces/<ชื่อ>/` บนเครื่องที่รัน yolo-backend

ระบบนี้ยังไม่ผ่านกระบวนการขอความยินยอมที่ถูกต้องตามกฎหมายครบทุกขั้นตอน **ปรึกษาฝ่ายกฎหมายหรือ HR ก่อนใช้งานจริง**
ถ้ายังไม่พร้อม ปิดฟีเจอร์ใบหน้าได้ ระบบ MediaPipe ปิดที่ช่อง "ฟีเจอร์ใบหน้า" ระบบ YOLOv8 ปิดด้วย `FACE_ENGINE=off` ตอนเปิด yolo-backend

## ข้อควรทราบเรื่องโมเดล AI และ license

ระบบ MediaPipe ใช้เฉพาะโมเดลที่ license เป็น Apache 2.0 (MediaPipe) หรือ MIT (face-api) ซึ่งใช้ในซอฟต์แวร์เชิงพาณิชย์แบบปิดได้
เลือกรุ่น Pose ได้ใน Dev Console ส่วนหน้ากล้องใช้ `lite` เสมอ รายชื่อรุ่นอยู่ที่ `POSE_MODELS` ใน `frontend/src/hooks/usePoseLandmarker.ts`
และต้องตรงกับรายการใน `frontend/scripts/setup-assets.mjs`

ระบบ YOLOv8 ต้องตรวจ license ก่อนใช้เชิงพาณิชย์

- `ultralytics` (YOLOv8) เป็น AGPL-3.0 ซอฟต์แวร์ปิดต้องซื้อ Enterprise License จาก Ultralytics
- โมเดลใบหน้า InsightFace `buffalo_l` ใช้ได้เฉพาะงานวิจัยที่ไม่ใช่เชิงพาณิชย์ (ดู docstring ใน `yolo-backend/face_id.py`)
  ทางเลือกคือ YuNet กับ SFace จาก OpenCV Model Zoo ซึ่ง license อนุญาตให้ใช้เชิงพาณิชย์
  ตั้ง `FACE_ENGINE=sface` แล้ววาง `face_detection_yunet_2023mar.onnx` และ `face_recognition_sface_2021dec.onnx` ไว้ใน `yolo-backend/`
- ค่าเริ่มต้น `FACE_ENGINE=auto` ใช้ InsightFace ถ้าติดตั้งไว้ ถ้าไม่ได้ติดตั้งจะใช้ SFace และถ้าไม่มีไฟล์ onnx สองไฟล์ข้างบน การจดจำใบหน้าจะปิด

## แผนถัดไป (ยังไม่ได้ทำ)

- เลือกระบบเดียว (YOLOv8 หรือ MediaPipe) หลังทดลองใช้จริง แล้วเอาอีกระบบออก
- แจ้งเตือนภายนอกผ่าน LINE Messaging API และ LINE Official Account (LINE Notify ปิดให้บริการไปแล้วตั้งแต่ 31 มี.ค. 2025)
- ปรับจูนเกณฑ์ท่านั่งจาก dataset จริงที่มีหลายคนและครบทุก label
- กำหนดสิทธิ์การเข้า Dev Console และ YOLO Console
- ส่งเหตุการณ์แบบ realtime ผ่าน WebSocket โครงของ `createWebSocketAlertReporter()` อยู่ใน `frontend/src/services/alertReporter.ts` แล้ว
