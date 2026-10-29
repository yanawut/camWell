# 09: Manual browser smoke — โหมด Workstation / Multi

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 09 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ requirement ของ Ticket 09: ค่าเริ่มต้นต้องเป็น Personal Workstation (สูงสุด 1 คน), ผู้ใช้สลับเป็น Multi (สูงสุด 4 คน) ได้จาก Settings, mode เดียวกันต้องถูกใช้กับทุก `CameraStage`, การเปลี่ยน mode ต้องทำให้ Pose Landmarker ของแต่ละกล้องโหลดใหม่ด้วย `numPoses` ที่ถูกต้อง และ face results ต้องถูกจำกัดตาม mode เดียวกัน

smoke นี้ **ไม่ใช่** HITL/accuracy campaign ของ Ticket 17 จึงไม่วัด precision/recall, ไม่ทดสอบหลายสิบคน/หลายสภาพแสง, ไม่ทำ endurance, ไม่ benchmark CPU/GPU/FPS เชิงตัวเลข และไม่วัด inference ms (เป็น scope Tickets 10–11 / Ticket 17)

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 09 มี browser integration ที่ unit test อย่างเดียวพิสูจน์ไม่ได้ครบดังนี้:

- หน้าใหม่ต้องเริ่มที่ radio **ใช้คนเดียว (Personal Workstation) — แนะนำ**
- ใน Workstation status line ของทุกกล้องต้องระบุสูงสุด **1 คน** และ Pose overlay ต้องเหลือไม่เกิน 1 คนหลัง tracking settle
- สลับเป็น Multi แล้วทุก `CameraStage` ต้องเข้า loading/reload และกลับมาทำงานโดย status line ระบุสูงสุด **4 คน**
- เมื่อมีอย่างน้อย 2 คนในภาพ Multi ต้องสามารถแสดงหลาย skeleton/หลาย person track ได้
- สลับ Multi → Workstation ขณะคนหลายคนยังอยู่ในภาพ ระบบต้องกลับมาเหลือ pose หลักไม่เกิน 1 คนหลัง model reload และ tracker เก่าหมดอายุ
- ถ้าเปิด face features ผล face overlay ต้องจำกัดตาม mode เดียวกัน: Workstation ไม่เกิน 1 กรอบ, Multi สามารถมีหลายกรอบ
- mode ต้องเป็น shared state: เมื่อมี 2 camera slots การกด radio ครั้งเดียวต้องเปลี่ยนทั้งสองกล้อง ไม่ใช่เฉพาะกล้องแรก
- การ reload model จากการเปลี่ยน mode ต้องไม่ทำให้ overlay/status ค้างถาวร, กล้องดำ, UI freeze หรือเกิด runtime error
- การเปลี่ยน mode **ไม่ควรสร้าง Alert/EventLog ใหม่ด้วยตัวมันเอง**; EventLog จะเพิ่มได้ก็ต่อเมื่อท่าทาง/ความเหนื่อยล้า/ระยะ/หกล้มเข้าเงื่อนไขจริง

สิ่งที่ **ไม่ใช่ scope ของ Ticket 09**:

- วัด pose FPS/CPU ก่อน-หลังหรือจำกัด pose ที่ ~12 FPS — Ticket 10
- แสดง/เปรียบเทียบ inference ms — Ticket 11
- ทดสอบความแม่นยำหลายระยะ หลายคน หลายสภาพแสง หรือ performance campaign — Ticket 17
- ทดสอบ cached skeleton ตอนสลับ local ↔ IP camera โดยเฉพาะ — Ticket 04
- ทดสอบ break timer ต่อกล้อง — Ticket 05
- ทดสอบ fall-left-frame โดยการจำลองหกล้มจริง — Ticket 06 / Ticket 17
- ทดสอบ upper-body accuracy, calibration, smoothing หรือ dataset recorder — Tickets 08, 12–16

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง **ไม่ใช้ WSL**

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

- Node: `v26.1.0`
- npm: `12.0.2`
- Browser: **Google Chrome desktop**
- Webcam:
  - Scenario 1–3 ใช้ **1 webcam** ได้ แต่ Scenario 2/3 ต้องมี **คนจริงอย่างน้อย 2 คนอยู่ในเฟรมพร้อมกัน**
  - เพื่อทำ Ticket 09 ให้ครบ requirement “mode เดียวกันใช้กับทุกกล้อง” ใน Scenario 4 ต้องมี **webcam อย่างน้อย 2 ตัวที่เป็น video input คนละอุปกรณ์**
- แนะนำให้กล้องอยู่ด้านหน้าหรือเฉียงหน้าเล็กน้อย เห็นศีรษะและไหล่ของคนที่ทดสอบชัด
- แสงควรสม่ำเสมอจากด้านหน้าหรือด้านข้าง หลีกเลี่ยงย้อนแสงแรง

จาก root repo:

```bash
npm install
npm run dev
```

เปิด URL:

```text
http://localhost:5173/
```

ถ้า Vite เลือก port อื่นเพราะ `5173` ถูกใช้งาน ให้ใช้ URL ที่ terminal แสดงจริงและบันทึก URL นั้นในตารางผลท้ายไฟล์

### Backend

Scenario 1, 2 และ 4 ใช้ pose เท่านั้น ให้ **ไม่ต้องรัน `backend/`** และปิด face features

Scenario 3 ตรวจ requirement เรื่อง face-result limit จึงให้เปิด face features และ **รัน backend** เพื่อไม่ให้ identity employee-list request รบกวน Console:

```bash
cd backend
npm install
npm run dev
```

backend ใช้ URL:

```text
http://localhost:4000
```

ไม่ต้องลงทะเบียน/ลบ employee และไม่ต้องใช้ identity เป็น acceptance criterion; backend มีไว้ให้ face-feature scenario ทำงานในสภาพปกติและ Console สะอาด

> สำหรับ Scenario 1/2/4 ถ้าเปิดหน้าโดยไม่ได้รัน backend แล้ว Chrome แสดง startup network failure ไป `localhost:4000/api/employees` จากการโหลดรายชื่อเดิม ให้รอหน้าและ pose model พร้อมแล้ว **Clear Console ก่อนเริ่ม scenario** และไม่นับ startup request ที่เกิดก่อน Clear เป็นผลของ Ticket 09 แต่หลัง Clear ต้องไม่มี error ใหม่จากการสลับ mode/pose pipeline

## SettingsPanel ที่ใช้

### Scenario 1, 2 และ 4 — pose-only

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| โหมดการตรวจจับ | ตาม scenario: Workstation หรือ Multi |
| มุมคอที่ยอมรับได้ | **45°** |
| มุมลำตัวที่ยอมรับได้ | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **30°** |
| นั่งท่าไม่ดีต่อเนื่องก่อนแจ้งเตือน | **30 s** |
| break reminder | คงค่าเดิม; scenario ทั้งหมดสั้นกว่า 15 นาที |
| fall thresholds | คงค่าเดิม และหลีกเลี่ยงการย่อตัว/ร่วงตัวเร็ว |

ตั้ง posture threshold สูงและ sustained 30 s เพื่อไม่ให้ alert จากท่าทางมารบกวนการสังเกต mode

### Scenario 3 — face-result limit

ใช้ค่าด้านบนเหมือนเดิม แต่เปลี่ยน:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **เปิด** |
| ความง่วง/ตาหลับต่อเนื่องก่อนเตือน | **10 s** |
| จำนวนหาวที่ถือว่าถี่ | **8 ครั้ง** |
| โหมดการตรวจจับ | สลับ Workstation ↔ Multi ตามขั้นตอน |

Scenario นี้สั้นและให้ผู้ทดสอบมองกล้องตามปกติ ไม่หลับตาค้าง/หาว/เข้าใกล้กล้องรวดเร็ว เพื่อหลีกเลี่ยง alert ที่ไม่เกี่ยวกับ Ticket 09

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ตรวจ Site settings ของ origin ให้ **Camera = Allow**
3. เลือก **กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)**
4. กด **รีเฟรชรายชื่อกล้อง** ถ้ารายชื่ออุปกรณ์ยังไม่ครบ
5. เปิด DevTools → **Console**
6. รอ `กำลังโหลดโมเดล Pose Landmarker...` หาย และ skeleton เริ่มติดตามก่อนเริ่ม
7. หลัง startup/model load เสร็จ ให้กด **Clear Console**
8. จดจำนวน row ใน EventLog ก่อนเริ่มแต่ละ scenario
9. ให้คนทดสอบนั่ง/ยืนห่างกล้องประมาณ 0.7–1.5 เมตร โดยเห็นศีรษะและไหล่ชัด; ถ้าต้องมี 2 คนให้ยืน/นั่งแยกกันซ้าย-ขวา ไม่ซ้อนตัวกัน
10. รอประมาณ **3–5 วินาที** หลังคนเข้าหรือออกจากเฟรมให้ pose tracking settle
11. ระหว่างกดเปลี่ยน mode อย่าเปลี่ยน camera source, reload หน้า หรือสลับ tab ไป background
12. หลัง model reload ให้ขยับศีรษะ/ไหล่เล็กน้อยเพื่อยืนยันว่า skeleton เป็นผลสด ไม่ใช่ภาพค้าง
13. Console หลัง Clear ต้องไม่มี red uncaught/runtime/React/MediaPipe error ที่เกิดจากขั้นตอนของ scenario

> Tracker เก็บ person track เก่าไว้ประมาณ 4 วินาทีก่อนลบ ดังนั้นหลังสลับ Multi → Workstation อาจเห็น people list/count เก่าค้างชั่วคราวได้ ให้รอ **5 วินาทีหลัง pose model กลับ ready** ก่อนตัดสินจำนวนคนสุดท้าย การค้างเกินช่วงนี้หรือ skeleton หลายคนยังคงอัปเดตต่อใน Workstation ถือว่า FAIL

---

## Scenario 1 — ค่าเริ่มต้นต้องเป็น Personal Workstation และตรวจได้สูงสุด 1 คน

**เป้าหมาย:** พิสูจน์ default mode และ browser wiring พื้นฐานโดยไม่พึ่ง face/backend

### เตรียมก่อนเริ่ม

1. ใช้ camera slot เดียว; ถ้ามี slot ที่ 2 ค้างจาก localStorage ให้กด **ลบกล้องนี้**
2. ปิด face features และ sound
3. **Reload หน้าเว็บ 1 ครั้ง** เพื่อพิสูจน์ค่าเริ่มต้นของ state
4. หลัง reload อนุญาต Camera ถ้า Chrome ถามอีกครั้ง
5. ให้คนทดสอบ 1 คนนั่งตรงกลางภาพ
6. รอ model พร้อม, Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ดูหัวข้อ **โหมดการตรวจจับ**
2. ตรวจ radio ว่า **ใช้คนเดียว (Personal Workstation) — แนะนำ** ถูกเลือกอยู่โดยไม่ต้องกด
3. ดู status line ใต้กล้อง
4. นั่งนิ่งตรงกลางเฟรม **5 วินาที**
5. ขยับศีรษะและไหล่ซ้าย-ขวาช้า ๆ ต่ออีก **5 วินาที**
6. ดู pose skeleton/overlay ตลอดช่วง
7. ตรวจ alert banner และ EventLog
8. ตรวจ Console

### Expected result

- radio Workstation ถูกเลือกเป็นค่าเริ่มต้น
- status line เป็นรูปแบบ `ตรวจพบในเฟรม: ... คน (รองรับสูงสุด 1 คน)`
- เมื่อมีคนเดียวและ pose signal ดี ต้อง settle ที่ประมาณ `ตรวจพบในเฟรม: 1 คน`
- skeleton ติดตามคนนี้ต่อเนื่องและขยับตาม ไม่ freeze
- ไม่มี alert/banner/EventLog ใหม่ที่เกิดเพียงเพราะ Workstation mode
- Console ไม่มี runtime/React/MediaPipe error ใหม่หลัง Clear

### PASS

PASS เมื่อ default radio = Workstation, status max = 1, pose ใช้งานได้จริงต่อเนื่อง และไม่มี error/event แปลกจาก mode

### FAIL

FAIL ถ้าเกิดอย่างใดอย่างหนึ่ง:

- reload แล้ว default ไป Multi
- status line ยังเขียนสูงสุด 4 คน
- pose model ไม่พร้อม/overlay ไม่กลับมาทำงาน
- mode ทำให้เกิด alert/EventLog เอง
- Console มี error ใหม่ที่สัมพันธ์กับ pose/mode

---

## Scenario 2 — สลับ Workstation ↔ Multi ขณะมี 2 คน ต้อง reload model และเปลี่ยนจำนวน pose จริง

**เป้าหมาย:** พิสูจน์ requirement หลักของ Ticket 09 และ regression เรื่อง stale mode/overlay ที่ automated pure test มองไม่เห็น

### เตรียมก่อนเริ่ม

1. camera slot เดียว
2. face features = ปิด
3. ให้ **2 คน** อยู่ในภาพพร้อมกัน แยกซ้าย/ขวา ไม่ยืนซ้อนกัน
4. ให้ทั้งคู่เห็นศีรษะและไหล่ชัดและอยู่นิ่งพอสมควร
5. เริ่มจาก **Workstation**
6. รอ model ready + tracking settle 5 วินาที
7. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ใน Workstation ให้ทั้ง 2 คนอยู่ในเฟรมต่อเนื่อง **5 วินาที**
2. ตรวจว่า overlay หลัง settle มี pose/skeleton ที่ active ไม่เกิน 1 คน และ status line ระบุสูงสุด 1
3. กด radio **กล้องเดียวหลายคน (Multi-person)**
4. ทันทีหลังคลิก มองบริเวณกล้องหา banner `กำลังโหลดโมเดล Pose Landmarker...`
5. ระหว่าง loading อย่ากดอะไรเพิ่ม
6. รอจน loading banner หาย แล้วรอ tracking เพิ่มอีก **5 วินาที**
7. ให้ทั้ง 2 คนขยับแขน/ไหล่เบา ๆ คนละจังหวะเพื่อแยกว่าเป็น skeleton สดของคนละคน
8. ตรวจ status line ต้องระบุสูงสุด 4 และควรพบ 2 คนเมื่อ pose ทั้งสองชัด
9. ค้าง Multi ต่ออีก **5 วินาที**
10. กดกลับ radio **ใช้คนเดียว (Personal Workstation)**
11. สังเกต loading banner อีกรอบ
12. รอ model ready แล้วรออีก **5 วินาที** ให้ tracker เก่าหมดอายุ
13. ทั้ง 2 คนยังคงอยู่ในเฟรมและขยับเบา ๆ
14. ตรวจ overlay/status/people list
15. ตรวจ EventLog และ Console

### Expected result

Workstation ก่อนสลับ:

- status max = 1
- active pose overlay ไม่เกิน 1 คนหลัง settle

เมื่อกด Multi:

- เห็น loading banner อย่างน้อยชั่วครู่; ถ้าเร็วมากจนมองไม่ทัน ให้ทำ toggle ซ้ำหนึ่งรอบและจับตาบริเวณ banner
- model กลับ ready โดยไม่ต้อง reload หน้า
- status line เปลี่ยนเป็น `รองรับสูงสุด 4 คน`
- เมื่อสองคนอยู่แยกกันชัด ระบบสามารถมี skeleton/person track มากกว่า 1 คนได้
- overlay หลัง ready เป็นภาพสด ไม่ค้างจากก่อนสลับ

เมื่อกลับ Workstation:

- มี loading/reload cycle อีกครั้ง
- status lineกลับเป็น `รองรับสูงสุด 1 คน`
- หลัง model ready + รอ tracker cleanup 5 วินาที ต้องไม่มี active skeleton หลายคนต่อเนื่อง; pose result ใหม่ต้องไม่เกิน 1 คน
- UI ไม่ค้าง/ไม่ดำ/ไม่หยุดอัปเดต
- mode toggle ไม่สร้าง alert/EventLog ใหม่ด้วยตัวมันเอง
- Console ไม่มี runtime error ใหม่

### PASS

PASS เมื่อทั้งสองทิศของการสลับเปลี่ยน max 1↔4, pose model recover หลัง reload และ behavior คนเดียว/หลายคนตรง mode หลัง settle

### FAIL

FAIL ถ้า:

- radio เปลี่ยนแต่ status max ไม่เปลี่ยน
- เปลี่ยน mode แล้ว model ไม่กลับ ready
- Multi ยังตรวจได้เพียงคนเดียวทั้งที่ก่อน/หลังจัด framing ชัดและลอง 2–3 ครั้ง
- Workstation ยังมี skeleton หลายคนที่อัปเดตต่อหลัง model ready + 5 วินาที
- overlay freeze/กล้องดำถาวร หรือจำเป็นต้อง reload หน้าเพื่อให้กลับมาทำงาน
- mode toggle สร้าง EventLog/alert เอง
- Console มี exception/error ใหม่จาก mode/model lifecycle

> ถ้าคนที่ 2 หลุดเพราะยืนชิดขอบ/ถูกบัง ให้จัดตำแหน่งใหม่แล้วรันทวนก่อนตัดสิน FAIL เพราะ smoke นี้ไม่ใช่ accuracy benchmark

---

## Scenario 3 — Face results ต้องถูกจำกัดตาม Workstation / Multi

**เป้าหมาย:** พิสูจน์ browser wiring ของ face pipeline ซึ่งใช้ `propsRef.current.detectionMode`; pure tests พิสูจน์ exact sorting/limit แต่ไม่พิสูจน์ว่า async face detection อ่าน mode ล่าสุดจริง

### เตรียมก่อนเริ่ม

1. รัน backend ที่ `http://localhost:4000`
2. เปิด/Reload frontend แล้วตรวจว่า backend startup request ไม่ error
3. ใช้ camera slot เดียว
4. เปิด **ฟีเจอร์เกี่ยวกับใบหน้า**
5. ใช้ **2 คน** ในภาพพร้อมกัน โดยให้ใบหน้าทั้งสองหันเข้ากล้องและมีแสงพอ
6. ให้คนหนึ่งอยู่ใกล้กล้องกว่าเล็กน้อยเพื่อให้กรอบหน้าใหญ่กว่าอย่างเห็นได้ชัด
7. ไม่ต้องลงทะเบียน identity และไม่ต้องกด Calibrate
8. เริ่มจาก Workstation; รอ pose/face model พร้อมอย่างน้อย **5 วินาที**
9. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ให้ทั้งสองคนมองกล้องนิ่ง ๆ **5 วินาที**
2. ใน Workstation นับ **กรอบใบหน้าสีเขียว** บน overlay
3. ตรวจ status line max = 1
4. กด Multi
5. รอ Pose Landmarker reload เสร็จ แล้วรอ face throttle ต่ออีก **1–2 วินาที**
6. ให้ทั้งสองคนยังมองกล้องชัด
7. นับกรอบใบหน้าสีเขียวอีกครั้ง
8. ค้าง Multi **5 วินาที**
9. กดกลับ Workstation
10. รอ reload + face detection รอบใหม่ **2 วินาที**
11. นับกรอบหน้าอีกครั้ง
12. ตรวจ EventLog และ Console

### Expected result

- Workstation: face overlay แสดง **ไม่เกิน 1 กรอบ**
- โดยทั่วไปกรอบที่เหลือควรเป็นใบหน้าที่ใหญ่/ใกล้กล้องที่สุด แต่การเลือก exact largest ถูกพิสูจน์หลักด้วย Vitest ไม่ต้องใช้สายตาตัดสิน pixel-by-pixel
- Multi: ถ้า face detector เห็นสองหน้าได้ชัด ต้องสามารถแสดง **2 กรอบ** ได้ และไม่เกิน 4 ตาม requirement
- กลับ Workstation: ภายใน face detection รอบถัดไป (~400 ms; เผื่อสังเกต 2 s) ต้องกลับมาไม่เกิน 1 กรอบ
- ไม่ต้องมีชื่อ identity; ไม่ต้องเพิ่ม/ลบ employee
- ไม่มี fatigue/distance/identity alert ที่เกิดจาก mode toggle เอง
- Console ไม่มี face-api/backend/runtime error ใหม่

### PASS

PASS เมื่อ face overlay เปลี่ยน limit ตาม mode และอ่าน mode ล่าสุดหลัง toggle โดยไม่ต้อง reload frontend

### FAIL

FAIL ถ้า:

- Workstation แสดงหลาย face boxes ต่อเนื่อง
- Multi ตรวจสองหน้าได้แต่ยังถูกจำกัดหนึ่งกรอบตลอดหลังลอง framing ที่ดี 2–3 ครั้ง
- กลับ Workstation แล้ว face boxes หลายกรอบค้างเกิน 2 วินาที
- เกิด stale-mode behavior เช่น radio/status เป็น Workstation แต่ face pipeline ยังทำเหมือน Multi
- Console มี error ใหม่จาก face detection/backend ระหว่าง scenario

---

## Scenario 4 — Mode เดียวกันต้องใช้กับทุก CameraStage พร้อมกัน

**เป้าหมาย:** พิสูจน์ shared state ใน `App` และ requirement ที่ mode เดียวควบคุมทุกกล้อง

### Prerequisite เพิ่มเติม

- ต้องมี **webcam อย่างน้อย 2 ตัว** ที่ Chrome เห็นเป็นคนละ video input
- ถ้า driver/เครื่องเปิดสองกล้องพร้อมกันไม่ได้ ให้บันทึก **BLOCKED — hardware/driver cannot open two cameras concurrently** ไม่ใช่ FAIL ของ Ticket 09

### เตรียมก่อนเริ่ม

1. ปิด face features และ sound
2. ใช้ Workstation เป็น mode เริ่มต้น
3. กด `+ เพิ่มกล้อง (สูงสุด 2 ตัวพร้อมกัน)`
4. ใน card กล้อง 1 เลือก webcam ตัวที่ 1
5. ใน card กล้อง 2 เลือก webcam ตัวที่ 2
6. วางกล้องทั้งสองให้เห็นคนทดสอบอย่างน้อย 1 คนชัด
7. รอ Pose Landmarker ของทั้งสองกล้องพร้อม
8. ตรวจว่าทั้งสองกล้องมี status line ของตนเอง
9. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ใน Workstation ตรวจ status line ของ **กล้อง 1 และกล้อง 2**
2. ทั้งสองต้องเขียน `รองรับสูงสุด 1 คน`
3. ขยับตัวช้า ๆ **5 วินาที** เพื่อยืนยัน overlay ทั้งสองกล้อง active
4. กด radio Multi **เพียงครั้งเดียว** ใน SettingsPanel
5. สังเกต camera card ทั้งสองระหว่าง 2–3 วินาทีแรก
6. ต้องเห็นทั้งสองกล้องผ่านช่วง loading/re-initialization (banner อาจหายเร็วไม่พร้อมกัน)
7. รอทั้งสองกลับ ready
8. ตรวจ status line ของทั้งสอง ต้องเป็น `รองรับสูงสุด 4 คน`
9. ขยับตัวอีก **5 วินาที** ตรวจ overlay ของทั้งสองกล้องยังสด
10. กด Workstation เพียงครั้งเดียว
11. รอทั้งสองกล้องกลับ ready + อีก 5 วินาที
12. ตรวจทั้งสอง status line กลับเป็นสูงสุด 1
13. ตรวจ EventLog และ Console

### Expected result

- ไม่มี radio แยกต่อกล้อง; SettingsPanel มี mode เดียว
- คลิกครั้งเดียวแล้ว **ทั้งสอง CameraStage** เปลี่ยน max พร้อมกัน
- ทั้งสอง model reload/recover โดยไม่ต้อง reload หน้า
- กล้องหนึ่งต้องไม่ค้างที่ max 4 ขณะที่อีกกล้องเป็น max 1
- overlay ทั้งสองกลับมาทำงานหลัง reload
- การเปลี่ยน mode ไม่ลบ camera slot, ไม่เปลี่ยน selected device และไม่ทำให้กล้องใดกล้องหนึ่งหยุดถาวร
- EventLog ไม่เพิ่มเพราะ mode toggle เพียงอย่างเดียว
- Console ไม่มี runtime/React/MediaPipe error ใหม่

### PASS

PASS เมื่อ mode shared ข้าม 2 CameraStage จริงและทั้งสอง reload/recover ตามค่าที่เลือก

### FAIL

FAIL ถ้า:

- เปลี่ยนเฉพาะกล้องเดียว
- status max ของสองกล้องไม่ตรงกันหลัง settle
- กล้องหนึ่งไม่ recover จาก model reload
- selected webcam ถูก reset/สลับเองจากการเปลี่ยน mode
- UI/overlay กล้องใดกล้องหนึ่ง freeze ถาวร
- Console มี error ใหม่จากการเปลี่ยน mode

---

## Regression integration checks ระหว่าง Scenario 1–4

ให้บันทึกถ้าพบ แม้ไม่ใช่ acceptance หลักแบบตัวเลข:

| Regression risk | สิ่งที่ต้องสังเกต |
|---|---|
| stale closure ใน rAF/async face pipeline | หลังเปลี่ยน radio ทุกกล้อง/face pipeline ต้องใช้ mode ล่าสุด ไม่ค้าง mode เดิม |
| Pose model lifecycle พังเมื่อ dependency เปลี่ยน | มี loading/recovery และ model กลับตรวจ pose ได้ทุกครั้ง |
| cached overlay/overlay freeze | หลัง reload skeleton ต้องกลับเป็นผลสด; ห้ามค้างภาพเดิมถาวร |
| tracker เก่าจาก Multi → Workstation | เผื่อ cleanup 5 s แล้วจำนวน/overlay ใหม่ต้องสอดคล้อง Workstation |
| mode toggle ทำให้ React state อื่นเสีย | camera source/device, settings อื่น และ camera slots ต้องไม่ reset เอง |
| alert/event side effect | การกด mode อย่างเดียวต้องไม่เพิ่ม EventLog หรือเปิด alert banner |
| gross responsiveness regression | ระหว่าง toggle หน้าเว็บยังคลิก/scroll ได้และกลับ responsive หลัง model ready; **ไม่ต้องวัด FPS/CPU ตัวเลข** |
| multi-camera wiring | mode เดียวต้องเปลี่ยนทั้งสองกล้อง ไม่มีค่าค้างคนละ mode |
| runtime regressions | Console หลัง Clear ไม่มี uncaught exception / React / MediaPipe / face-api error จาก scenario |

### สิ่งที่ไม่ต้องทำเป็น regression ใน Ticket 09

- ไม่ต้องสลับ local ↔ IP source เพื่อพิสูจน์ stale skeleton โดยเฉพาะ — Ticket 04
- ไม่ต้องจับเวลา FPS หรือวัด CPU/GPU — Ticket 10/17
- ไม่ต้องอ่าน inference ms — Ticket 11
- ไม่ต้องให้ 4 คนจริงมายืนพร้อมกันเพื่อพิสูจน์ exact upper bound = 4; ใช้ Vitest สำหรับ boundary นี้
- ไม่ต้องทดสอบ identity matching ว่าชื่อพนักงานถูกคน — อยู่นอก Ticket 09
- ไม่ต้องจำลองหกล้ม/หาว/ง่วง/นั่งผิดเพื่อสร้าง alerts

---

## กรณีที่ทำด้วยมือไม่ได้หรือไม่ควรบังคับทำ

### 1. Mapping ของ mode ต้องเป็น 1 และ 4 แบบ exact

ไม่ควรใช้การนับคนจริงเป็นหลักฐานเพียงอย่างเดียว เพราะ detector อาจพลาดตาม framing/visibility

พิสูจน์ด้วย:

- ไฟล์: `src/lib/multiPerson.test.ts`
- test: **`uses one person for workstation mode`**
- test: **`uses four people for multi mode`**

manual Scenario 1–4 พิสูจน์เฉพาะว่า mapping นี้ถูก wire เข้ากับ browser จริง

### 2. Workstation ต้องเลือก detection ที่ใหญ่ที่สุดและห้าม mutate input

การบังคับให้คนสองคนมีกรอบหน้าขนาดต่างกันแบบ exact แล้วตรวจ array ภายในจาก UI ไม่ deterministic และไม่ควรเพิ่ม debug codeเพื่อ smoke

พิสูจน์ด้วย:

- ไฟล์: `src/lib/multiPerson.test.ts`
- test: **`keeps only the largest detection in workstation mode without mutating the input`**

Scenario 3 ใช้เพียง behavioral proxy ว่า Workstation แสดงไม่เกิน 1 face box

### 3. Multi ต้องตัดผลสูงสุด 4 เมื่อ input มีมากกว่า 4

ไม่ควรบังคับหา **5 คนจริง** มายืนหน้ากล้องเพื่อ smoke และจะกลายเป็น HITL/accuracy test เกิน scope

พิสูจน์ด้วย:

- ไฟล์: `src/lib/multiPerson.test.ts`
- test: **`keeps at most the four largest detections in multi mode`**

test ใช้ 5 detections และยืนยันว่าเหลือ 4 รายการที่ priority สูงสุด

### 4. timing boundary ที่ `t = 0` ของ sustained state machine

ไม่เกี่ยวกับ mode โดยตรงและ browser สร้าง timestamp exact `0` แบบ deterministic ไม่ได้ จึงห้ามใช้ stopwatch มาพิสูจน์แทน

พิสูจน์ไว้แล้วด้วย:

- `src/lib/sustainedAlertMachine.test.ts`
- **`alerts once when a bad posture starting at t=0 reaches the sustained duration`**
- **`preserves zero-valued signal and recovery timestamps`**

Ticket 09 smoke เพียงตรวจว่า mode toggle ไม่สร้าง/ทำให้ alert flow พัง ไม่ทดสอบ millisecond boundary ซ้ำ

### 5. การยืนยัน `useEffect` มี dependency `[numPoses]` ในระดับ source

นี่เป็นโครงสร้าง React ที่ user-facing UI มอง dependency array โดยตรงไม่ได้ และ build/lint ตรวจ syntax/type แล้ว

manual proof ที่เหมาะสมคือ Scenario 2/4: สลับ 1↔4 แล้วเห็น loading/reload + behavior หลัง ready เปลี่ยนตาม mode โดยไม่ reload หน้า

---

## เกณฑ์สรุปรวมของ Ticket 09

Manual browser smoke ของ Ticket 09 = **PASS** เมื่อ:

- Scenario 1 ผ่าน: reload แล้ว default Workstation, max 1, pose ทำงานปกติ
- Scenario 2 ผ่าน: Workstation ↔ Multi ทำให้ model reload และ behavior คนเดียว/หลายคนเปลี่ยนตาม mode
- Scenario 3 ผ่าน: face results ถูกจำกัดตาม mode โดย async face pipeline ไม่ใช้ stale mode
- Scenario 4 ผ่าน: mode เดียวมีผลกับ CameraStage สองกล้องพร้อมกัน
- ไม่มี mode-toggle-induced alert/EventLog
- overlay/status recover หลังทุก reload และไม่มี gross freeze
- Console หลัง Clear ไม่มี error ใหม่จาก mode/pose/face lifecycle
- ไม่ใช้ FPS/inference benchmark หรือ repeated accuracy trial เป็นเงื่อนไขผ่าน Ticket 09

ถ้า Scenario 4 ทำไม่ได้เพราะมี webcam เพียงตัวเดียว ให้สรุป Ticket เป็น **BLOCKED / INCOMPLETE MANUAL VERIFICATION** ไม่ใช่ PASS เพราะ requirement “ใช้ร่วมกันทุกกล้อง” ยังไม่ได้พิสูจน์บน browser จริง

---

## ตารางสรุปผล

| Scenario | ผล (PASS / FAIL / BLOCKED / INVALID / NOT RUN) | วันที่ทดสอบ | Browser / OS | กล้องที่ใช้ | Vite URL | EventLog / Console / หมายเหตุ |
|---|---|---|---|---|---|---|
| 1 — Default Workstation → max 1 + pose ปกติ | NOT RUN |  |  |  |  |  |
| 2 — Workstation ↔ Multi กับ 2 คน → reload + 1/หลาย pose | NOT RUN |  |  |  |  |  |
| 3 — Face result limit ตาม Workstation / Multi | NOT RUN |  |  |  |  |  |
| 4 — Shared mode บน 2 CameraStage / 2 webcams | NOT RUN |  |  |  |  |  |
| **สรุป Ticket 09** | **NOT RUN** |  |  |  |  |  |

### ข้อมูล environment ของรอบที่ทดสอบ

- วันที่ทดสอบ:
- ผู้ทดสอบ:
- Browser + version:
- OS + version:
- Webcam 1 ยี่ห้อ/รุ่น:
- Webcam 2 ยี่ห้อ/รุ่น:
- จำนวนผู้ช่วยที่ใช้ใน Scenario 2/3:
- Node: `v26.1.0`
- npm: `12.0.2`
- Vite URL:
- Backend URL สำหรับ Scenario 3: `http://localhost:4000`
- Camera permission: Allow / Block
- จำนวน camera slot:
- Face features Scenario 1/2/4: ปิด
- Face features Scenario 3: เปิด
- Detection mode ที่ทดสอบ: Workstation / Multi
- Console error ที่พบ (ถ้ามี):
- EventLog เพิ่มจาก mode toggle หรือไม่:
- หมายเหตุเรื่อง loading banner / model reload:
- หมายเหตุเพิ่มเติม:
