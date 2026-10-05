# 16: Manual browser smoke — Dataset Recorder เฉพาะโหมด dev

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 16 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะสิ่งที่ unit test/build gate มองไม่เห็นครบ: แผง Dataset Recorder ใน dev UI, start/stop/count/clear/download flow, เงื่อนไขบันทึกเมื่อมีคนเดียวในเฟรม, การรวมตัวอย่างจากหลายกล้องเข้า singleton เดียว, และ regression ต่อ rAF/overlay/status line ระหว่างเปิด recorder

smoke นี้ **ไม่ทำซ้ำ Ticket 17 (HITL)**: ไม่เปิด JSON แล้วไล่ตรวจทุก field ของตัวอย่างจริง, ไม่คำนวณมุมย้อนกลับจาก landmarks, ไม่ทำ accuracy campaign หลายท่า/หลายแสง และไม่ benchmark FPS/CPU/inference time เชิงตัวเลข

---

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 16 มี browser integration ที่ automated test อย่างเดียวมองไม่เห็นครบดังนี้:

- เมื่อรัน Vite dev server ต้องเห็นแผง **Dataset Recorder (สำหรับนักพัฒนา)** ใต้ EventLog
- dropdown ต้องมี label ครบ `GOOD`, `FORWARD_HEAD`, `SLOUCH`, `LEAN_LEFT`, `LEAN_RIGHT`
- Start/Stop ต้องเปลี่ยนสถานะ recorder จริง: ตอนมีคนเดียว count เพิ่ม, หลัง Stop count ต้องหยุด
- Clear ต้องล้าง count และต้องกดไม่ได้ขณะกำลังบันทึก
- Export ต้องเริ่มดาวน์โหลดไฟล์ `.json` ได้จริงเมื่อมีตัวอย่าง
- ขณะ recorder ทำงาน pose overlay, status line, people count และ EventLog ต้องไม่ freeze/กระพริบ/ค้าง
- เมื่อกล้องหนึ่งตรวจพบ 0 คน count ต้องไม่เพิ่ม
- เมื่อกล้องหนึ่งตรวจพบ 2 คนแบบคงที่ในโหมด Multi-person count ต้องไม่เพิ่ม; เมื่อกลับมาเหลือ 1 คน count ต้องเพิ่มต่อ
- เมื่อเปิดกล้อง 2 ตัว แต่ละ CameraStage ต้องสามารถเพิ่มตัวอย่างเข้า count เดียวกันได้โดยไม่ reset/แยก count
- production preview ต้องไม่มี Dataset Recorder panel และ pose UI ปกติต้องยังทำงาน

สิ่งที่ **ไม่ใช่ scope ของ smoke นี้** และเก็บไว้ Ticket 17:

- เปิดไฟล์ JSON แล้วตรวจ field จริงทุกตัว เช่น `cameraId`, raw angles, `landmarks`, `worldLandmarks`, `frameWidth`, `frameHeight`, `minVisibility`, `meta`
- ตรวจ `visibility` ของ MediaPipe landmarks จากไฟล์จริงทีละจุด
- คำนวณ `neckAngleDeg` ย้อนกลับด้วยมือจาก normalized landmarks + frame size
- พิสูจน์ความถูกต้องเชิง ergonomic/accuracy ของ label แต่ละท่า
- จด/เปรียบเทียบ inference ms, FPS หรือ CPU ระหว่าง 1/2 กล้อง
- IP camera/CORS/performance campaign
- fall accuracy หรือการตั้งใจล้ม/ตกเก้าอี้
- face recognition / identity

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

- Node: `v26.1.0`
- npm: `12.0.2`
- Browser: **Google Chrome desktop**
- Webcam: **อย่างน้อย 2 ตัวที่เป็นคนละ physical device** เช่น Integrated Camera + USB webcam เพราะ Ticket 16 มี requirement ว่า CameraStage หลายกล้องต้องบันทึกเข้า singleton เดียว
- ผู้ช่วยทดสอบ: **แนะนำ 1 คน** สำหรับ Scenario 3 เพื่อให้กล้องเดียวเห็น 2 คนพร้อมกันอย่างชัดเจน
- แสง: สว่างสม่ำเสมอจากด้านหน้า/ด้านข้าง หลีกเลี่ยงย้อนแสงแรง เพื่อให้ pose detection ไม่แกว่งจนแยก recorder bug จาก visibility issue ไม่ได้

ถ้ายังไม่มี `node_modules/` จาก root repo ให้รัน:

```bash
npm install
```

จากนั้นรัน dev server:

```bash
npm run dev
```

URL ปกติของ Vite:

```text
http://localhost:5173/
```

ถ้า port `5173` ถูกใช้อยู่และ Vite เลือก port อื่น ให้ใช้ URL ที่ terminal แสดงจริง และบันทึก URL นั้นในตารางท้ายไฟล์

### Production preview สำหรับ Scenario 5

หลัง Scenario dev เสร็จ ให้รัน:

```bash
npm run build
npm run preview
```

URL ปกติของ Vite preview:

```text
http://localhost:4173/
```

ถ้า Vite เลือก port อื่น ให้ใช้ URL ที่ terminal แสดงจริง

### Backend

**ไม่ต้องรัน `backend/` สำหรับ required smoke ของ Ticket 16**

Dataset Recorder ใช้ pose/posture ฝั่ง browser และไม่ต้องใช้ face recognition/identity ให้ปิด face features ทุก scenario

ถ้า Chrome มี network error เดิมจาก request identity ตอน initial mount ทั้งที่ face features ปิด ให้จดแยกเป็น known/out-of-scope startup behavior และกด Clear Console หลังหน้า/โมเดลพร้อมแล้ว ก่อนเริ่มจับผลแต่ละ scenario

หลังจาก Clear แล้ว **ต้องไม่มี Console error ใหม่** จาก React, CameraStage, MediaPipe, PostureEngine, Dataset Recorder, Blob/download หรือ rAF loop ระหว่าง scenario

---

## SettingsPanel ที่ใช้

ค่าหลักสำหรับ Scenario 1–2 และ 4–5:

| Setting | ค่า |
|---|---|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition) | **ปิด** |
| โหมดการตรวจจับ | **ใช้คนเดียว (Personal Workstation)** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **30°** |
| หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน | **40%** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **30 s** |
| Fall settings | **คงค่าปัจจุบัน/default; อย่าทำท่าร่วงตัวเร็ว** |
| Break settings | ไม่เกี่ยวกับ Ticket นี้; คงค่าเดิม |

เหตุผลที่ตั้ง posture thresholds สูงและ sustained 30 วินาที: smoke ต้อง isolate Dataset Recorder ไม่ใช่ทดสอบ posture alert accuracy จึงลดโอกาสมี banner/EventLog ใหม่มารบกวนการสังเกตในช่วงบันทึกสั้น ๆ

> `minVisibility` ปัจจุบันเป็น `0.5` และ **ไม่มี slider ใน SettingsPanel** จึงไม่มี setting ให้ผู้ทดสอบปรับใน smoke นี้

### Setting เฉพาะ Scenario 3

เปลี่ยนเฉพาะ:

| Setting | ค่า |
|---|---|
| โหมดการตรวจจับ | **กล้องเดียวหลายคน (Multi-person)** |

ค่าอื่นคงตามตารางด้านบน

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. Reload หน้าเว็บ เพื่อให้ React state, EventLog และ in-memory dataset เริ่มใหม่
2. ตรวจ Chrome Site settings ของ origin ที่กำลังใช้ ให้ **Camera = Allow**
3. รอจนข้อความโหลด Pose Landmarker หาย และเห็นภาพกล้อง
4. จัดกล้องให้เห็นศีรษะและไหล่ชัด อย่างน้อยช่วงบนของลำตัว ไม่ย้อนแสง
5. นั่งห่างกล้องประมาณระยะใช้งานปกติของ webcam โต๊ะทำงาน และขยับช้า ๆ
6. ตั้ง SettingsPanel ตามตารางของ scenario
7. ปิด face features และ sound
8. เปิด DevTools → **Console**
9. รอ initialization จบ แล้วกด **Clear Console**
10. ตรวจ baseline ก่อนเริ่ม:
    - overlay/skeleton วาดตามตัว
    - status line ใต้กล้องแสดง `ตรวจพบในเฟรม: ... คน` และ `Pose ใช้เวลา ~... ms/ครั้ง`
    - people list แสดงคนเมื่อพบ pose
    - ไม่มี alert banner ที่เกิดจากท่าทดสอบ
    - EventLog ไม่มี row ใหม่จาก Dataset Recorder
