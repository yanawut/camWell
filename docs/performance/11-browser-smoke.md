# 11: Manual browser smoke — แสดงเวลา Pose inference (ms)

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 11 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ requirement ของ Ticket 11: วัดเวลารอบ `detectForVideo` ที่รันจริงหลัง throttle ของ Ticket 10, ทำค่าเฉลี่ยแบบ EMA (0.9 ค่าเก่า / 0.1 ค่าใหม่), ส่งค่าขึ้น React UI ผ่าน summary tick เดิมทุก 500 ms และแสดงค่า `Pose ใช้เวลา ~X ms/ครั้ง` ข้างจำนวนคน **แยกต่อกล้อง** เพื่อให้ผู้ใช้เปรียบเทียบ Workstation กับ Multi และกล้อง 1 ตัวกับ 2 ตัวได้

smoke นี้ **ไม่ใช่** HITL/performance campaign ของ Ticket 17 จึงไม่ทำ long-run benchmark, ไม่ตั้งเกณฑ์ว่าเครื่องต้องต่ำกว่า X ms, ไม่วัด CPU/GPU แบบเป็นทางการ, ไม่เปรียบเทียบหลายเครื่อง, ไม่วัด accuracy/precision/recall และไม่ใช้ค่าที่เห็นเพื่อสรุปว่าโหมดใด “เร็วกว่าแน่นอน” ทุกเครื่อง

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

สิ่งที่ automated test อย่างเดียวมองไม่เห็นและต้องเช็คบน browser จริง:

- status line ของแต่ละ CameraStage ต้องมีข้อความ `Pose ใช้เวลา ~X ms/ครั้ง` อยู่ข้างจำนวนคน
- หลังโมเดลพร้อมและ pose inference รันจริง ค่า ms ต้องเป็นตัวเลข finite ที่อัปเดตเป็นระยะ ไม่เป็น `NaN`, `Infinity`, ข้อความหาย หรือค้างเพราะ loop หยุด
- การอัปเดตค่า ms ต้องไม่ทำให้ video / skeleton / UI กระพริบหรือหน่วงอย่างเห็นได้ชัด
- Workstation ↔ Multi ต้องยัง reload/recover pose model ได้ และค่า ms ต้องกลับมาอัปเดตหลัง ready
- เมื่อเปิด 2 webcams พร้อมกัน แต่ละกล้องต้องมีค่า inference ของตัวเอง ไม่ใช่มี status line เดียวรวมกันหรือทำให้กล้องหนึ่งหยุด
- การสลับ device/source ต้องไม่ทำให้ skeleton เก่าค้าง, detection loop ตาย หรือ inference display หายถาวร
- การเพิ่ม instrumentation ต้องไม่สร้าง alert/EventLog เอง และ Console ต้องไม่มี runtime/React/MediaPipe/canvas error ใหม่

สิ่งที่ **ไม่ใช่ scope ของ Ticket 11**:

- พิสูจน์ exact throttle 12 Hz ด้วย stopwatch — Ticket 10 + Vitest
- benchmark CPU/GPU แบบมีสถิติ, endurance, thermal throttling หรือเปรียบเทียบหลายเครื่อง — Ticket 17
- พิสูจน์ความแม่นยำ posture/fall/face — Tickets 06–08 / 17
- พิสูจน์ว่า Multi ต้องช้ากว่า Workstation เสมอ หรือ 2 กล้องต้องมี ms สูงกว่า 1 กล้องเสมอ — hardware/runtime แตกต่างกันและ Ticket 11 ขอให้ “มองเห็นค่าเพื่อเทียบ” ไม่ได้กำหนด performance threshold
- ทดสอบ identity/face recognition — Ticket 11 เป็น pose-only

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง **ไม่ใช้ WSL**

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

| รายการ | ค่า |
|---|---|
| Node | `v26.1.0` |
| npm | `12.0.2` |
| Browser | Google Chrome desktop |
| Webcam | **อย่างน้อย 2 ตัว** สำหรับ smoke ให้ครบ Ticket 11; Scenario 1–2 ใช้ 1 ตัว, Scenario 3–4 ใช้ 2 ตัว |
| IP camera | ไม่จำเป็น |
| Backend | **ไม่ต้องรัน `backend/`** เพราะทุก required scenario ปิด face features และไม่ใช้ identity |

