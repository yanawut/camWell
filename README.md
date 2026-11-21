# Camwell

Camwell ใช้กล้องตรวจท่านั่ง ระยะห่างจากจอ เวลานั่งต่อเนื่อง ความเหนื่อยล้า และการหกล้มของพนักงานออฟฟิศ
ระบบแจ้งเตือนเมื่อปัญหาเกิดต่อเนื่องนานพอ ส่วนการหกล้มแจ้งทันที

Camwell มีระบบตรวจจับให้เลือกสองระบบ ทั้งสองระบบใช้หน้าตาและเมนูชุดเดียวกัน แต่ประมวลผลคนละที่และเก็บข้อมูลแยกกัน

| ระบบ | ประมวลผลที่ | โมเดล | เก็บข้อมูลที่ |
|---|---|---|---|
| YOLOv8 (แนะนำ) | yolo-backend ซึ่งอ่านกล้องผ่าน go2rtc ได้เอง จึงไม่ต้องเปิดหน้าเว็บค้างไว้ | ท่าทางใช้ `yolov8m-pose.pt` (17 จุด) คนและสิ่งของใช้ `yolov8m.pt` กับ ByteTrack ใบหน้าใช้ InsightFace `buffalo_l` หรือ YuNet กับ SFace | `yolo-backend/data/` |
| MediaPipe | เบราว์เซอร์ของเครื่องที่เปิดหน้าไว้ | Pose Landmarker (33 จุด) และ @vladmandic/face-api | camwell-backend (SQLite) |

โปรเจกต์มีสามส่วน ทุกส่วนรันบนเครื่องในออฟฟิศ และไม่ส่งภาพหรือวิดีโอขึ้นคลาวด์

| ส่วน | โฟลเดอร์ | พอร์ต | หน้าที่ |
|---|---|---|---|
| frontend | `frontend/` | 5173 | หน้าเว็บของทั้งสองระบบ (React, Vite) |
| camwell-backend | `backend/` | 4000 | เก็บข้อมูลของระบบ MediaPipe (Express, SQLite) |
| yolo-backend | `yolo-backend/` | 8000 | ประมวลผลและเก็บข้อมูลของระบบ YOLOv8 (FastAPI, YOLOv8) |

## ติดตั้งแต่ละส่วน

ติดตั้งครบทั้งสามส่วนเพื่อใช้ได้ทั้งสองระบบ แต่ละส่วนติดตั้งครั้งเดียว
จากนั้นเปิดทุกส่วนพร้อมกันตามหัวข้อ "เปิดทุกส่วนพร้อมกัน"

### ติดตั้ง frontend

frontend ต้องใช้ Node.js 20.19 ขึ้นไปในรุ่น 20 หรือ 22.12 ขึ้นไป ตามที่ Vite 8 กำหนด

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

`npm install` รัน `frontend/scripts/setup-assets.mjs` ต่อให้เอง สคริปต์นี้เตรียมไฟล์ที่หน้าเว็บต้องใช้ตอนรันตามลำดับนี้

1. คัดลอก WASM runtime ของ MediaPipe ไปที่ `frontend/public/wasm`
2. ดาวน์โหลดโมเดล `pose_landmarker_{lite,full,heavy}.task` รวมประมาณ 44 MB จาก storage.googleapis.com ไปที่ `frontend/public/models`
3. ดาวน์โหลดโมเดลของ face-api จาก raw.githubusercontent.com ไปที่ `frontend/public/models/face-api`

สคริปต์ข้ามไฟล์ที่มีอยู่แล้ว ถ้าดาวน์โหลดไม่สำเร็จ ดูหัวข้อ "ดาวน์โหลดโมเดลของ frontend ไม่สำเร็จ" ด้านล่าง

frontend ส่งคำขอไป camwell-backend ที่ `http://localhost:4000`
ถ้า camwell-backend อยู่ที่อื่น ให้ตั้ง `VITE_API_BASE_URL` ใน `frontend/.env`

คำสั่งอื่นใน `frontend/` มีดังนี้