11. ระหว่าง scenario อย่าสลับ Chrome ไป background tab เพราะ browser อาจ throttle rAF และทำให้สังเกตความลื่นผิด
12. ถ้า status line คนแกว่งเพราะ pose มองไม่ชัด ให้จัดแสง/ระยะใหม่ก่อนตัดสิน FAIL

---

# Scenario 1 — Dev panel + label + start/stop/clear/export flow

**เป้าหมาย:** พิสูจน์ UI หลักของ recorder และ singleton lifecycle ใน browser โดยไม่ตรวจ semantic ภายใน JSON ซึ่งเป็น Ticket 17

## เตรียมก่อนเริ่ม

- ใช้ **กล้องเดียว** ก่อน
- โหมด **Personal Workstation**
- มีผู้ทดสอบเพียง 1 คนอยู่กลางเฟรม
- รอ status line ให้คงที่ที่ **1 คน**
- นั่งตรงและขยับช้า ๆ
- Clear Console

## ขั้นตอน

1. เลื่อนด้านขวาลงใต้ EventLog
2. ตรวจว่ามีหัวข้อ **Dataset Recorder (สำหรับนักพัฒนา)**
3. เปิด dropdown label และตรวจว่ามีครบ:
   - `GOOD`
   - `FORWARD_HEAD`
   - `SLOUCH`
   - `LEAN_LEFT`
   - `LEAN_RIGHT`
4. เลือก `GOOD`
5. ตรวจ count เริ่มต้น ถ้า reload ใหม่ควรเป็น `0`
6. กด **● เริ่มบันทึก**
7. นั่งนิ่งในเฟรม **5 วินาที**
8. สังเกต count อย่างน้อย 2 ครั้งระหว่างช่วงนี้
9. ระหว่างบันทึก ตรวจว่าปุ่ม **ล้างข้อมูลทั้งหมด** disabled
10. สังเกต overlay/skeleton และ status line ต่อเนื่องตลอด 5 วินาที
11. กด **■ หยุดบันทึก (GOOD)**
12. จด count ปัจจุบันเป็น `N1`
13. นั่งอยู่ในเฟรมต่อ **3 วินาที** โดยไม่กด Start
14. ตรวจว่า count ยังเป็น `N1`
15. เปลี่ยน label เป็น `LEAN_LEFT`
16. กด **● เริ่มบันทึก**
17. นั่งอยู่ในเฟรมต่อ **3 วินาที**
18. กด Stop
19. ตรวจว่า count มากกว่า `N1`
20. กด **Export เป็น JSON**
21. ตรวจ Chrome Downloads ว่ามีไฟล์ชื่อรูปแบบ `camwell-dataset-....json` ถูกดาวน์โหลด
22. **ไม่ต้องเปิดไฟล์และไม่ต้องไล่ตรวจ fields** — ส่วนนี้เป็น Ticket 17
23. กด **ล้างข้อมูลทั้งหมด**
24. ตรวจ count กลับเป็น `0`
25. ตรวจว่า Export disabled เมื่อ count = 0
26. ตรวจ Console

## Expected result

- dev UI มี Dataset Recorder panel ใต้ EventLog
- dropdown มี label ครบ 5 ค่า
- ตอน recording และ status line = 1 คน count เพิ่มต่อเนื่อง
- ไม่ต้องคาดหวังจำนวน sample ต่อวินาทีแบบ exact เพราะ pose inference ถูก throttle และ browser scheduling ไม่ deterministic
- Stop แล้ว count ต้องหยุดทันทีในเชิง observable; หลังรอ 3 วินาทีต้องไม่เพิ่ม
- เปลี่ยน label ได้เมื่อไม่ได้ recording และปุ่ม Start/Stop แสดง label ปัจจุบันถูกต้อง
- Clear disabled ตอน recording
- Export ดาวน์โหลดไฟล์ `.json` ได้
- Clear หลัง Stop ทำให้ count = 0
- overlay/skeleton ต้องไม่หายเป็นช่วง ๆ หรือ freeze เพราะ recorder เปิด
- status line ต้องยังอัปเดตตามปกติ
- recorder ต้องไม่สร้าง alert banner เอง
- EventLog ต้องไม่เพิ่ม row เพียงเพราะ Start/Stop/Export/Clear
- Console ไม่มี runtime error ใหม่