จาก root repo:

~~~bash
npm install
npm run dev
~~~

เปิด URL:

~~~text
http://localhost:5173/
~~~

ถ้า Vite เลือก port อื่นเพราะ `5173` ถูกใช้งาน ให้ใช้ URL ที่ terminal แสดงจริงและบันทึก URL นั้นในตารางผลท้ายไฟล์

### Backend

required scenarios ทั้งหมดของ Ticket 11 เป็น pose-only ให้ **ไม่ต้องรัน `backend/`**

ตั้ง **เปิดฟีเจอร์เกี่ยวกับใบหน้า = ปิด** เพื่อไม่ให้ request ของ face/identity หรือ backend error รบกวน Console

ถ้ามี error เก่าจาก startup ก่อนปิด setting ให้รอหน้าและ Pose Landmarker พร้อม แล้วกด **Clear Console** ก่อนเริ่ม scenario และพิจารณาเฉพาะ error ที่เกิดหลัง Clear

### SettingsPanel ที่ใช้

ก่อนเริ่ม Scenario 1 ให้ตั้งดังนี้ และคงค่าพวก posture/fall/break ไว้ตลอด smoke:

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition) | **ปิด** |
| โหมดการตรวจจับ | เริ่มที่ **ใช้คนเดียว (Personal Workstation)** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **30°** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **30 s** |
| เตือนพัก | คงค่าเดิม; ทุก scenario สั้นกว่าช่วงเตือนพัก |
| หกล้ม / ตกจากเก้าอี้ | คงค่าเดิม และหลีกเลี่ยงการย่อตัว/ทิ้งตัวเร็ว |

เหตุผลที่ตั้ง posture threshold สูงและ sustained 30 s คือให้ขยับตัวเพื่อดู skeleton/inference display ได้โดยไม่ให้ alert จากท่าทางมารบกวนผลของ Ticket 11

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ตรวจ Site settings ของ origin ให้ **Camera = Allow**
3. ปิด Zoom / Teams / OBS หรือโปรแกรมอื่นที่อาจจับ webcam อยู่
4. ใช้แสงคงที่จากด้านหน้าหรือด้านข้าง หลีกเลี่ยงย้อนแสงแรง
5. วาง webcam ด้านหน้าหรือเฉียงหน้าเล็กน้อย ระยะประมาณ **0.7–1.5 เมตร** ให้เห็นศีรษะ ไหล่ และช่วงตัวชัด
6. เปิด DevTools → **Console**
7. รอ banner `กำลังโหลดโมเดล Pose Landmarker...` หาย และ skeleton เริ่มติดตาม
8. หลัง startup/model load เสร็จ กด **Clear Console**
9. จดจำนวน row ใน EventLog ก่อนเริ่ม scenario
10. ก่อนอ่านค่า inference ให้รอ tracking settle **5 วินาที**
11. ระหว่าง scenario อย่าสลับ Chrome ไป background tab เพราะ browser อาจลด rAF cadence และทำให้สังเกต performance ผิด
12. ถ้าเกิด alert จากท่าทางโดยไม่ได้ตั้งใจ ให้กลับมานั่งตรง รอ alert จบ แล้ว Clear Console/จด EventLog ใหม่ก่อน rerun
13. ค่า ms ที่ใช้เปรียบเทียบให้จดเป็น “ตัวอย่างที่เห็น” 3 ค่าในช่วงประมาณ 5–10 วินาที ไม่ต้องคำนวณ benchmark ทางสถิติ

---

## Scenario 1 — 1 webcam / Workstation: inference ms ต้องแสดงจริงโดยไม่ทำให้ overlay พัง

**เป้าหมาย:** พิสูจน์เส้นทางหลักของ Ticket 11 บน local webcam หนึ่งตัวว่า status line แสดงค่า inference, ค่าอัปเดตได้ และ instrumentation ไม่ทำให้ regression ของ Ticket 04/10 กลับมา

### เตรียมก่อนเริ่ม

1. ให้มี camera slot เดียว
2. เลือก webcam ตัวที่ 1
3. เลือก **ใช้คนเดียว (Personal Workstation)**
4. Settings อื่นตามตารางด้านบน
5. นั่งกลางเฟรมให้เห็นศีรษะ/ไหล่ชัด
6. รอ skeleton ต่อเนื่อง **5 วินาที**
7. Clear Console
8. จด EventLog row count

### ขั้นตอนบน browser

1. นั่งนิ่งท่าปกติ **5 วินาที**
2. อ่าน status line ใต้กล้อง ต้องมีทั้งจำนวนคนและข้อความ `Pose ใช้เวลา ~... ms/ครั้ง`
3. จดค่า ms ที่เห็น 3 ครั้ง ห่างกันประมาณ **2 วินาที**
4. ยกแขนข้างหนึ่งขึ้นช้า ๆ ใช้เวลา **2 วินาที**
5. ค้างแขนไว้ **2 วินาที**
6. ลดแขนลงช้า ๆ ใช้เวลา **2 วินาที**
7. หันศีรษะซ้าย → กลาง → ขวาช้า ๆ รวม **4 วินาที**
8. กลับมานั่งนิ่งอีก **5 วินาที**
9. มอง skeleton ตลอดช่วงว่ามีอาการทั้งโครงหาย/กลับเป็นจังหวะหรือ freeze หรือไม่
10. ตรวจ status line อีกครั้งว่าค่า ms ยังอยู่และยังเป็นตัวเลข
11. ตรวจ alert banner และ EventLog
12. ตรวจ Console

### Expected result

**Status line**

- ต้องเห็นข้อความรูปแบบประมาณ:
  `ตรวจพบในเฟรม: 1 คน (รองรับสูงสุด 1 คน) · Pose ใช้เวลา ~X ms/ครั้ง`
- หลัง inference รันต่อเนื่อง ค่า `X` ต้องเป็นเลขจำนวนเต็ม finite; **ห้าม** เป็น `NaN`, `Infinity`, `undefined` หรือข้อความว่าง
- ช่วง model เพิ่งโหลดหรือก่อน pose รอบแรก ค่าอาจเริ่มที่ 0 ชั่วคราวได้ แต่หลัง skeleton ทำงานต่อเนื่องหลายวินาทีค่าต้องสะท้อน inference ที่รันอยู่ ไม่ค้าง 0 แบบถาวร
- ค่าไม่จำเป็นต้องเปลี่ยนทุกครั้งที่มอง และไม่กำหนดช่วง “ต้อง 5–20 ms” เป็น PASS เพราะขึ้นกับเครื่อง

**Video / overlay**

- video สดตาม webcam
- skeleton ต้องต่อเนื่อง ไม่เกิด visible flicker แบบทั้งโครงหายแล้วกลับซ้ำ ๆ ระหว่าง skipped rAF ticks
- ขยับแขน/ศีรษะแล้ว skeleton ต้องตามทันในระดับใช้งานได้
- UI ต้องยัง scroll/click Settings ได้ตามปกติ

**Alert / EventLog**

- การแสดง inference ms หรือการขยับเบา ๆ ตามขั้นตอนไม่ควรสร้าง alert/EventLog ด้วยตัวมันเอง
- EventLog row count ควรเท่าเดิม ถ้า posture จริงไม่เข้า threshold นาน 30 s

**Console**

- ไม่มี uncaught exception
- ไม่มี React error
- ไม่มี MediaPipe error จาก `detectForVideo`
- ไม่มี canvas error
- ไม่มี error loop ใหม่จาก inference timing

### PASS

PASS เมื่อ status line มี inference ms จริง, ค่าเป็น finite number และยังอัปเดตหลังใช้งานต่อเนื่อง, skeleton/video ไม่ regression, ไม่มี alert/event ที่เกิดจาก instrumentation และ Console สะอาด

### FAIL

FAIL ถ้าเกิดอย่างใดอย่างหนึ่ง:

- status line ไม่มีข้อความ inference ms
- ค่าเป็น `NaN` / `Infinity` / `undefined`
- skeleton ทำงานแต่ค่า ms ค้าง 0 ตลอดหลังรอ **5–10 วินาที**
- ค่า ms หายหลังขยับตัวหรือ UI rerender
- skeleton กระพริบทั้งโครง/ค้างหลายวินาทีหลังเพิ่ม timing
- UI freeze หรือ interaction หน่วงผิดปกติอย่างชัดเจน
- inference display ทำให้เกิด alert/EventLog
- Console มี runtime/MediaPipe/canvas error ใหม่

---