- `npm test` รันเทสต์ด้วย vitest
- `npm run lint` ตรวจโค้ดด้วย oxlint
- `npm run build` ตรวจ type ด้วย tsc แล้ว build ด้วย Vite

### ติดตั้ง camwell-backend

camwell-backend ต้องใช้ Node.js 22.5 ขึ้นไป เพราะใช้ `node:sqlite` ที่มากับ Node.js

```bash
cd backend
npm install
cp .env.example .env
npm run dev       # http://localhost:4000
```

`backend/.env` กำหนดพอร์ต ไฟล์ฐานข้อมูล และ origin ที่อนุญาต

| ตัวแปร | ค่าเริ่มต้น |
|---|---|
| `PORT` | `4000` |
| `DB_PATH` | `./data/camwell.sqlite` ซึ่งคือ `backend/data/camwell.sqlite` |
| `CORS_ORIGIN` | `http://localhost:5173` คั่นด้วยจุลภาคถ้ามีหลาย origin |

ถ้าไม่เปิด camwell-backend ระบบ MediaPipe ยังตรวจจับและเตือนบนจอได้ แต่จำหน้าไม่ได้
หน้ารายชื่อ หน้าประวัติแจ้งเตือน และหน้ารายงานประจำวันของระบบ MediaPipe ก็จะไม่มีข้อมูล
API และตารางในฐานข้อมูลอยู่ใน [คู่มือ camwell-backend](backend/README.md)

### ติดตั้ง yolo-backend

yolo-backend ต้องใช้ Python 3.12 และ torch รุ่น CUDA 12.8
ถ้าไม่เปิด yolo-backend ระบบ YOLOv8 ใช้ไม่ได้ทั้งระบบ
รันทุกคำสั่งในหัวข้อนี้ที่ root ของโปรเจกต์

ถ้าจะเปิดด้วย `scripts\dev.bat` ให้ทำแค่ข้อ 1 และข้อ 2
dev.bat ตรวจแพ็กเกจทุกครั้งที่เปิด แล้วลงข้อ 3 และข้อ 4 ให้เองเมื่อแพ็กเกจไม่ตรง

1. สร้าง venv

   ```bat
   py -3.12 -m venv yolo-backend\.venv
   ```

2. ลง torch และ torchvision จาก index ของ PyTorch แพ็กเกจสองตัวนี้จึงไม่อยู่ใน `requirements.txt`

   ```bat
   yolo-backend\.venv\Scripts\python.exe -m pip install torch==2.11.0+cu128 torchvision==0.26.0+cu128 --index-url https://download.pytorch.org/whl/cu128
   ```

3. ลงแพ็กเกจหลัก

   ```bat
   yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements.txt
   ```

4. ลงชุดจดจำใบหน้า
   ชุดนี้ไม่บังคับ ถ้าลงไม่สำเร็จ yolo-backend ยังเปิดได้ แต่จะไม่ขึ้นชื่อคน และวัดระยะห่างจากจอกับความเหนื่อยล้าไม่ได้
   insightface ลง onnxruntime รุ่น CPU มาด้วย คำสั่งที่สองและสามจึงถอดรุ่นนั้นออกแล้วลงรุ่น GPU ที่เข้ากับ torch cu128 แทน
   อย่าลง onnxruntime-gpu รุ่น 1.27 ขึ้นไป รุ่นเหล่านั้นสร้างมาสำหรับ CUDA 13 และใช้คู่กับ torch cu128 ไม่ได้

   ```bat
   yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements-face.txt
   yolo-backend\.venv\Scripts\python.exe -m pip uninstall -y onnxruntime onnxruntime-gpu
   yolo-backend\.venv\Scripts\python.exe -m pip install "onnxruntime-gpu>=1.22,<1.27"
   ```

5. เปิด yolo-backend

   ```bat
   npm run dev:yolo
   ```

   yolo-backend รันที่ `http://127.0.0.1:8000`
   ตอนใช้ครั้งแรก InsightFace ดาวน์โหลดโมเดล `buffalo_l` ไปที่ `%USERPROFILE%\.insightface` ครั้งแรกจึงต้องต่ออินเทอร์เน็ต

### ติดตั้ง go2rtc

ทำหัวข้อนี้เฉพาะเมื่อจะให้ระบบ YOLOv8 อ่านภาพจากกล้อง IP ผ่าน RTSP
แหล่งภาพอื่น ได้แก่ ไฟล์วิดีโอ ไฟล์รูปภาพ กล้อง browser และ Simulator ไม่ต้องใช้ go2rtc

[go2rtc](https://github.com/AlexxIT/go2rtc) เป็นโปรแกรมแยกที่รับสตรีมจากกล้องแล้วส่งต่อ ติดตั้งได้สองแบบ เลือกแบบที่สะดวก

- **clone repo แล้วรัน** ต้องมี Docker ในเครื่อง
- **ดาวน์โหลดไฟล์ exe มารัน** ต้องมี Python และต้องลง ffmpeg

หลังเปิด go2rtc แล้ว ให้ส่งภาพเข้าระบบ YOLOv8 ตามขั้นตอนนี้

1. เปิด `/?yolo-dashboard` แล้วไปที่ส่วน "ภาพจากกล้อง"
2. เลือกแหล่งภาพ "go2rtc"
3. วางลิงก์ของกล้องในช่อง "ลิงก์ go2rtc" ใช้ได้ทั้ง `rtsp://<host>:8554/<ชื่อกล้อง>` และลิงก์หน้าเว็บของ go2rtc ที่มี `src` เช่น `http://<host>:1984/stream.html?src=<ชื่อกล้อง>`

ถ้าวางลิงก์หน้าเว็บ yolo-backend ลองเปิด RTSP ที่พอร์ต 8554 ก่อน แล้วค่อยลอง MJPEG ผ่านหน้าเว็บของ go2rtc
พอร์ต 8554 คือค่าเริ่มต้นของ go2rtc ถ้าตั้ง RTSP ไว้ที่พอร์ตอื่น ให้วางลิงก์ `rtsp://` ที่มีพอร์ตนั้นแทน

## เปิดทุกส่วนพร้อมกัน

ที่ root ของโปรเจกต์ รันคำสั่งนี้บน Windows

```bat
scripts\dev.bat
```

`scripts\dev.bat` ตรวจ camwell-backend, yolo-backend และ frontend ทีละตัว แล้วเปิดแต่ละตัวในหน้าต่างของตัวเอง จากนั้นสรุปผลรายตัว

- ถ้าพอร์ตของตัวใดถูกใช้อยู่แล้ว dev.bat ไม่เปิดตัวนั้นซ้ำ
- ถ้าแพ็กเกจไม่ตรง dev.bat ซ่อมให้ด้วย `npm ci` หรือ `pip install` ถ้าซ่อมไม่ได้ dev.bat ข้ามตัวนั้นแล้วบอกวิธีแก้
- หน้าต่างของ frontend เปิดเบราว์เซอร์ไปที่ `http://localhost:5173` ให้เอง
- dev.bat ไม่เปิด go2rtc ให้ ถ้าใช้ go2rtc ให้เปิดเองแยกต่างหาก

ถ้าอยากเปิดทุกตัวใน terminal เดียว ให้รัน `npm run dev:all` ที่ root แทน

- คำสั่งนี้ไม่ตรวจและไม่ซ่อมแพ็กเกจ
- ถ้ายังไม่มี `yolo-backend\.venv` คำสั่งนี้ข้าม yolo-backend
- ถ้าตัวใดหยุด ตัวอื่นหยุดตาม

## เปิดหน้าเว็บ

1. เปิด `http://localhost:5173`
2. กด "เข้าสู่ระบบ" เพื่อไปหน้าเลือกระบบ `/?systems`
3. เลือก YOLOv8 หรือ MediaPipe

หน้าของแต่ละระบบอยู่ใน [ระบบ YOLOv8](docs/yolo.md) และ [ระบบ MediaPipe](docs/mediapipe.md)

## ก่อนใช้กับพนักงานจริง

ทั้งสองระบบเก็บข้อมูลใบหน้า ซึ่งเป็นข้อมูลอ่อนไหวตาม PDPA
ระบบ MediaPipe ยังลงทะเบียนใบหน้าที่ไม่รู้จักให้เองโดยไม่มีความยินยอม และเปิดอยู่เป็นค่าเริ่มต้น
อ่าน [ข้อมูลใบหน้า PDPA และ license ของโมเดล](docs/privacy-and-licenses.md) แล้วปรึกษาฝ่ายกฎหมายหรือ HR ก่อนใช้งานจริง
ถ้าจะใช้ระบบ YOLOv8 เชิงพาณิชย์ ให้ตรวจ license ของ ultralytics และ InsightFace ในเอกสารเดียวกันก่อน

## แก้ปัญหา

### ดาวน์โหลดโมเดลของ frontend ไม่สำเร็จ

เครือข่ายองค์กรบางแห่งบล็อก storage.googleapis.com
เมื่อดาวน์โหลดไม่สำเร็จ `setup-assets.mjs` พิมพ์ลิงก์และ path ที่ต้องวางไฟล์ไว้ แก้ได้สองทาง

- ดาวน์โหลดเองตาม `frontend/public/models/README.md` และ `frontend/public/models/face-api/README.md`
- รัน `npm run setup:assets` ใน `frontend/` อีกครั้งเมื่อเครือข่ายพร้อม

### หน้าเว็บเรียก backend ไม่ได้เพราะ CORS

ถ้าพอร์ต 5173 ไม่ว่าง Vite ย้าย frontend ไปพอร์ตอื่น แล้ว backend ทั้งสองตัวจะปฏิเสธคำขอจากหน้าเว็บ
yolo-backend รับเฉพาะ origin `http://localhost:5173` และ `http://127.0.0.1:5173` ตามที่กำหนดไว้ใน `yolo-backend/app/config.py`
camwell-backend รับเฉพาะ origin ใน `CORS_ORIGIN`
ปิดโปรแกรมที่ใช้พอร์ต 5173 แล้วเปิด frontend ใหม่

### มีโฟลเดอร์ `vision_service\` ค้างอยู่

โปรเจกต์รุ่นเก่าเก็บโค้ดของ yolo-backend ไว้ที่ `vision_service\` และโค้ดย้ายไป `yolo-backend\` แล้ว
หลัง `git pull` โฟลเดอร์ `vision_service\` ยังค้างอยู่ เพราะมี `.venv` ที่ git ไม่ได้เก็บ
อย่าย้าย `vision_service\.venv` มาใช้ เพราะ venv บน Windows ผูกกับ path เดิม

1. ลบโฟลเดอร์ `vision_service\`
2. ลบ `node_modules\` ที่ root ซึ่งเหลือจากรุ่นที่ frontend ยังอยู่ที่ root
3. สร้าง `yolo-backend\.venv` ใหม่ตามหัวข้อ "ติดตั้ง yolo-backend"

## เอกสารอื่น

- [ระบบ YOLOv8](docs/yolo.md) หน้า เกณฑ์แจ้งเตือน ตัวแปรสภาพแวดล้อม และไฟล์ข้อมูลของระบบ YOLOv8
- [ระบบ MediaPipe](docs/mediapipe.md) ฟีเจอร์ หน้า และ Dev Console ของระบบ MediaPipe
- [เก็บ dataset ท่านั่ง](docs/mediapipe-dataset.md) วิธีใช้ Dataset Recorder ของระบบ MediaPipe
- [การตรวจจับและแจ้งเตือนของระบบ MediaPipe](docs/mediapipe-how-it-works.md) ขั้นตอนต่อเฟรม เหตุผลของการออกแบบ และข้อจำกัด
- [ข้อมูลใบหน้า PDPA และ license ของโมเดล](docs/privacy-and-licenses.md)
- [คู่มือ camwell-backend](backend/README.md) API และตารางในฐานข้อมูล
- `DESIGN.md` ระบบดีไซน์ "ซองยาประจำออฟฟิศ" ที่ทุกหน้าใช้ ธีมมีโหมดสว่างและมืด และเริ่มตามการตั้งค่าของ OS จนกว่าผู้ใช้จะกดสลับ
- `PRODUCT.md` บริบทของผลิตภัณฑ์
