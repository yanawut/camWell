# Camwell

Webapp เชื่อมกล้องเพื่อตรวจจับท่านั่ง ระยะห่างจอ เวลานั่งต่อเนื่อง ความเหนื่อยล้า และการหกล้มของพนักงานออฟฟิศ
แล้วแจ้งเตือนเมื่อพบปัญหาต่อเนื่องนานพอจะเป็นปัญหา (การล้มแจ้งทันที)

มีสองระบบตรวจจับให้เลือกหลังเข้าสู่ระบบ ใช้หน้าตาและเมนูชุดเดียวกัน แต่ประมวลผลคนละที่และเก็บข้อมูลแยกกัน:

| ระบบ | ประมวลผลที่ | โมเดล | เก็บข้อมูลที่ |
|---|---|---|---|
| **YOLOv8** (แนะนำ) | `yolo-backend` (Python) อ่านกล้อง go2rtc เองได้ ไม่ต้องเปิดหน้าเว็บค้างไว้ | `yolov8m-pose.pt` (17 จุด), `yolov8m.pt` + ByteTrack, ใบหน้า InsightFace `buffalo_l` หรือ YuNet + SFace | ไฟล์ใน `yolo-backend/data/` |
| **MediaPipe** | เบราว์เซอร์ของเครื่องที่เปิดหน้าไว้ (local AI) | Pose Landmarker (33 จุด), @vladmandic/face-api | camwell-backend (SQLite) |

ทั้งสามส่วนรันบนเครื่องในออฟฟิศ ภาพและวิดีโอไม่ถูกส่งขึ้นคลาวด์

| ส่วน | โฟลเดอร์ | พอร์ต | หน้าที่ |
|---|---|---|---|
| frontend | `frontend/` | 5173 | React + Vite ทุกหน้าของทั้งสองระบบ |
| camwell-backend | `backend/` | 4000 | Express + SQLite ของระบบ MediaPipe: ใบหน้าที่ลงทะเบียน (`/api/employees`), ประวัติแจ้งเตือน (`/api/alerts`), การเข้า-ออกหน้ากล้อง (`/api/presence`), รายงานประจำวัน (`/api/reports/daily`) — ดู `backend/README.md` |
| yolo-backend | `yolo-backend/` | 8000 | FastAPI + YOLOv8 ของระบบ YOLOv8: วิเคราะห์ภาพทั้งห้อง จำหน้า แจ้งเตือน รายงาน (frontend เรียกผ่าน `/yolo/...` ที่ Vite ส่งต่อให้) |

## เริ่มต้นใช้งาน

ต้องติดตั้งครบทั้งสามส่วนถึงจะใช้ได้ทั้งสองระบบ ติดตั้งครั้งแรกตามหัวข้อของแต่ละส่วน แล้วเปิดพร้อมกันตามหัวข้อ "เปิดทั้งหมดพร้อมกัน"

### frontend — พอร์ต 5173

หน้าเว็บทุกหน้าของทั้งสองระบบ (React + Vite) ต้องใช้ Node.js 22.5 ขึ้นไป

```bash
cd frontend
npm install       # ติดตั้ง dependency + รัน postinstall (scripts/setup-assets.mjs) ที่จะ:
                   #   1) คัดลอก WASM runtime ของ MediaPipe มาไว้ที่ public/wasm
                   #   2) ดาวน์โหลดโมเดล pose_landmarker_{lite,full,heavy}.task (~44MB รวม) มาไว้ที่ public/models
                   #      (จาก storage.googleapis.com)
                   #   3) ดาวน์โหลดโมเดลของ face-api มาไว้ที่ public/models/face-api
                   #      (จาก raw.githubusercontent.com — เครือข่ายองค์กรส่วนใหญ่มักไม่บล็อก)
npm run dev       # http://localhost:5173
```

- ไฟล์ที่ข้ามไปแล้วจะไม่ดาวน์โหลดซ้ำ ถ้าเครือข่ายบล็อกการดาวน์โหลดโมเดลใด ดูวิธีดาวน์โหลดเองที่ `frontend/public/models/README.md`
  และ `frontend/public/models/face-api/README.md` หรือรัน `npm run setup:assets` ใน `frontend/` ใหม่ภายหลัง
- ที่อยู่ camwell-backend ตั้งได้ผ่าน `VITE_API_BASE_URL` ใน `frontend/.env` (ค่าเริ่มต้น `http://localhost:4000`)
- ต้องเปิดที่พอร์ต 5173 เท่านั้น เพราะ yolo-backend รับเฉพาะหน้าเว็บที่เปิดจาก `localhost:5173`
- คำสั่งอื่น: `npm test` (vitest) · `npm run lint` (oxlint) · `npm run build` (tsc + vite build)

### camwell-backend — พอร์ต 4000

ข้อมูลของระบบ MediaPipe (Express + SQLite): ใบหน้าที่ลงทะเบียน ประวัติแจ้งเตือน การเข้า-ออกหน้ากล้อง และรายงานประจำวัน
ต้องใช้ Node.js 22.5 ขึ้นไป (ใช้ `node:sqlite` ที่มากับ Node.js)

```bash
cd backend
npm install
cp .env.example .env    # พอร์ต, path ไฟล์ DB และ origin ที่อนุญาต
npm run dev             # http://localhost:4000
```

- ข้อมูลเก็บที่ `backend/data/camwell.sqlite`
- ไม่เปิดตัวนี้ ระบบ MediaPipe ยังตรวจจับและเตือนบนจอได้ แต่ไม่มีการจำหน้า และหน้ารายชื่อ ประวัติแจ้งเตือน รายงานประจำวันจะไม่มีข้อมูล
- API และตารางในฐานข้อมูล: `backend/README.md`

### yolo-backend — พอร์ต 8000

ระบบ YOLOv8 ทั้งระบบ (FastAPI + YOLOv8 + ByteTrack): วิเคราะห์ภาพทั้งห้อง จำหน้า แจ้งเตือน และรายงาน
ต้องใช้ Python 3.12 และ torch รุ่น CUDA 12.8 (torch ไม่อยู่ใน `requirements.txt` เพราะต้องโหลดจาก index ของ PyTorch)

```bat
py -3.12 -m venv yolo-backend\.venv
yolo-backend\.venv\Scripts\python.exe -m pip install torch==2.11.0+cu128 torchvision==0.26.0+cu128 --index-url https://download.pytorch.org/whl/cu128
yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements.txt
rem ชุดจดจำใบหน้า: ลง insightface แล้วเปลี่ยน onnxruntime เป็นรุ่น GPU ที่เข้ากับ torch cu128
yolo-backend\.venv\Scripts\python.exe -m pip install -r yolo-backend\requirements-face.txt
yolo-backend\.venv\Scripts\python.exe -m pip uninstall -y onnxruntime onnxruntime-gpu
yolo-backend\.venv\Scripts\python.exe -m pip install "onnxruntime-gpu>=1.22,<1.27"
npm run dev:yolo        # ที่ root — http://127.0.0.1:8000
```

- ไม่เปิดตัวนี้ ระบบ YOLOv8 ใช้ไม่ได้ทั้งระบบ
- ถ้าเปิดด้วย `scripts\dev.bat` ข้ามสี่บรรทัดที่ลง `requirements.txt` และชุดจดจำใบหน้าได้ เพราะ dev.bat ลงให้เองทุกครั้งที่เปิด
- onnxruntime-gpu 1.27 ขึ้นไปสร้างมาสำหรับ CUDA 13 ใช้คู่กับ torch cu128 ไม่ได้
- ถ้าชุดจดจำใบหน้าลงไม่สำเร็จ yolo-backend ยังเปิดได้ แต่จะไม่ขึ้นชื่อคน และวัดระยะจอ/ความล้าไม่ได้
- ไฟล์โมเดลใบหน้า `buffalo_l` ดาวน์โหลดเองตอนใช้ครั้งแรกไปที่ `%USERPROFILE%\.insightface` (ต้องมีอินเทอร์เน็ต)
- frontend เรียก yolo-backend ผ่าน `/yolo/...` และ Vite ส่งต่อไปที่ `127.0.0.1:8000` (`frontend/vite.config.ts`)
- ข้อมูลเก็บที่ `yolo-backend/data/` (ดูหัวข้อ "ระบบ YOLOv8")
- **เคยมีโปรเจกต์รุ่นเก่า (มีโฟลเดอร์ `vision_service\`)** — โค้ดย้ายมาเป็น `yolo-backend\` แล้ว หลัง `git pull`
  โฟลเดอร์ `vision_service\` ยังค้างอยู่เพราะมี `.venv` ที่ git ไม่ได้เก็บ ลบทิ้งได้ (รวมถึง `node_modules\` ที่ root ของรุ่นที่ frontend
  ยังอยู่ที่ root) อย่าย้าย `vision_service\.venv` มาใช้ เพราะ venv บน Windows ผูกกับ path เดิม ให้สร้าง `yolo-backend\.venv` ใหม่ตามขั้นตอนด้านบน

### เปิดทั้งหมดพร้อมกัน

```bat
scripts\dev.bat
```

`scripts\dev.bat` (Windows) เปิด camwell-backend, yolo-backend และ frontend คนละหน้าต่าง ตรวจทีละตัวแล้วสรุปผล
ตัวที่พอร์ตถูกใช้อยู่แล้วจะไม่เปิดซ้ำ ข้อที่ซ่อมเองได้จะซ่อมให้ (`npm ci`, `pip install`) ถ้าซ่อมไม่ได้จะข้ามตัวนั้นแล้วบอกวิธีแก้

หรือรันทุกตัวใน terminal เดียวจาก root: `npm run dev:all` (ข้าม yolo-backend ถ้ายังไม่มี `yolo-backend\.venv`, ตัวใดตัวหนึ่งหยุด ตัวอื่นหยุดตาม)

## หน้าที่เปิดได้

ทุกทางเข้าแอปจากหน้าแรกผ่านหน้าเลือกระบบ: `/` → กด "เข้าสู่ระบบ" → `/?systems` → เลือก YOLOv8 หรือ MediaPipe

| URL | หน้า |
|---|---|
| `/` | หน้าแรกก่อนเข้าระบบ — อธิบายว่ากล้องดูอะไร เตือนเมื่อไร และเรื่องความเป็นส่วนตัว (ไม่โหลดกล้องหรือโมเดล) |
| `/?systems` | เลือกระบบตรวจจับ — YOLOv8 (แนะนำ) หรือ MediaPipe พร้อมรายชื่อโมเดลที่แต่ละระบบใช้ |
| **ระบบ YOLOv8** | |
| `/?yolo-dashboard` | ภาพรวมห้อง (หน้าอื่นของระบบอยู่ที่ `?yolo-dashboard=<หน้า>` ดูหัวข้อ "ระบบ YOLOv8") |
| `/?yolo-console` | YOLO Console สำหรับนักพัฒนา |
| **ระบบ MediaPipe** | |
| `/?dashboard` | ภาพรวมห้อง — กล้องแต่ละตัววาดเป็นผังห้อง พร้อมตารางคนในห้อง (กล้องทำงานเบื้องหลัง เปิดดูภาพได้จากช่องติ๊ก) |
| `/?camera` | ตั้งค่ากล้อง — กล้อง + แผงตั้งค่าความไว + ประวัติแจ้งเตือน (โมเดล `lite` และโครงร่างแบบ `basic` เสมอ) |
| `/?gait` | ท่ายืน & ท่าเดิน — ท่ายืนหน้าตรง, ท่ายืนด้านข้าง, ทดสอบ Romberg, วิเคราะห์ท่าเดิน |
| `/?people` | รายชื่อบุคคลที่ลงทะเบียนใบหน้าใน camwell-backend (ไม่โหลดกล้องหรือโมเดล) |
| `/?alerts` | ประวัติแจ้งเตือนจาก camwell-backend กรองรายคน (`?alerts&employee=<id>`) และหมวด ส่งออก CSV |
| `/?report` | รายงานประจำวันจาก camwell-backend — ความเสี่ยง Office Syndrome รายคน |
| `/?console` | Dev Console — ใช้ state และ logic ชุดเดียวกับหน้ากล้อง แต่จัดหน้าใหม่ + มีเครื่องมือสำหรับนักพัฒนา |

ทุกหน้าใช้ธีม "ซองยาประจำออฟฟิศ" ทั้งโหมดสว่างและมืด (ตาม OS จนกว่าจะกดสลับ) — ระบบดีไซน์อยู่ใน `DESIGN.md`

## ระบบ YOLOv8

### หน้าของเจ้าหน้าที่ (`/?yolo-dashboard`)

แถบเมนูด้านบน 7 หน้า เปลี่ยนหน้าโดยไม่โหลดใหม่ WebSocket และกล้องที่กำลังส่งภาพจึงทำงานต่อระหว่างเปลี่ยนหน้า
เมื่อมีคนล้ม แถบแดงพร้อมเสียงเตือนขึ้นบนสุดของทุกหน้าจนกว่าจะกด "รับทราบเหตุการณ์"

| เมนู | URL | เนื้อหา |
|---|---|---|
| ภาพรวม | `?yolo-dashboard` | ผังห้องพร้อมคนในห้อง ตารางคนในห้องนี้ และส่วน "ภาพจากกล้อง" เลือกแหล่งภาพ: ไฟล์วิดีโอ, ไฟล์รูปภาพ, กล้อง browser, go2rtc, Simulator — เข้าหน้านี้แล้วเปิดกล้อง browser ให้เอง เว้นแต่กำลังวิเคราะห์แหล่งอื่นอยู่ |
| เกณฑ์แจ้งเตือน | `?yolo-dashboard=camera` | เปิด/ปิดและปรับเกณฑ์ของแต่ละหมวด + โหมดทดสอบ (ย่นเวลา) |
| พื้นห้องและโซน | `?yolo-dashboard=floor` | วางมุมพื้นบนภาพจากกล้องให้เป็นเมตร แล้วแบ่งโซน |
| รายชื่อบุคคล | `?yolo-dashboard=people` | ลงทะเบียนใบหน้า (ต้องติ๊กความยินยอม) จากไฟล์หรือกล้อง ลบรูป/ลบคน ปรับเกณฑ์จับคู่ และดูคู่ที่หน้าคล้ายกัน |
| ประวัติแจ้งเตือน | `?yolo-dashboard=alerts` | กรองตามช่วงวัน บุคคล หมวด · ส่งออก CSV |
| รายงานประจำวัน | `?yolo-dashboard=report` | ความเสี่ยง Office Syndrome รายคน กราฟรายชั่วโมง การ์ดรายคน (บันทึก PNG/คัดลอก) · ส่งออก CSV/JSON · พิมพ์ |
| สถิติการใช้ห้อง | `?yolo-dashboard=rooms` | สรุปของทุกรอบที่วิเคราะห์จบแล้ว: จำนวนคน ช่วงที่คนเยอะที่สุด เวลาในแต่ละท่าทางและแต่ละโซน |

ค่าเริ่มต้นของเกณฑ์ (`yolo-backend/wellness.py`, ปรับได้ที่หน้าเกณฑ์แจ้งเตือน): ท่านั่งไม่ดีต่อเนื่อง 30 วินาที ·
หน้าใหญ่กว่าปกติ 1.25 เท่าต่อเนื่อง 30 วินาที (เรียนรู้ขนาดหน้าปกติจากเวลานั่ง 120 วินาที) · นั่งต่อเนื่อง 45 นาที
(ลุกหรือออกไป 60 วินาทีนับเป็นพัก) · หลับตา 2 วินาที หรือหาว 3 ครั้งใน 10 นาที · ล้ม = ลำตัวร่วง 30% ของความสูงตัวใน 1 วินาที แล้วเอียงจากแนวตั้ง 60°

ข้อมูลของระบบนี้อยู่ใน `yolo-backend/data/`: `settings.json` (พื้นและโซน), `wellness_settings.json` (เกณฑ์แจ้งเตือน),
`faces/<ชื่อ>/` (รูปที่ลงทะเบียน), `alerts/` (แจ้งเตือนและการอยู่หน้ากล้อง ไฟล์ละวัน), `reports/` (รายงานของแต่ละรอบ), `uploads/` (ไฟล์ที่อัปโหลด)

### YOLO Console (`/?yolo-console`)

หน้าสำหรับนักพัฒนา เข้าจากปุ่ม "Console" บนแถบเมนูของ `?yolo-dashboard` ปุ่ม "← Back to Dashboard" พากลับไป `?yolo-dashboard`
โดยไม่หยุดการวิเคราะห์ สลับไป Dev Console ของ MediaPipe ได้ที่ปุ่ม **Engine: MediaPipe / YOLO** ใน sidebar — สลับแล้วเปลี่ยนทั้งหน้า
และสั่งหยุด session ของ YOLO ก่อน

เมนูด้านซ้าย (ตามต้นแบบ Cam-Well-YoLo-ByteTrack ที่วางเมนูไว้ด้านบน):

- **หน้าหลัก** — แหล่งภาพ: ไฟล์วิดีโอ, ไฟล์รูปภาพ, กล้อง browser, go2rtc, Simulator · ภาพสดพร้อมกรอบคน (ชื่อจากใบหน้า, ⚠ เมื่อมีการเตือน)/
  สิ่งของ/เส้นทางเดิน · แผง "คนในห้องนี้" (ท่านั่ง ระยะจอ เวลานั่ง ความล้า การล้ม พร้อมเสียงเตือน และปุ่มรับทราบเมื่อมีคนล้ม) ·
  แผงสถิติ, heatmap, ผังพื้น · หยุดชั่วคราว/เลื่อนคลิป/จบ/เริ่มใหม่
- **ตั้งค่า** — calibrate พื้น (ลาก 4 มุม คลิกบนเส้นกรอบเพื่อเพิ่มจุด) และแบ่งโซน บันทึกลง `yolo-backend/data/settings.json` ·
  เกณฑ์การแจ้งเตือนแต่ละหมวด + โหมดทดสอบ (ย่นเวลา) บันทึกลง `yolo-backend/data/wellness_settings.json`
- **ใบหน้า** — ลงทะเบียนคนจากไฟล์รูปหรือถ่ายจากกล้อง browser (พร้อมความยินยอมตาม PDPA) · ปรับ threshold และดูคู่ที่หน้าคล้ายกัน
  รูปเก็บที่ `yolo-backend/data/faces/<ชื่อ>/`
- **ประวัติการแจ้งเตือน** — กรองตามวัน บุคคล หมวด · ส่งออก CSV
- **รายงานประจำวัน** — ความเสี่ยง Office Syndrome รายคน กราฟรายชั่วโมง การ์ดรายคน (บันทึก PNG/คัดลอก) · ส่งออก CSV/JSON · พิมพ์
- **รายงาน** — รายงานของทุก session ที่จบแล้ว + ดาวน์โหลด `tracks.csv`

## ระบบ MediaPipe

### ฟีเจอร์

1. **ท่านั่ง** — ก้มคอ/ยื่นคอ, หลังค่อม/โน้มตัว, นั่งเอียงข้าง (MediaPipe Pose Landmarker)
   พร้อมปุ่ม **Calibrate ท่านั่ง** (นั่งท่าดี 3 วินาที → เก็บเป็น baseline แยกต่อกล้อง)
2. **หกล้ม / ตกจากเก้าอี้** — ลำตัวร่วงเร็ว + เอียงใกล้แนวนอน หรือร่วงเร็วแล้วหายจากเฟรม (แจ้งทันที ไม่ต้องรอสะสมเวลา)
3. **ความเหนื่อยล้า** — ง่วง/หลับตานาน (Eye Aspect Ratio), หาวถี่ผิดปกติ (Mouth Aspect Ratio) (@vladmandic/face-api)
4. **ระยะห่างจากจอ** — เตือนเมื่อนั่งใกล้จอเกินกว่าค่าที่ calibrate ไว้
5. **เตือนพัก** — นั่งต่อเนื่องนานเกินไปโดยไม่ลุก (ตัวจับเวลาแยกต่อกล้อง ไม่เกี่ยวกับท่านั่งถูก/ผิด)
6. **Face recognition (ระบุตัวตน)** — ลงทะเบียนใบหน้าผ่าน camwell-backend ⚠️ ดูคำเตือนเรื่อง PDPA ด้านล่าง
7. **หลายกล้อง / หลายคน** — ต่อกล้องพร้อมกันได้สูงสุด 2 ตัว (กล้องในเครื่อง/USB หรือกล้อง IP แบบ MJPEG)
   และเลือกโหมด Workstation (1 คน), Multi-person (สูงสุด 4 คนต่อกล้อง) หรือไม่จำกัด (MediaPipe สูงสุด 20 คน ยิ่งคนเยอะยิ่งช้า)
   — หน้าภาพรวมเริ่มที่ Multi-person หน้ากล้องเริ่มที่ Workstation
8. **ท่ายืน & ท่าเดิน** (`/?gait`) — ท่ายืนหน้าตรง, ท่ายืนด้านข้าง, ทดสอบ Romberg (ลืมตา/หลับตาอย่างละ 10 วินาที), วิเคราะห์ท่าเดิน (อัด 8 วินาที)
9. **ส่งเหตุการณ์ไป backend** — ทุกการแจ้งเตือนส่งไป camwell-backend (`POST /api/alerts`) ตอนเริ่มและตอนจบ และบันทึกการเข้า-ออกหน้ากล้อง
   (`/api/presence`) เพื่อใช้ในหน้าประวัติแจ้งเตือนและรายงานประจำวัน
10. **Dev Console** (`/?console`) — หน้าผู้ดูแลระบบสำหรับดูสถานะ/ปรับเกณฑ์/เก็บ dataset — ดูหัวข้อด้านล่าง

ฟีเจอร์ที่ใช้ใบหน้า (3, 4, 6) เปิดอยู่เป็นค่าเริ่มต้น (`DEFAULT_FACE_FEATURES_ENABLED` ใน `frontend/src/lib/featureVisibility.ts`)
ปิดได้จากช่อง "ฟีเจอร์ใบหน้า"

### Dev Console (`/?console`)

ตอนนี้เปิดได้ทุก build (ยังอยู่ช่วงพัฒนา — จะกำหนดสิทธิ์ใหม่ภายหลัง) เข้าจากปุ่ม "Console" บนแถบเมนูของระบบ MediaPipe
ปุ่ม "← Back to Dashboard" พากลับไป `?dashboard`

- **Sidebar** — สลับ Engine (MediaPipe / YOLO) · 4 เมนู · สถานะโมเดล/บริการ (Pose Landmarker, face-api, camwell-backend, error ของกล้องแต่ละตัว)
- **Header** — โหมด Workstation / Multi / ไม่จำกัด · **Pose: lite / full / heavy** · **Skeleton: basic / full** · เสียงแจ้งเตือน ·
  ฟีเจอร์ใบหน้า · Dataset Recorder · สถานะ backend (`/health` ทุก 10 วินาที)
- **ภาพรวมระบบ** — แถบสถิติ (Pose inference ms แบบ EMA, จำนวนคนที่ติดตาม, แจ้งเตือนที่ยัง active), การ์ดกล้อง
  (ชิป GPU/CPU · ms · จำนวนคน, สถานะ baseline, เปลี่ยนแหล่งภาพ), แจ้งเตือนล่าสุด
  — จอกว้าง ≥1700px จะแสดงการ์ดเกณฑ์การตรวจจับทางขวาด้วย
- **เกณฑ์การตรวจจับ** — slider ทุกค่า (ท่านั่ง/หกล้ม/ความเหนื่อยล้า/ระยะห่างจอ/เตือนพัก) บอกว่าค่าไหนแก้จากค่าเริ่มต้น + ปุ่มคืนค่าทั้งหมด
- **เหตุการณ์** — กรองตามหมวด/เฉพาะที่ยัง active + Export JSON
- **ข้อมูลใบหน้า** — รายชื่อพนักงานที่ลงทะเบียนใน backend + ลบข้อมูล

กล้องไม่ถูก unmount ตอนสลับแท็บ (แค่ซ่อน) จึงไม่ต้องโหลดกล้อง/โมเดลใหม่

#### เลือกรุ่นโมเดล Pose (lite / full / heavy)

ทุกรุ่นให้ landmark 33 จุดรูปแบบเดียวกัน ต่างกันที่ความแม่นยำกับความเร็ว — ดูค่า ms ในแถบสถิติเพื่อเทียบบนเครื่องจริง
(ระบบจำกัดไว้ 12 fps = งบ ~83 ms ต่อรอบต่อกล้อง)

| รุ่น | ไฟล์ | ขนาดโดยประมาณ |
|---|---|---|
| lite (ค่าเริ่มต้น) | `pose_landmarker_lite.task` | ~5.5 MB |
| full | `pose_landmarker_full.task` | ~9 MB |
| heavy | `pose_landmarker_heavy.task` | ~29 MB |

- เปลี่ยนรุ่นแล้วโมเดลโหลดใหม่ทุกกล้อง — **ควร Calibrate ท่านั่งใหม่** เพราะมุมที่วัดได้ต่างกันเล็กน้อย
- เปลี่ยนรุ่นไม่ได้ระหว่างกำลังบันทึก dataset

#### โครงร่าง (Skeleton: basic / full)

- **basic** (ค่าเริ่มต้น) — โครงร่างเดิม 10 เส้นช่วงบน (ไหล่ แขน ลำตัว หู-ไหล่) วาดทุกจุดที่โมเดลส่งมา
- **full** — ครบ 35 เส้นตาม BlazePose (หน้า แขน มือ ลำตัว ขา) เฉพาะจุดที่ visibility ≥ `minVisibility` (0.5)
  + **เส้นสีเหลือง** = เส้นคอ (กึ่งกลางไหล่ → กึ่งกลางหู/จมูก) และกระดูกสันหลัง (กึ่งกลางสะโพก → กึ่งกลางไหล่)
  ซึ่งเป็นเส้นเดียวกับที่ใช้วัด `neckAngleDeg` / `torsoAngleDeg` จริง
  — ตอนเห็นแค่ช่วงบน แขน/สะโพกที่มองไม่ชัดจะไม่ถูกวาด (ตั้งใจ)

การเลือกโครงร่างเป็นแค่การแสดงผล ไม่มีผลกับการตรวจจับ

#### Dataset Recorder

เก็บตัวเลข landmark/feature (ไม่เก็บภาพ) ไว้ปรับจูนเกณฑ์ท่านั่ง — เปิดจาก checkbox "Dataset Recorder" บน header
(แผงจะอยู่ในหน้าภาพรวม) หน้ากล้อง `/?camera` ก็มีแผงแบบง่ายให้ใช้เช่นกัน (แสดงเฉพาะตอนรัน dev)

- เลือก **กล้อง** + **label** (`GOOD`, `FORWARD_HEAD`, `SLOUCH`, `LEAN_LEFT`, `LEAN_RIGHT`) → เริ่ม/หยุดบันทึก → Export JSON
- เก็บเฉพาะเฟรมที่มี **คนเดียวในเฟรม** · ประมาณ 12 sample/วินาที · ค่าดิบก่อน smoothing
- ระหว่างบันทึกจะเห็น `● REC` + ค่า 4 feature ซ้อนบนภาพกล้องที่กำลังบันทึก
- **ไม่ปน dataset ข้ามรุ่นโมเดล** — dataset ล็อกตามรุ่นของ sample แรก ถ้ารุ่นไม่ตรงจะเริ่มบันทึกไม่ได้จนกว่าจะ Export แล้วล้างข้อมูล
- ไฟล์ export มี `meta.schemaVersion`, `exportedAt`, `poseModel`, `thresholdsAtExport` + `samples[]`
  (แต่ละ sample มี `cameraId`, `label`, มุมต่างๆ, `quality`, `landmarks`/`worldLandmarks` 33 จุดพร้อม `visibility`, `minVisibility`)

ข้อควรระวัง:
- เก็บในหน่วยความจำของแท็บเท่านั้น — **รีเฟรช/ปิดแท็บแล้วหาย ต้อง Export ก่อน** และกินหน่วยความจำเพิ่มขึ้นระหว่างบันทึก (อัดเป็นช่วงแล้ว export ทยอย)
- CameraStage เก็บ sample เฉพาะตอนรัน dev (`import.meta.env.DEV`) — production build จะไม่เก็บ
- ไม่มีผลกับการตรวจจับ/แจ้งเตือน (การแจ้งเตือนยังทำงานระหว่างอัด — ปิดเสียงได้ถ้ารำคาญ)

แนวทางเก็บข้อมูลให้ใช้งานได้: อัด `GOOD` ก่อนทุกรอบ (ใช้เป็น baseline ตอนวิเคราะห์) · ท่าละ 30–60 วินาทีต่อเนื่อง ·
ครบทุก label · หลายคน/หลายวัน ดีกว่าอัดคนเดียวนานๆ · ห้ามย้ายกล้อง/เปลี่ยนรุ่นโมเดลกลางคัน

### วิธีทำงานของแต่ละฟีเจอร์

#### ท่านั่ง + หกล้ม + เตือนพัก (PostureEngine)
1. `usePoseLandmarker` โหลดโมเดล BlazePose (33 keypoints) รุ่นที่เลือกจากไฟล์ local (GPU delegate, fallback เป็น CPU)
2. `lib/poseThrottle.ts` จำกัดการรันโมเดลไว้ 12 fps ต่อกล้อง และรันเฉพาะเมื่อเฟรมวิดีโอเปลี่ยนจริง
3. `lib/postureEngine.ts` (หนึ่ง instance ต่อกล้อง) รวมขั้นตอนต่อเฟรม:
   - `lib/tracker.ts` จับคู่คนข้ามเฟรมให้มี trackId คงที่
   - `lib/postureAnalysis.ts` คำนวณมุมคอ/มุมลำตัว/มุมเอียงไหล่/`headHeightRatio` (ข้ามจุดที่ visibility < `minVisibility`)
     และแยก `full_body` / `upper_body`
   - `lib/smoothing.ts` ทำค่าให้นิ่ง (EMA) ก่อนจัดท่า → `classifyPosture` → forward_head / slouching / leaning / good
     (ถ้า Calibrate แล้ว ตัดสินจากส่วนต่างเทียบ baseline ของกล้องนั้น + สัดส่วนหัวที่ต่ำลง)
   - `lib/fallDetection.ts` ตรวจการร่วงตัวเร็ว / หายจากเฟรม
   - `lib/breakReminder.ts` จับเวลานั่งต่อเนื่อง
4. Baseline ท่านั่งเก็บใน localStorage แยกต่อกล้อง (`camwell:posture-baseline:v1:<cameraId>`, ดู `services/postureBaselineStore.ts`)

#### ความเหนื่อยล้า + ระยะห่างจอ + ระบุตัวตน
1. `useFaceApiModels` โหลดโมเดล TinyFaceDetector + FaceLandmark68 + FaceRecognition จากไฟล์ local
2. ตรวจจับใบหน้าแบบ throttled (ทุก ~400ms) แล้วจับคู่ใบหน้ากับคนจาก pose ที่ตำแหน่งใกล้ที่สุด
3. `lib/fatigueAnalysis.ts` คำนวณ EAR (ตาหลับ) และ MAR (อ้าปาก/หาว) จาก 68 จุด landmark ใบหน้า
4. `lib/distanceAnalysis.ts` เทียบขนาดกรอบใบหน้ากับ baseline ที่ calibrate ไว้
5. `services/faceEnrollment.ts` ส่ง descriptor 128 มิติไปให้ camwell-backend จับคู่ (เช็คซ้ำทุก ~3 วินาทีต่อคน)
   — browser ไม่ได้เก็บ descriptor ของใครไว้เลย

#### กลไกแจ้งเตือนกลาง
`lib/sustainedAlertMachine.ts` เป็น state machine กลางของท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ — ต้องเจอปัญหาต่อเนื่อง
นานเกิน threshold ก่อนจะแจ้งเตือนจริง และต้องกลับปกติสักพักก่อนเคลียร์ (hysteresis) กันกระพริบ
(หกล้มเป็น edge-triggered แจ้งทันที, เตือนพักเป็นตัวจับเวลา) ทุกเหตุการณ์ใช้โครงสร้าง `AlertEvent` เดียวกัน (`types/alerts.ts`)

แจ้งเตือนแสดงเป็นกรอบ/banner สีแดงบนกล้อง + banner หกล้ม/เตือนพัก + เสียง (ปิดได้) + บันทึกลงตารางเหตุการณ์
และ `backendAlertReporter` (`services/alertReporter.ts`) ส่งเหตุการณ์ไปเก็บที่ camwell-backend ตอนเริ่มและตอนจบ

## โครงสร้างโค้ดที่สำคัญ

```
frontend/src/
  main.tsx                        เลือกหน้าตาม URL: / → LandingPage, ?systems, ?yolo-dashboard, ?alerts, ?people, นอกนั้น App
  App.tsx                         state กลางของระบบ MediaPipe: ?dashboard, ?camera, ?console และส่งต่อไป ?report, ?gait, ?yolo-console
  envelope/                       ธีมซองยา: token สี/ฟอนต์ (envelope.css), เครื่องหมายลายเส้น (marks.tsx), ป้ายของเครื่องหมาย
  pages/                          LandingPage (/), SystemChooserPage (?systems), PeoplePage, AlertsPage, ReportsPage, GaitAssessmentPage
  dashboard/                      OfficeDashboard + OfficeRoom — ภาพรวมห้องของระบบ MediaPipe (?dashboard)
  components/AppNavigation.tsx    แถบเมนูของหน้าในระบบ MediaPipe
  components/CameraStage.tsx      กล้อง + canvas overlay + detection loop (pose + face) ของกล้อง 1 ตัว
  components/CameraSourceSelector.tsx  เลือกกล้องในเครื่อง / กล้อง IP (MJPEG)
  components/SettingsPanel.tsx    ปรับ threshold (หน้ากล้อง)
  components/EnrollmentPanel.tsx  รายชื่อที่ลงทะเบียนใบหน้า + ลบ (หน้ากล้อง)
  components/AttendancePanel.tsx  การเข้า-ออกหน้ากล้องล่าสุด (หน้ากล้อง เมื่อเปิดฟีเจอร์ใบหน้า)
  components/EventLog.tsx         ตารางประวัติการแจ้งเตือน (หน้ากล้อง)
  components/DatasetRecorderPanel.tsx  แผงบันทึก dataset แบบง่าย (หน้ากล้อง)
  console/                        Dev Console (DevConsole, EngineSwitch, MonitorTab, RecorderPanel, ThresholdsTab,
                                  EventsTab, PeopleTab, useBackendHealth, format, console.css)
  hooks/usePoseLandmarker.ts      โหลด MediaPipe Pose Landmarker (เลือกรุ่น lite/full/heavy, รายงาน GPU/CPU)
  hooks/useFaceApiModels.ts       โหลดโมเดลของ face-api
  hooks/useCameraDevices.ts       รายชื่อกล้องในเครื่อง
  hooks/usePersistentState.ts     state ที่จำค่าใน localStorage
  hooks/useTheme.ts               ธีมสว่าง/มืด (camwell:theme)
  lib/postureEngine.ts            pipeline ต่อเฟรมของกล้อง 1 ตัว (tracker + posture + fall + break)
  lib/postureAnalysis.ts          คำนวณมุมท่านั่ง + จัดท่า
  lib/postureCalibration.ts       คำนวณ baseline จากช่วง Calibrate
  lib/standingPostureAnalysis.ts  ท่ายืน (หน้า ?gait)
  lib/gaitAnalysis.ts, multiPersonGait.ts  ท่าเดินและ Romberg (หน้า ?gait)
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
  lib/multiPerson.ts              โหมด workstation/multi/unlimited
  services/alertReporter.ts       ส่งเหตุการณ์แจ้งเตือนไป camwell-backend
  services/alertHistory.ts        อ่านประวัติแจ้งเตือนจาก camwell-backend (?alerts)
  services/presence.ts            บันทึก/อ่านการเข้า-ออกหน้ากล้อง
  services/dailyReport.ts         รายงานประจำวันจาก camwell-backend (?report)
  services/faceEnrollment.ts      ลงทะเบียน/ลบ/จับคู่ใบหน้าผ่าน backend
  services/datasetRecorder.ts     เก็บ sample dataset (เลือกกล้อง, ล็อกรุ่นโมเดล)
  services/postureBaselineStore.ts baseline ท่านั่งต่อกล้อง (localStorage)
  services/apiConfig.ts           API_BASE_URL + fetch helper
  services/beep.ts                เสียงแจ้งเตือน (Web Audio API)
  types/                          alerts, posture, fall, wellbeing, identity, person, cameraSource
  yoloConsole/                    YOLO Console (?yolo-console) + โมดูลที่ระบบ YOLOv8 ใช้ร่วม: yoloService (REST/WebSocket ไป yolo-backend),
                                  useYoloLive, store, types, wellness, drawLive, คณิตศาสตร์พื้นห้อง (homography, floorCalibration, zoneLayout)
  yoloDashboard/                  หน้าของเจ้าหน้าที่ระบบ YOLOv8 (?yolo-dashboard) — 7 หน้า, แถบเมนู YoloNav, CSS ของตัวเอง (yd-*)
backend/                          camwell-backend (Express + SQLite `data/camwell.sqlite`): employees, alerts, presence, reports
yolo-backend/                     FastAPI (app/main.py) + YOLOv8 + ByteTrack (room_analytics.py), จำหน้า (face_id.py),
                                  แจ้งเตือนสุขภาพ (wellness.py), ข้อมูลใน data/
scripts/                          dev.bat + dev-windows.mjs (เปิด dev server คนละหน้าต่าง), dev-all.mjs (npm run dev:all)
DESIGN.md, PRODUCT.md             ระบบดีไซน์ "ซองยาประจำออฟฟิศ" และบริบทของผลิตภัณฑ์
```

## ข้อจำกัดที่ควรรู้

- **กล้อง IP ต่าง origin (CORS) ในระบบ MediaPipe** — ภาพแสดงได้แต่ AI อ่านพิกเซลไม่ได้ (canvas tainted) ต้องมีตัวกลางแปลงสตรีม
  กล้องที่ใช้ RTSP เปิดในเบราว์เซอร์ตรงๆ ไม่ได้ (ระบบ YOLOv8 อ่าน RTSP ผ่าน go2rtc ได้)
- **กล้องหน้าตรง** มองการยื่นคอ/หลังค่อมได้จำกัด (เป็นการเคลื่อนเข้าหากล้อง) — เกณฑ์ปัจจุบันยังต้องปรับจูนจาก dataset จริง
- `minVisibility` (0.5) ยังไม่มีให้ปรับในหน้าเว็บ (มีผลกับการคำนวณมุม, dataset และโครงร่างแบบ full)
- ระบบ MediaPipe เฝ้าได้เฉพาะตอนเปิดหน้าค้างไว้ ปิดแท็บแล้วการตรวจจับหยุด

## ⚠️ ข้อควรระวังเรื่อง Face Recognition และ PDPA

ฟีเจอร์ระบุตัวตนพนักงานใช้ข้อมูลใบหน้า (face descriptor / embedding และรูปที่ลงทะเบียน) ซึ่งเป็น**ข้อมูลชีวภาพ (biometric data)**
ถือเป็นข้อมูลส่วนบุคคลที่มีความอ่อนไหวภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) ของไทย ก่อนนำไปใช้งานจริงกับพนักงานต้อง:

1. ขอความยินยอม (consent) จากพนักงานอย่างชัดเจนก่อนลงทะเบียนใบหน้า — ทั้งสองระบบบังคับให้ติ๊กยืนยันก่อนลงทะเบียน
   และ camwell-backend ปฏิเสธคำขอที่ไม่มี `consentGiven: true`
2. แจ้งวัตถุประสงค์การใช้ข้อมูลให้ชัดเจน และเก็บเท่าที่จำเป็น
3. มีสิทธิ์ให้พนักงานขอลบข้อมูลของตัวเองได้ตลอดเวลา — MediaPipe: `/?people`, แผงรายชื่อในหน้ากล้อง และแท็บ "ข้อมูลใบหน้า" ใน Dev Console ·
   YOLOv8: `/?yolo-dashboard=people` และเมนู "ใบหน้า" ใน YOLO Console

ที่เก็บข้อมูล: ระบบ MediaPipe เก็บ descriptor ไว้ที่ **camwell-backend (SQLite) เท่านั้น** ไม่ส่งกลับมาที่เบราว์เซอร์หลังลงทะเบียน ·
ระบบ YOLOv8 เก็บรูปที่ลงทะเบียนไว้ที่ `yolo-backend/data/faces/<ชื่อ>/` บนเครื่องที่รัน yolo-backend

ยังไม่ใช่ระบบที่ผ่านกระบวนการขอความยินยอมที่ถูกต้องตามกฎหมายครบทุกขั้นตอน — **โปรดปรึกษาฝ่ายกฎหมาย/HR ก่อนนำไปใช้งานจริง**
(ระบบ MediaPipe ปิดฟีเจอร์ใบหน้าได้จากช่อง "ฟีเจอร์ใบหน้า" · ระบบ YOLOv8 ปิดได้ด้วย `FACE_ENGINE=off` ตอนเปิด yolo-backend)

## ข้อควรทราบเรื่องโมเดล AI และ license

ระบบ MediaPipe ใช้เฉพาะโมเดลที่ license เป็น Apache 2.0 (MediaPipe) หรือ MIT (face-api) ใช้ในซอฟต์แวร์เชิงพาณิชย์ปิดได้
รุ่น Pose เลือกได้ใน Dev Console (lite/full/heavy) — หน้ากล้องใช้ `lite` ค่าคงที่รุ่นอยู่ที่ `POSE_MODELS` ใน
`frontend/src/hooks/usePoseLandmarker.ts` (ต้องตรงกับรายการใน `frontend/scripts/setup-assets.mjs`)

ระบบ YOLOv8 **ต้องตรวจ license ก่อนใช้เชิงพาณิชย์**:
- `ultralytics` (YOLOv8) เป็น AGPL-3.0 — ซอฟต์แวร์ปิดต้องซื้อ Enterprise License จาก Ultralytics
- โมเดลใบหน้า InsightFace `buffalo_l` ใช้ได้เฉพาะงานวิจัยที่ไม่ใช่เชิงพาณิชย์ (ดู docstring ใน `yolo-backend/face_id.py`)
  ทางเลือกคือ YuNet + SFace จาก OpenCV Model Zoo ที่ license อนุญาตเชิงพาณิชย์ — ใช้ `FACE_ENGINE=sface`
  และวาง `face_detection_yunet_2023mar.onnx`, `face_recognition_sface_2021dec.onnx` ไว้ใน `yolo-backend/`
  (ค่าเริ่มต้น `FACE_ENGINE=auto` ใช้ InsightFace ถ้าติดตั้งไว้ ไม่งั้นใช้ SFace)

## แผนถัดไป (ยังไม่ได้ทำ)

- เลือกระบบเดียว (YOLOv8 หรือ MediaPipe) หลังทดลองใช้จริง แล้วเอาอีกระบบออก
- แจ้งเตือนภายนอกผ่าน LINE Messaging API + LINE Official Account (LINE Notify ปิดให้บริการไปแล้วตั้งแต่ 31 มี.ค. 2025)
- ปรับจูนเกณฑ์ท่านั่งจาก dataset จริง (หลายคน ครบทุก label)
- กำหนดสิทธิ์การเข้า Dev Console และ YOLO Console
- ส่งเหตุการณ์แบบ realtime ผ่าน WebSocket (`createWebSocketAlertReporter()` ใน `frontend/src/services/alertReporter.ts` เตรียมโครงไว้แล้ว)