## Scenario 2 — Workstation ↔ Multi: ค่า inference ต้องกลับมาหลัง model reload และใช้เปรียบเทียบได้

**เป้าหมาย:** Ticket ระบุชัดว่าค่า ms ใช้เทียบ Workstation กับ Multi จึงต้องพิสูจน์ว่าเปลี่ยน mode แล้ว pose model reload/recover และ status line ยังแสดงค่าใหม่ได้ โดยไม่บังคับว่าค่า mode ใดต้องมากกว่าอีก mode

### เตรียมก่อนเริ่ม

1. ใช้ camera slot เดียว + webcam ตัวที่ 1
2. เริ่มที่ Workstation
3. นั่งตรงกลางเฟรม
4. รอ model ready + skeleton ต่อเนื่อง **5 วินาที**
5. Clear Console
6. จด EventLog row count

### ขั้นตอนบน browser

1. ใน Workstation นั่งนิ่ง **6 วินาที**
2. จดค่า inference 3 ค่าและยืนยัน status line เขียน `รองรับสูงสุด 1 คน`
3. คลิก radio **กล้องเดียวหลายคน (Multi-person)**
4. สังเกต banner loading; ระหว่าง reload ไม่ใช้ค่า ms ชั่วคราวเป็นเกณฑ์
5. รอ banner loading หายและ skeleton กลับมา
6. รอเพิ่มอีก **5 วินาที** ให้ EMA settle
7. จดค่า inference ใน Multi 3 ค่า และยืนยัน status line เขียน `รองรับสูงสุด 4 คน`
8. ขยับแขนขึ้น-ลงช้า ๆ **4 วินาที** เพื่อยืนยัน overlay ยังสด
9. คลิกกลับ **ใช้คนเดียว (Personal Workstation)**
10. รอ model ready + skeleton กลับมา แล้วรอเพิ่ม **5 วินาที**
11. ยืนยัน status line กลับเป็นสูงสุด 1 คนและ inference ms ยังแสดง/อัปเดต
12. ตรวจ EventLog และ Console

### Expected result

- Workstation มีค่า inference ให้จด
- หลังเปลี่ยน Multi อาจมีช่วง loading แต่เมื่อ ready แล้ว inference display ต้องกลับมาเองโดยไม่ reload หน้า
- status max เปลี่ยน 1 → 4 → 1 ตาม mode
- ค่า ms ของ Workstation และ Multi **อาจเท่ากัน, สูงกว่า หรือต่ำกว่าได้**; Ticket ขอเพียงให้มองเห็นและเปรียบเทียบได้
- ห้ามใช้เกณฑ์ “Multi ต้องช้ากว่า Workstation” เป็น PASS/FAIL
- skeleton ต้อง recover หลังทุก model reload
- mode toggle อย่างเดียวต้องไม่เพิ่ม EventLog หรือเปิด alert banner
- Console ไม่มี error ใหม่

### PASS

PASS เมื่อทั้งสอง mode แสดงค่า inference หลัง model ready, status max ถูกต้อง, loop/overlay recover ทุกครั้ง และสามารถจดตัวเลขจากสอง mode มาเทียบกันได้

### FAIL

FAIL ถ้า:

- เปลี่ยน mode แล้ว inference display หายถาวร
- model ready แต่ค่าไม่อัปเดตอีก
- skeleton ไม่ recover
- status mode/max กับค่าที่เลือกไม่ตรงกันหลัง settle
- mode toggle สร้าง alert/EventLog
- Console มี error จาก pose model lifecycle / timing

---

## Scenario 3 — 2 webcams พร้อมกัน: แต่ละ CameraStage ต้องมี inference ms ของตัวเอง

**เป้าหมาย:** พิสูจน์ requirement “กล้อง 1 ตัวกับ 2 ตัว” และ architecture ที่หนึ่ง CameraStage ต่อหนึ่งกล้องถือ ref/state ของตัวเอง

### Prerequisite เพิ่มเติม

- ต้องมี **webcam อย่างน้อย 2 ตัว** ที่ Chrome เห็นเป็นคนละ video input
- ถ้า hardware/driver เปิดสองกล้องพร้อมกันไม่ได้ ให้บันทึก **BLOCKED — hardware/driver cannot open two webcams concurrently** ไม่ใช่ FAIL ของโค้ด
- แต่เพราะ Ticket 11 ระบุการเปรียบเทียบ 1 กล้องกับ 2 กล้อง ถ้า Scenario 3 ไม่ได้รันจริง ให้สรุป manual verification ของ Ticket เป็น **INCOMPLETE / BLOCKED** ไม่ใช่ PASS เต็ม

### เตรียมก่อนเริ่ม

1. เริ่มจากหน้า reload ใหม่
2. ปิด face features และเสียง
3. เลือก Workstation
4. กล้อง 1 ใช้ webcam ตัวที่ 1
5. กด **+ เพิ่มกล้อง (สูงสุด 2 ตัวพร้อมกัน)**
6. กล้อง 2 เลือก webcam ตัวที่ 2
7. วางกล้องทั้งสองให้เห็นผู้ทดสอบชัด อาจเล็งคนเดียวกันจากสองมุมได้
8. รอ Pose Landmarker ของทั้งสองกล้องพร้อมและ skeleton ทั้งสองเริ่มทำงาน
9. รอเพิ่ม **5 วินาที**
10. Clear Console และจด EventLog row count

### ขั้นตอนบน browser

1. นั่งนิ่ง **5 วินาที**
2. อ่าน status line ใต้ **กล้อง 1** และจด inference 3 ค่า
3. อ่าน status line ใต้ **กล้อง 2** และจด inference 3 ค่า
4. ตรวจว่าทั้งสองบรรทัดอยู่ใน card ของกล้องตัวเอง ไม่ใช่บรรทัดรวม
5. ยกแขนขึ้น-ลงช้า ๆ **4 วินาที** ให้ทั้งสองกล้องเห็นการเคลื่อนไหว
6. รออีก **5 วินาที**
7. ยืนยัน skeleton ของทั้งสองกล้องยัง active และค่า inference ของทั้งสองยังแสดง
8. คลิก Multi หนึ่งครั้ง
9. รอ model ของทั้งสองกล้อง reload/recover
10. หลังทั้งสอง ready รอ **5 วินาที**
11. ยืนยันทั้งสอง status line เป็นสูงสุด 4 คนและทั้งสองยังมีค่า inference
12. จดค่า inference ตัวอย่างของแต่ละกล้องอีกอย่างละ 3 ค่า
13. กลับ Workstation แล้วรอ recover
14. ตรวจ EventLog และ Console

### Expected result

- กล้อง 1 และกล้อง 2 มี status line/inference ms **แยกกัน**
- ทั้งสองกล้องสามารถมีค่าไม่เท่ากันได้ เป็นเรื่องปกติ
- ไม่กำหนดว่าเมื่อเปิด 2 กล้อง “ค่าต้องเพิ่ม X%” เพราะ Ticket 11 เป็น instrumentation ไม่ใช่ benchmark gate
- เปิดกล้องตัวที่ 2 แล้วกล้องตัวที่ 1 ต้องไม่หยุด inference หรือหาย status
- สลับ Workstation/Multi ครั้งเดียวแล้วทั้งสองกล้อง recover และยังแสดงค่า
- video/skeleton ทั้งสองไม่ freeze ถาวรหรือกระพริบทั้งโครง
- EventLog ไม่เพิ่มจากการเพิ่มกล้องหรือ mode toggle เพียงอย่างเดียว
- Console ไม่มี uncaught / React / MediaPipe / canvas error ใหม่

### PASS

PASS เมื่อ 2 CameraStage ทำงานพร้อมกันจริง, แต่ละกล้องมี inference display ของตัวเองทั้ง Workstation และ Multi, UI ยัง responsive และไม่มี error ใหม่

### FAIL

FAIL ถ้า:

- มีค่า inference แค่กล้องเดียว
- ค่า/status ของกล้องหนึ่งหายเมื่อเพิ่มอีกกล้อง
- เพิ่มกล้อง 2 แล้ว detection loop ของกล้อง 1 ตาย
- mode toggle ทำให้กล้องใดกล้องหนึ่งไม่ recover
- UI freeze อย่างชัดเจนจนใช้งานไม่ได้
- Console มี error ใหม่จาก multi-camera pose/timing

---

## Scenario 4 — Regression: สลับ webcam device แล้ว overlay + inference display ต้อง recover

**เป้าหมาย:** instrumentation ใหม่อยู่ใน CameraStage เดียวกับ source-switch/cached-overlay logic จึงต้องยืนยัน regression จาก Ticket 04/10 ว่าสลับ source แล้ว ghost skeleton ไม่ค้าง และ inference display ไม่ทำให้ loopหยุด

### เตรียมก่อนเริ่ม

1. กลับมาใช้ camera slot เดียว
2. Workstation
3. เลือก webcam ตัวที่ 1
4. ให้ skeleton ทำงาน **5 วินาที**
5. Clear Console
6. จด EventLog row count

### ขั้นตอนบน browser

1. จด inference ms จาก webcam 1 หนึ่งค่า
2. ขยับแขนให้เห็นว่า skeleton เป็นผลสด
3. ในตัวเลือกแหล่งภาพกล้อง เลือก webcam ตัวที่ 2
4. รอภาพเปลี่ยนและ model/pose กลับมาทำงานสูงสุด **5–10 วินาที**
5. ระหว่างเปลี่ยนสังเกตบริเวณ skeleton เดิมว่ามี ghost skeleton ค้างหรือไม่
6. เมื่อ webcam 2 พร้อม ให้นั่งนิ่ง **5 วินาที**
7. ยืนยัน inference ms ยังอยู่และกลับมาเป็นค่าที่อัปเดตได้
8. ยกแขนขึ้น-ลงช้า ๆ **4 วินาที**
9. สลับกลับ webcam ตัวที่ 1
10. รอ recover แล้วนั่งนิ่ง **5 วินาที**
11. ยืนยัน skeleton และ inference display กลับมาทำงาน
12. ตรวจ EventLog และ Console

### Expected result

- ตอนเปลี่ยน source cached skeleton เก่าต้องไม่ค้างเป็น ghost ถาวร
- กลับมามีภาพใหม่แล้ว skeleton ต้องเริ่มติดตามใหม่
- inference display อาจคง EMA ต่อเนื่องจาก CameraStage เดิม; Ticket 11 **ไม่ได้ require ให้ reset ค่าเป็น 0 เมื่อเปลี่ยน device**
- สิ่งที่ต้องยืนยันคือหลัง source ใหม่ทำ inference จริง ค่า display ยังเป็น finite number และอัปเดตต่อได้
- ไม่มี alert/EventLog จากการ switch เพียงอย่างเดียว
- Console ไม่มี runtime/MediaPipe/canvas error ใหม่

### PASS

PASS เมื่อสลับ webcam ไป-กลับแล้ว overlay และ inference display recover ทุกครั้งโดยไม่ต้อง reload หน้า

### FAIL

FAIL ถ้า ghost skeleton ค้าง, inference display หาย/เป็น NaN, loop ไม่กลับมารัน หรือ Console มี error ใหม่

---

## Optional Scenario — IP MJPEG (ทำเฉพาะเมื่อมี stream ที่ Chrome อ่านพิกเซลได้จริง)

Scenario นี้ **ไม่จำเป็นต่อ PASS ของ Ticket 11** เพราะ required comparison ใช้ webcams 1/2 ตัวอยู่แล้ว แต่มีประโยชน์เป็น regression ต่อ Ticket 10 ถ้ามี IP camera พร้อม

1. ใช้ camera slot เดียว, Workstation, face features ปิด
2. เลือก IP MJPEG และกรอก URL ที่ใช้งานได้
3. รอภาพ + skeleton **5–10 วินาที**
4. Clear Console
5. รออีก **5 วินาที**
6. ยืนยัน status line มี finite inference ms
7. ขยับตัวช้า ๆ **5 วินาที** ดู skeleton และค่า ms
8. ตรวจ Console

PASS เมื่อ IP pose loop มี inference display และ overlay ต่อเนื่อง ไม่มี CORS/MediaPipe error

ถ้า stream ติด CORS ให้บันทึก **INVALID / BLOCKED BY CAMERA CORS** ไม่ใช่ FAIL ของ Ticket 11 และไม่ต้องเปิด `backend/` เพียงเพื่อผ่าน optional scenario นี้

---

## Regression integration checks ที่ต้องสังเกตระหว่าง Scenario 1–4

| Regression risk | สิ่งที่ต้องสังเกต |
|---|---|
| Ticket 04 — cached skeleton | skipped ticks / source switch ต้องไม่ทำให้ skeleton หาย-กลับหรือ ghost ค้าง |
| Ticket 09 — mode lifecycle | Workstation ↔ Multi ต้อง reload/recover และ status max 1/4 ถูกต้อง |
| Ticket 10 — pose throttle | instrumentation ต้องไม่ทำให้ throttle หายหรือ loop วิ่ง/ค้างผิดสังเกตได้; exact boundary ใช้ Vitest |
| React render frequency | ค่า ms ไม่ควรทำให้ UI กระตุกจากการ setState ทุกเฟรม; scroll/settings ยังใช้งานปกติ |
| per-camera isolation | กล้อง 2 ต้องไม่แย่ง/ทับค่า inference ของกล้อง 1 |
| source switch | เปลี่ยน device แล้ว loop ต้องกลับมาและค่า ms ไม่กลายเป็น NaN/หายถาวร |
| alert side effect | timing instrumentation, mode toggle, add/remove camera หรือ switch device ไม่ควรสร้าง alert/EventLog เอง |
| runtime stability | Console หลัง Clear ไม่มี uncaught / React / MediaPipe / canvas error ใหม่ |

---

## กรณีที่ทำด้วยมือไม่ได้หรือไม่ควรบังคับทำ

### 1. สูตร EMA ต้องเป็น 0.9 ค่าเก่า / 0.1 ค่าใหม่แบบ exact

ไม่ควรพยายามคำนวณย้อนจากตัวเลขบนจอ เพราะ UI round เป็นจำนวนเต็มและเวลาจริงของ MediaPipe มี jitter

พิสูจน์ด้วย Vitest:

- ไฟล์: `src/lib/inferenceTiming.test.ts`
- test: **`weights the old EMA at 0.9 and the new sample at 0.1`**
- test: **`starts from the zero-valued ref required by the ticket`**
- test: **`smooths successive inference samples without rounding the stored EMA`**

manual smoke พิสูจน์เพียงว่าค่า EMA ถูก wire มาถึง UI จริง

### 2. exact 500 ms summary cadence

ไม่ควรใช้ stopwatch หรืออัดจอแล้วบังคับตัดสินว่า state update เกิด “ทุก 500.000 ms” เพราะ browser scheduling/rAF และ React rendering มี jitter

ไม่มี dedicated Vitest ที่จำลอง React summary tick โดยตรงใน Ticket 11; จุดนี้ถูกตรวจใน code review ว่า `setPoseInferenceMs(Math.round(poseInferenceMsRef.current))` อยู่ใน `maybeEmitPeopleSummary()` เดิมที่ใช้ `PEOPLE_SUMMARY_INTERVAL_MS = 500` และไม่ได้อยู่ใน per-frame rAF path

manual smoke จึงเช็คเพียง behavior: ตัวเลขเปลี่ยนเป็นระยะโดย UI ไม่ re-render/jitter ทุก animation frameอย่างเห็นได้ชัด

### 3. exact throttle boundary ~83.33 ms / 12 Hz

ไม่ควรนับ skeleton frame ด้วยตาเพื่อพิสูจน์ exact boundary

พิสูจน์ด้วย:

- `src/lib/poseThrottle.test.ts`
- **`throttles IP camera ticks until the pose interval elapses`**
- **`throttles local video even when a new frame is available`**
- **`keeps the video new-frame check in addition to the throttle`**

Ticket 11 smoke เช็คเพียงว่า timing instrumentation ไม่ทำให้ behavior ของ Ticket 10 พัง

### 4. skipped rAF tick ต้องเก็บ pose ล่าสุด และ source switch ต้องล้าง cache

การมองด้วยตาช่วยหา flicker/ghost ได้ แต่ exact cache semantics พิสูจน์ deterministic ด้วย:

- `src/lib/poseResultCache.test.ts`
- **`keeps the latest pose result when an animation tick has no new pose result`**
- **`replaces the cached pose result when a new result arrives`**
- **`starts empty after the camera source changes`**

### 5. t = 0 / edge case ของ sustained alert state machine

ไม่เกี่ยวกับ inference display โดยตรง และ browser ไม่สามารถสร้าง timestamp exact `t=0` อย่าง deterministic จึงไม่ควรบังคับทำใน smoke นี้

พิสูจน์ด้วย:

- `src/lib/sustainedAlertMachine.test.ts`
- **`alerts once when a bad posture starting at t=0 reaches the sustained duration`**
- **`preserves zero-valued signal and recovery timestamps`**

Ticket 11 smoke ตรวจเพียงว่า instrumentation ไม่สร้าง alert/EventLog side effect

### 6. exact mapping Workstation = 1 / Multi = 4

manual ดู status line เพื่อยืนยัน wiring แต่ mapping exact มี Vitest:

- `src/lib/multiPerson.test.ts`
- **`uses one person for workstation mode`**
- **`uses four people for multi mode`**

ไม่ต้องหา 4 คนจริงมายืนหน้ากล้อง เพราะเกิน scope Ticket 11 และกลายเป็น HITL ของ Ticket 17

---

## เกณฑ์สรุปรวมของ Ticket 11

Manual browser smoke ของ Ticket 11 = **PASS** เมื่อ:

- Scenario 1 ผ่าน: 1 webcam / Workstation แสดง finite inference ms และ overlay/UI ไม่ regression
- Scenario 2 ผ่าน: Workstation ↔ Multi recover และทั้งสอง mode มี inference ms ให้เปรียบเทียบ
- Scenario 3 ผ่าน: 2 webcams เปิดพร้อมกันจริงและแต่ละ CameraStage มี inference ms ของตัวเอง
- Scenario 4 ผ่าน: switch webcam แล้ว overlay + inference display recover
- EventLog ไม่เพิ่มจาก instrumentation/mode/camera operations เพียงอย่างเดียว
- Console หลัง Clear ไม่มี runtime/React/MediaPipe/canvas error ใหม่
- ไม่ใช้ numeric performance threshold เป็นเงื่อนไข PASS

ถ้าไม่มี webcam ตัวที่ 2 หรือ driver เปิดสองตัวพร้อมกันไม่ได้ ให้ Scenario 3 เป็น **BLOCKED** และสรุป Ticket เป็น **INCOMPLETE / BLOCKED MANUAL VERIFICATION** ไม่ใช่ PASS เต็ม เพราะ requirement “ใช้เทียบกล้อง 1 ตัวกับ 2 ตัว” ยังไม่ได้พิสูจน์บน browser จริง

---

## ตารางสรุปผล

| Scenario | ผล (PASS / FAIL / BLOCKED / INVALID / NOT RUN) | วันที่ทดสอบ | Browser / OS | กล้องที่ใช้ | Vite URL | ค่า inference ที่สังเกต / EventLog / Console / หมายเหตุ |
|---|---|---|---|---|---|---|
| 1 — 1 webcam / Workstation: inference ms + overlay regression | NOT RUN |  |  |  |  |  |
| 2 — Workstation ↔ Multi: model recover + ค่า ms ทั้งสอง mode | NOT RUN |  |  |  |  |  |
| 3 — 2 webcams: inference ms แยกต่อ CameraStage | NOT RUN |  |  |  |  |  |
| 4 — Switch webcam device: overlay + inference recover | NOT RUN |  |  |  |  |  |
| Optional — IP MJPEG inference display | NOT RUN |  |  |  |  |  |
| **สรุป Ticket 11** | **NOT RUN** |  |  |  |  |  |

### ข้อมูล environment ของรอบที่ทดสอบ

- วันที่ทดสอบ:
- ผู้ทดสอบ:
- Browser + version:
- OS + version:
- Node: `v26.1.0`
- npm: `12.0.2`
- Vite URL:
- Camera permission: Allow / Block
- Webcam 1 ยี่ห้อ/รุ่น:
- Webcam 2 ยี่ห้อ/รุ่น:
- เปิดสอง webcam พร้อมกันได้หรือไม่:
- Face features: ปิด
- Backend: ไม่ได้รัน / อื่น ๆ:
- Workstation inference samples (1 camera):
- Multi inference samples (1 camera):
- Workstation inference samples (2 cameras — กล้อง 1 / กล้อง 2):
- Multi inference samples (2 cameras — กล้อง 1 / กล้อง 2):
- Console error ที่พบ (ถ้ามี):
- EventLog เพิ่มจาก instrumentation/mode/camera operation หรือไม่:
- หมายเหตุเรื่อง skeleton flicker / freeze / source switch:
- หมายเหตุเพิ่มเติม:
