# camwell-backend

Phase 2 backend เล็กๆ ของ Camwell — ทำหน้าที่เดียว: เก็บข้อมูลระบุตัวตนพนักงาน (ชื่อ + face descriptor จาก
@vladmandic/face-api) ลง SQLite ไฟล์เดียว และจับคู่ใบหน้าแทนฝั่ง browser เพื่อไม่ให้ต้องส่ง biometric data
ของทุกคนไปให้ทุกเครื่อง/ทุกกล้องในออฟฟิศถืออยู่ในเบราว์เซอร์เหมือน Phase 1

ไม่มี backend ตัวนี้แอปก็ยังใช้ตรวจจับท่านั่ง/ความเหนื่อยล้า/ระยะห่างจอ/หกล้มได้ปกติ (ฟีเจอร์พวกนั้นเป็น local
AI ล้วนไม่พึ่ง backend) — backend ตัวนี้จำเป็นเฉพาะฟีเจอร์ "จำหน้า/ระบุตัวตนพนักงาน" เท่านั้น

## สแต็กที่ใช้

- Node.js + Express 5 + TypeScript
- SQLite ผ่าน `node:sqlite` ที่มากับ Node.js เอง (ไม่ใช่ native addon แยกต่างหากแบบ better-sqlite3 — เลือก
  แบบนี้เพื่อเลี่ยงปัญหา native binding คนละแพลตฟอร์มที่เจอมาแล้วกับ oxlint/rolldown ฝั่ง frontend) ต้องการ
  Node.js **22.5 ขึ้นไป** (เครื่องนี้มี Node 24 อยู่แล้ว ใช้ได้เลย)

## วิธีรัน (ครั้งแรก)

```bash
cd backend
npm install
cp .env.example .env    # ปรับค่าตามจริงถ้าต้องการ (พอร์ต, path ไฟล์ DB, origin ที่อนุญาต)
npm run dev             # รันแบบ dev (auto-reload) ที่ http://localhost:4000
```

ไฟล์ฐานข้อมูล SQLite จะถูกสร้างอัตโนมัติที่ `./data/camwell.sqlite` (ตามค่าใน `.env`) พร้อมตารางทั้งหมดตอน
เริ่มเซิร์ฟเวอร์ครั้งแรก ไม่ต้องรัน migration เองแยก

> ⚠️ ต้องรัน `npm install` บนเครื่อง Windows ของคุณเองโดยตรง (ไม่ใช่ผ่าน Claude) เหมือนฝั่ง frontend —
> เพราะพอร์ตที่สร้างตอน install จะผูกกับแพลตฟอร์มที่รัน

## Build สำหรับ production

```bash
npm run build   # คอมไพล์ TypeScript -> dist/
npm start       # รัน dist/index.js
```

## API ทั้งหมด

| Method | Path                  | ใช้ทำอะไร |
|--------|-----------------------|-----------|
| GET    | `/health`              | เช็คว่าเซิร์ฟเวอร์รันอยู่ |
| GET    | `/api/employees`       | รายชื่อพนักงานที่ลงทะเบียนไว้ (ไม่มี descriptor ติดมาด้วย) |
| POST   | `/api/employees`       | ลงทะเบียนพนักงานใหม่ — body: `{ name, descriptor: number[], consentGiven: true }` |
| DELETE | `/api/employees/:id`   | ลบพนักงาน + descriptor ของคนนั้นทั้งหมด |
| PATCH  | `/api/employees/:id`   | เปลี่ยนชื่อ — body: `{ name, consentGiven? }` (`consentGiven: true` บันทึกความยินยอมให้คนที่ลงทะเบียนอัตโนมัติ) |
| POST   | `/api/employees/identify` | ส่ง `{ descriptor: number[], autoEnroll?: boolean }` ไปหาว่าตรงกับใครที่ลงทะเบียนไว้ไหม — ถ้า `autoEnroll: true` และไม่ตรงกับใคร จะลงทะเบียนเป็นคนใหม่ชื่อ "คนที่ N" (เลขรันต่อไปเรื่อยๆ ไม่ใช้เลขซ้ำแม้ลบคนไปแล้ว) แล้วคืนคนนั้นใน `created` |
| GET    | `/api/presence?limit=50` | บันทึกการเข้า-ออกล่าสุด (ใคร / กล้องไหน / เข้า / ออก) |
| POST   | `/api/presence`        | เปิดช่วงเข้า — body: `{ employeeId, personName, cameraId, cameraLabel, startedAt? }` |
| POST   | `/api/presence/:id/end` | ปิดช่วง (ออก) — body: `{ endedAt? }` |
| GET    | `/api/alerts?limit=100&employeeId=` | เหตุการณ์แจ้งเตือนย้อนหลัง กรองรายพนักงานได้ |
| POST   | `/api/alerts`          | บันทึก/อัปเดตเหตุการณ์แจ้งเตือน (AlertEvent + `employeeId`, `cameraId`) — ส่ง id เดิมซ้ำตอนจบเหตุการณ์ |

> ⚠️ "ลงทะเบียนอัตโนมัติ" เก็บ face descriptor ของคนที่ยังไม่ได้ให้ความยินยอม (`consentGivenAt = null`) — ก่อนใช้
> งานจริงต้องมีกระบวนการแจ้ง/ขอความยินยอมที่ครอบคลุมกรณีนี้ (เช่น ป้ายแจ้งหน้าพื้นที่ + ให้ยืนยันในหน้าจอภายหลัง)

`consentGiven` ต้องเป็น `true` เสมอถึงจะลงทะเบียนได้ — ฝั่ง frontend บังคับติ๊กยืนยันว่าขอความยินยอมจาก
พนักงานแล้วก่อนปุ่ม "ลงทะเบียนใบหน้า" จะกดได้ (ดูรายละเอียด PDPA เพิ่มเติมใน `src/types/identity.ts` ของ
frontend)

## ข้อควรระวัง PDPA

Face descriptor เป็นข้อมูลชีวภาพ (biometric data) ถือเป็นข้อมูลอ่อนไหวภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
ก่อนใช้งานจริงกับพนักงานควรปรึกษาฝ่ายกฎหมาย/HR เรื่อง: การขอความยินยอมที่ถูกต้อง, การแจ้งวัตถุประสงค์การใช้
ข้อมูล, สิทธิ์ขอลบข้อมูล (มี endpoint `DELETE /api/employees/:id` รองรับอยู่แล้ว), และการเข้ารหัส/จำกัดสิทธิ์
เข้าถึงไฟล์ฐานข้อมูล SQLite บนเซิร์ฟเวอร์จริง