## PASS

ผ่านเมื่อ lifecycle UI ทำงานครบ, count เพิ่มเฉพาะตอน recording ที่มี 1 คน, Stop/clear/export ทำงาน และ pose UI ไม่ regress

## FAIL

ถือว่า fail ถ้าอย่างใดอย่างหนึ่งเกิดขึ้น:

- ไม่มี Dataset Recorder panel บน dev server
- label ขาดหรือเลือกไม่ได้
- Start แล้วมี 1 คนชัดเจนแต่ count ไม่เพิ่ม
- Stop แล้ว count ยังเพิ่ม
- Clear กดได้ขณะ recording หรือ clear แล้ว count ไม่เป็น 0
- Export ไม่ดาวน์โหลดไฟล์
- overlay กระพริบ/หายซ้ำ ๆ, status line freeze หรือ people list ค้างหลัง Start recorder
- เกิด alert/EventLog row ใหม่จากการใช้ recorder เอง
- Console มี exception/error ใหม่

---

# Scenario 2 — Regression: เปิด recorder แล้ว rAF/overlay/status line ต้องยังลื่น

**เป้าหมาย:** จับ regression ที่ unit tests ไม่เห็น โดยเฉพาะการเพิ่ม recorder check เข้า pose hot path

## เตรียมก่อนเริ่ม

- Reload
- กล้องเดียว
- 1 คน
- Personal Workstation
- Settings ตามค่าหลัก
- Clear Console

## ขั้นตอน

1. ก่อน Start recorder ให้ขยับศีรษะและไหล่ช้า ๆ ซ้าย–ขวา **5 วินาที**
2. สังเกต skeleton ว่าตามตัวต่อเนื่องและ status line อัปเดต
3. เลือก label `GOOD`
4. กด Start
5. ขยับแบบเดิมต่ออีก **10 วินาที**
6. ระหว่าง 10 วินาที สังเกตพร้อมกัน:
   - skeleton/overlay
   - status line people count
   - `Pose ใช้เวลา ~... ms/ครั้ง`
   - recorder count
7. กด Stop
8. ขยับต่ออีก **5 วินาที**
9. ตรวจ EventLog และ Console

## Expected result

- ก่อน/ระหว่าง/หลัง recording overlay ต้องมีความต่อเนื่องใกล้เคียงกันด้วยตา
- ห้ามเกิด pattern “ทั้ง skeleton หายแล้วกลับมา” ซ้ำ ๆ หลังเปิด recorder
- status line และ people count ไม่ freeze
- inference-ms text ยัง refresh ตามรอบ summary เดิม
- recorder count เพิ่มขณะ recording และหยุดหลัง Stop
- ไม่มี Dataset Recorder alert/banner
- EventLog ไม่เพิ่ม row จาก recorder
- Console ไม่มี error

> ไม่ต้องจับ stopwatch เพื่อพิสูจน์ FPS หรือ inference cadence ตัวเลข exact; Ticket 17 เป็นผู้รับผิดชอบ performance comparison ที่ต้องจด inference ms/CPU

## PASS / FAIL

- **PASS:** UI/overlay responsiveness ไม่เห็น regression หลังเปิด recorder และ Console สะอาด
- **FAIL:** overlay เริ่มกระพริบ/freeze/status ค้างเฉพาะเมื่อ recorder active หรือมี runtime error

---

# Scenario 3 — exactly-one-person gate: 0 คน → 1 คน → 2 คน → 1 คน

**เป้าหมาย:** พิสูจน์ wiring ของ requirement `engineResult.people.length === 1` ใน browser จริง

## เตรียมก่อนเริ่ม

- ใช้กล้องเดียว
- ต้องมีผู้ช่วยอีก 1 คน
- ตั้ง Detection Mode = **กล้องเดียวหลายคน (Multi-person)**
- จัดกล้องให้พื้นที่เฟรมกว้างพอเห็นคน 2 คนแยกกัน
- ทั้งสองคนไม่ยืนซ้อนกัน
- แสงต้องทำให้ skeleton ของทั้งสองคน detect ได้คงที่
- Reload แล้ว Clear Console
- เลือก label `GOOD`

## ขั้นตอน

### ช่วง A — 0 คน

1. ให้ทุกคนออกจากเฟรมช้า ๆ
2. รอ status line แสดง **0 คน** คงที่
3. กด Start recorder
4. จด count เป็น `N0`
5. อยู่นอกเฟรมต่อ **3 วินาที**
6. ตรวจ count

### ช่วง B — 1 คน

7. ให้ผู้ทดสอบหลักเข้ากล้องคนเดียวและนั่งกลางเฟรม
8. รอ status line แสดง **1 คน** คงที่
9. อยู่คนเดียว **4 วินาที**
10. จด count เป็น `N1`

### ช่วง C — 2 คน

11. ให้ผู้ช่วยเข้ามานั่ง/ยืนด้านข้าง โดยไม่บังผู้ทดสอบหลัก
12. รอจน status line แสดง **2 คน**
13. ต้องให้ status line คงที่ที่ 2 คนอย่างน้อย **3 วินาที**
14. เมื่อเริ่มช่วงคงที่ จด count เป็น `N2-start`
15. หลังครบ 3 วินาที จด `N2-end`

### ช่วง D — กลับเหลือ 1 คน

16. ให้ผู้ช่วยออกจากเฟรมช้า ๆ
17. รอ status line กลับเป็น **1 คน**
18. รออีก **4 วินาที**
19. จด count เป็น `N3`
20. กด Stop
21. ตรวจ overlay/status/EventLog/Console

## Expected result

- ช่วง 0 คน: count คงที่ `N0`
- ช่วง 1 คน: count เพิ่ม ดังนั้น `N1 > N0`
- ช่วงที่ status line คงที่ 2 คน: count ต้องคงที่ ดังนั้น `N2-end = N2-start`
- ถ้า people count กระพริบ 2 → 1 ระหว่างช่วงนี้ ให้จัดตำแหน่งใหม่และทำช่วง C ซ้ำ; อย่านับการเพิ่ม sample ตอน UI รายงาน 1 คนเป็น bug
- หลังกลับเหลือ 1 คน: count ต้องเริ่มเพิ่มอีกครั้ง ดังนั้น `N3 > N2-end`
- overlay ของทั้งสองคนต้องวาดได้ตามโหมด Multi-person โดยไม่ freeze
- ไม่มี alert/EventLog ใหม่จาก recorder
- Console ไม่มี error

## PASS

ผ่านเมื่อ count ตอบสนองตาม 0/1/2/1 คนตรงกับเงื่อนไข exactly-one-person และ UI ยังทำงาน

## FAIL

- count เพิ่มตอน status line คงที่ 0 คน
- count ไม่เพิ่มตอน status line คงที่ 1 คน
- count เพิ่มต่อเนื่องตอน status line คงที่ 2 คน
- หลังกลับ 1 คนแล้ว count ไม่ resume
- overlay/status freeze หรือ Console error

---

# Scenario 4 — สอง webcam เขียนเข้า singleton count เดียวกัน

**เป้าหมาย:** พิสูจน์ integration หลาย CameraStage ว่าทั้งสองกล้องใช้ Dataset Recorder singleton เดียว ไม่สร้าง count แยกต่อ panel

> Scenario นี้ใช้ **2 webcam ขึ้นไป** ตาม requirement ของ Ticket 16 ห้ามใช้ device เดียวซ้ำในสอง slot แล้วนับว่าผ่าน

## เตรียมก่อนเริ่ม

- ต่อ webcam 2 ตัวกับเครื่องเดียวกัน
- กล้อง A และ B ต้องเป็นคนละ physical device
- ปิด face features
- ใช้ Personal Workstation
- Settings ตามค่าหลัก
- Reload / Clear Console
- ตรวจ Dataset Recorder count = 0
- วางกล้องทั้งสองให้สามารถเห็นผู้ทดสอบคนเดียวได้ทีละตัว
- เตรียมฝาปิดเลนส์/กระดาษทึบเพื่อทำให้กล้องหนึ่งไม่เห็นคน โดยไม่ต้อง disconnect device

## ขั้นตอน

1. ใน camera slot แรก เลือก **กล้อง A**
2. กด **+ เพิ่มกล้อง**
3. ใน camera slot ที่สอง เลือก **กล้อง B**
4. รอทั้งสอง CameraStage โหลด pose พร้อม
5. ตรวจ status line ของทั้งสองกล้องและ Console
6. ใช้กระดาษปิดกล้อง B หรือหัน B ออกจากคน
7. นั่งให้กล้อง A เห็นเพียง 1 คนชัดเจน
8. รอจน:
   - A = 1 คน
   - B = 0 คน
9. เลือก label `GOOD` แล้วกด Start
10. รอ **4 วินาที**
11. จด count เป็น `A-count`
12. โดย **ไม่กด Stop และไม่ reload**:
    - ปิด/หันกล้อง A ออกจากคน
    - เปิด/หันกล้อง B ให้เห็นผู้ทดสอบ
13. รอจน:
    - A = 0 คน
    - B = 1 คน
14. รออีก **4 วินาที**
15. จด count เป็น `B-count`
16. กด Stop
17. ตรวจว่า count รวมยังเป็นเลขเดียวใน panel เดียว
18. ตรวจ overlay/status ของทั้งสอง CameraStage และ Console

## Expected result

- ตอน A เป็นกล้องเดียวที่เห็น 1 คน count ต้องเพิ่ม
- เมื่อสลับให้ B เป็นกล้องเดียวที่เห็น 1 คน count ต้อง **เพิ่มต่อจากค่าเดิม** ไม่ reset
- `B-count > A-count > 0`
- มี Dataset Recorder panel เดียวสำหรับทั้งหน้า ไม่เกิด panel แยกต่อ camera
- การเพิ่ม/สลับ contribution ระหว่างสองกล้องไม่ทำให้ overlay ของอีก CameraStage ค้างหรือ app freeze
- EventLog ไม่เพิ่ม row จาก recorder
- Console ไม่มี error

### สิ่งที่ scenario นี้ตั้งใจไม่ตรวจ

ไม่ต้องเปิด JSON เพื่อพิสูจน์ว่า sample จาก A/B มี `cameraId` อะไร เพราะ Ticket 17 มี requirement ตรวจไฟล์จริงอยู่แล้ว ส่วน wiring ว่า `CameraStage` ส่ง `p.cameraId` เข้า recorder ถูกตรวจใน code review และ deterministic serialization test

## PASS / FAIL

- **PASS:** ทั้งสองกล้องเพิ่มข้อมูลต่อใน count singleton เดียวได้ และไม่มี UI/runtime regression
- **FAIL:** count ใช้ได้เฉพาะกล้องแรก, เปลี่ยน source contribution แล้ว reset/หยุดถาวร, มี recorder panel แยกต่อกล้อง หรือเกิด error/freeze

---

# Scenario 5 — Production preview ต้องไม่มี Dataset Recorder panel

**เป้าหมาย:** regression จาก code review ที่พบว่า dev-only recorder เคยยังมี service path อยู่ใน production hot path แม้ panel ถูกซ่อน

## เตรียมก่อนเริ่ม

1. หยุด recording และปิด dev tab เดิม หรือใช้ tab แยกให้ชัดเจน
2. จาก root repo รัน:
   ```bash
   npm run build
   npm run preview
   ```
3. เปิด `http://localhost:4173/` หรือ URL ที่ terminal แสดง
4. อนุญาต Camera สำหรับ preview origin ถ้า Chrome ถามใหม่
5. ปิด face features
6. เปิด DevTools Console และ Clear หลัง initialization

## ขั้นตอน

1. เลื่อน side column จากบนลงล่างทั้งหมด
2. ตรวจหลัง EventLog และท้าย side column
3. ยืนยันว่า **ไม่มี**:
   - `Dataset Recorder (สำหรับนักพัฒนา)`
   - label dropdown ของ dataset
   - ปุ่ม Start/Stop recorder
   - ปุ่ม Export JSON ของ recorder
   - count dataset
4. เลือก webcam และรอ pose พร้อม
5. นั่งกลางเฟรม **5 วินาที**
6. ขยับศีรษะ/ไหล่ช้า ๆ อีก **5 วินาที**
7. ตรวจ overlay, status line, people list, EventLog และ Console

## Expected result

- production preview ไม่มี recorder UI ใด ๆ
- SettingsPanel/EventLog/camera UI ปกติยังแสดง
- overlay/status line/people detection ยังทำงาน
- ไม่มี runtime error
- ไม่มี behavior ที่บ่งชี้ว่า recorder UI ถูกเปิดใช้งานใน production

> การพิสูจน์ว่า recorder code/string ถูก tree-shake ออกจาก generated bundle ทั้งหมดเป็น build-artifact verification จาก code review/automated verification ไม่ใช่สิ่งที่ควรให้คนไล่ค้น minified JS ใน smoke นี้

## PASS / FAIL

- **PASS:** preview ไม่มี recorder panel และ pose UI ปกติทำงานโดย Console สะอาด
- **FAIL:** recorder panel โผล่ใน production, app/pose path พังหลัง production build หรือมี runtime error ใหม่

---

# Regression scenarios ที่ automated test อย่างเดียวไม่พอ

browser smoke ข้างต้นตั้งใจจับ regression เหล่านี้:

1. **overlay/skeleton กระพริบหรือ freeze ตอน recording**
   - Vitest ไม่ render canvas/rAF จริง
   - ตรวจด้วย Scenario 1–2

2. **status line/people count หยุดอัปเดตเพราะ recorder ทำงานใน pose path**
   - ตรวจด้วย Scenario 2

3. **เงื่อนไข exactly-one-person ต่อกับ UI/MediaPipe จริงผิด**
   - pure test ของ service ไม่รู้จำนวนคนจาก CameraStage จริง
   - ตรวจ 0/1/2/1 ด้วย Scenario 3

4. **หลาย CameraStage ไม่ได้ใช้ recorder singleton เดียวจริงใน browser**
   - ตรวจด้วย webcam 2 ตัวใน Scenario 4

5. **production dev-only regression**
   - build gate พิสูจน์ compile/tree-shaking ส่วน browser preview พิสูจน์ว่า recorder UI ไม่หลุดมาใน production
   - ตรวจด้วย Scenario 5

6. **download integration**
   - pure JSON builder testตั้งใจไม่ mock DOM/URL ตาม Ticket
   - จึงต้องกด Export จริงใน Scenario 1 เพื่อยืนยัน Blob + anchor download wiring

---

# สิ่งที่ไม่ควรบังคับทำด้วยมือ และ automated test ที่พิสูจน์แทน

## 1. โครง JSON, raw fields, meta และ landmark visibility แบบ exact

ไม่ควรให้ผู้ทดสอบไล่อ่าน JSON หลายสิบ/หลายร้อย sample เพื่อพิสูจน์ schema ใน smoke และการเปิดไฟล์จริงเพื่อตรวจทุก field ถูกสงวนไว้ Ticket 17 แล้ว

พิสูจน์ deterministic serialization ด้วย:

- ไฟล์: `src/services/datasetRecorder.test.ts`
- test: **`buildDatasetJson preserves raw sample fields, landmark visibility, and deterministic export metadata`**

test นี้พิสูจน์ว่า JSON มี `cameraId`, `label`, `timestamp`, raw features, `frameWidth`, `frameHeight`, `minVisibility`, `landmarks`, `worldLandmarks`, `visibility` ทุก synthetic point และ `meta.schemaVersion/exportedAt/thresholdsAtExport`; `meta` ไม่เป็น array และ sample ไม่มี `image`/`video`

Ticket 17 จะเป็นผู้พิสูจน์ต่อว่าข้อมูล **จากกล้องจริง** ในไฟล์ export มี field เหล่านี้จริง

## 2. start/stop/add/count/clear state แบบ deterministic

browser smoke ตรวจ wiring แล้ว แต่ exact module state ไม่ต้องพยายามจับ cadence ด้วย stopwatch

พิสูจน์ด้วย:

- ไฟล์: `src/services/datasetRecorder.test.ts`
- test: **`records only while active and exposes start/stop/count/clear state`**

## 3. normalized landmarks กับ worldLandmarks ต้องผูกกับคนเดียวกันและไม่สลับ index

ไม่ควรพยายามพิสูจน์ด้วยการมอง overlay หรือเปิด JSON แล้วเดาว่า landmark ชุดไหนเป็นคนไหน เพราะ MediaPipe array order เปลี่ยนได้ระหว่าง frame และการตรวจด้วยตาไม่ deterministic

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureEngine.test.ts`
- test: **`keeps normalized and world landmarks paired with the same person in a multi-person frame`**

Ticket 17 จะมี independent HITL check โดยคำนวณมุมย้อนกลับจาก sample จริงหนึ่งรายการ ซึ่งช่วยจับ silent mismatch ของ real exported data อีกชั้น

## 4. จำนวน sample ต่อวินาทีแบบ exact

**ไม่ควรบังคับ** ว่า 5 วินาทีต้องได้ sample จำนวนใดแน่นอน เพราะ Ticket 10 จำกัด pose inference และ browser/rAF scheduling, webcam FPS และ inference time ต่างกันตามเครื่อง

Manual smoke ให้ตรวจเพียง:

- count เพิ่มเมื่อ recording + 1 คน
- count คงที่เมื่อ Stop / 0 คน / 2 คนคงที่
- count resume เมื่อกลับเป็น 1 คน

การวัด inference/FPS เชิง performance เป็น Ticket 17

## 5. Edge cases ของ posture/fall state machine เช่น synthetic time `t=0`

ไม่เกี่ยวกับ recorder behavior โดยตรงและทำใน browser แบบ deterministic ไม่ได้ จึงไม่ต้องนำกลับมาทดสอบใน Ticket 16 smoke

regression เหล่านี้ยังมี Vitest ของ engine เดิม เช่น:

- `src/lib/postureEngine.test.ts` — **`allows the first direct fall alert when synthetic time starts at zero`**
- `src/lib/postureEngine.test.ts` — **`emits fall_suspected_left_frame exactly once after a rapid drop followed by 5 seconds of absence`**

**ห้ามตั้งใจล้ม/ตกเก้าอี้เพื่อ Ticket 16 smoke**

---

# เกณฑ์ Core smoke PASS ของ Ticket 16

ถือว่า Manual browser smoke ของ Ticket 16 ผ่านเมื่อ:

1. Scenario 1 PASS — dev panel/lifecycle/export/clear ทำงาน
2. Scenario 2 PASS — recorder ไม่ทำให้ overlay/status/rAF regression
3. Scenario 3 PASS — 0/1/2/1 คนทำให้ count หยุด/เดินถูกเงื่อนไข
4. Scenario 4 PASS — webcam 2 ตัว contribute เข้า singleton count เดียว
5. Scenario 5 PASS — production preview ไม่มี recorder UI
6. Console ไม่มี runtime error ใหม่ในทุก scenario
7. ไม่ต้องเปิด/inspect JSON fields และไม่ต้องคำนวณมุมย้อนกลับ เพราะเป็น Ticket 17

ถ้าไม่มี webcam 2 ตัวหรือไม่มีผู้ช่วยสำหรับ Scenario 3 ให้บันทึกว่า **NOT RUN — environment incomplete** และยังไม่ควรนับ Core smoke รวมเป็น PASS

---

# ตารางสรุปผลการทดสอบ

**วันที่ทดสอบ:** ____________________

**ผู้ทดสอบ:** ____________________

**Browser / version:** Chrome ____________________

**OS:** ____________________

**Webcam 1 (ยี่ห้อ/รุ่น / device):** ____________________

**Webcam 2 (ยี่ห้อ/รุ่น / device):** ____________________

**ผู้ช่วย 2-person scenario:** มี / ไม่มี

**Node / npm:** ____________________

**Dev URL:** ____________________

**Production preview URL:** ____________________

**Backend:** **ไม่ได้รัน** / อื่น ๆ: ____________________

| Scenario | ผล | หมายเหตุ |
|---|---|---|
| 1 — Dev panel + start/stop/clear/export | ☐ PASS ☐ FAIL | |
| 2 — Recorder active แล้ว overlay/status ยังลื่น | ☐ PASS ☐ FAIL | |
| 3 — exactly-one-person gate 0→1→2→1 | ☐ PASS ☐ FAIL ☐ NOT RUN | |
| 4 — 2 webcams → singleton count เดียว | ☐ PASS ☐ FAIL ☐ NOT RUN | |
| 5 — Production preview ไม่มี recorder panel | ☐ PASS ☐ FAIL | |
| Console ไม่มี runtime error ใหม่ | ☐ PASS ☐ FAIL | |
| **Core smoke รวม** | ☐ PASS ☐ FAIL ☐ INCOMPLETE | |

## ถ้า FAIL ให้บันทึก

- Scenario / step ที่ fail:
- สิ่งที่เห็นจริง:
- สิ่งที่คาดหวัง:
- people count ตอนเกิดปัญหา:
- recorder count ก่อน/หลัง:
- Console error:
- webcam/device ที่เกี่ยวข้อง:
- ทำซ้ำได้หรือไม่:
- screenshot/video ที่เก็บไว้:
