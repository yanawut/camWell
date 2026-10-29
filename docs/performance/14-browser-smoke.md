# Ticket 14 — Manual browser smoke test

Ticket นี้เป็น refactor เชิงโครงสร้าง: ย้าย logic ต่อ pose frame ที่ไม่เกี่ยวกับ UI ออกจาก `CameraStage` ไปอยู่ใน `src/lib/postureEngine.ts` โดยพฤติกรรมบนหน้าเว็บต้องเหมือนเดิม ทั้ง tracking, posture alert, fall event, break timer และ calibration wiring

เอกสารนี้เป็น smoke test เฉพาะ Ticket 14 ไม่ใช่ HITL accuracy test แบบ Ticket 17 จึงเน้นว่า refactor แล้ว wiring จากกล้อง → engine → UI/callback ยังทำงานถูก ไม่มี regression ที่ browser เท่านั้นจะเห็น เช่น overlay กระพริบ, track หลุดง่าย, alert ซ้ำ หรือ UI ค้าง

## Prerequisites / config

- ใช้ workspace `camWell` บนเครื่องโดยตรง ไม่ใช้ WSL
- Node/npm ต้องใช้งานโปรเจกต์นี้ได้
  - environment ที่ใช้ทำ automated verification ของ Ticket นี้: Node `v26.1.0`, npm `12.0.2`
  - ตรวจได้ด้วย `node -v` และ `npm -v`
- ถ้ายังไม่มี `node_modules/` ให้รันจาก root:
  ```bash
  npm install
  ```
- รัน frontend จาก root:
  ```bash
  npm run dev
  ```
- URL ปกติ: `http://localhost:5173`
  - ถ้า port 5173 ถูกใช้อยู่ ให้ใช้ URL ที่ Vite แสดงใน terminal แทน
- ใช้ Chrome desktop บนคอมพิวเตอร์
- ใช้ webcam จริง **1 ตัวก็พอ**
  - Ticket 14 ไม่ใช่ multi-camera ticket จึงไม่ต้องใช้ 2 กล้อง
- Core smoke **ไม่ต้องรัน `backend/`**
  - ให้ปิดฟีเจอร์เกี่ยวกับใบหน้า เพื่อให้ smoke นี้ทดสอบ pose/posture engine โดยไม่พึ่ง identity backend
- เฉพาะ Scenario 4 (optional regression เรื่องชื่อ identity ระหว่าง active alert) เท่านั้นที่ต้องรัน backend:
  ```bash
  cd backend
  npm install
  # เตรียม .env จาก .env.example ถ้ายังไม่มี
  npm run dev
  ```
  backend ปกติอยู่ที่ `http://localhost:4000` และต้องมีคนที่ลงทะเบียนใบหน้าไว้แล้ว
- เปิด Chrome DevTools → **Console** ก่อนเริ่มทุก scenario และ Clear console ก่อนเริ่ม scenario ใหม่

### SettingsPanel สำหรับ Core smoke

ตั้งดังนี้ก่อน Scenario 1–3:

- **เปิดเสียงแจ้งเตือน:** เปิด
- **เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition):** ปิด
- **โหมดการตรวจจับ:** `ใช้คนเดียว (Personal Workstation) — แนะนำ`
- ท่านั่ง:
  - `มุมคอที่ยอมรับได้ (forward head)`: ใช้ค่าเดิม
  - `มุมลำตัวที่ยอมรับได้ (หลังค่อม)`: ใช้ค่าเดิม
  - `มุมเอียงไหล่ที่ยอมรับได้`: ตั้ง **5°** เพื่อให้ smoke ท่า leaning ทำได้ง่าย
  - `หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน`: ใช้ค่าเดิม
  - `นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน`: ตั้ง **2s**
- Fall settings: ใช้ค่าเดิม ไม่ต้องปรับ
- Break settings: ใช้ค่าเดิม ไม่ต้องรอ positive break reminder ใน browser smoke นี้

## การเตรียมกล้อง/ผู้ทดสอบก่อนแต่ละ scenario

1. อนุญาตสิทธิ์ Camera ให้ `localhost` ใน Chrome
2. ในช่องแหล่งภาพกล้อง เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
3. ถ้ารายชื่อกล้องยังว่าง ให้กด `รีเฟรชรายชื่อกล้อง` หลังอนุญาตสิทธิ์
4. ตั้งกล้องไว้ด้านหน้า ไม่ใช้มุมด้านข้างสำหรับ smoke หลัก
5. นั่งห่างกล้องประมาณ 0.8–1.2 เมตร หรือระยะที่ทำให้เห็นศีรษะ ไหล่ และถ้าเป็นไปได้สะโพก
6. ให้แสงส่องด้านหน้าหรือเฉียงด้านหน้า หลีกเลี่ยง backlight แรง
7. นั่งกลางเฟรม ไม่ให้ไหล่หรือศีรษะหลุดขอบภาพ
8. เปิด DevTools Console และ Clear ก่อนเริ่ม
9. รอจน banner `กำลังโหลดโมเดล Pose Landmarker...` หาย และภาพกล้องพร้อม
10. อย่าทำท่าหกล้มจริง อย่าทิ้งตัวแรง และอย่าล้มจากเก้าอี้เพื่อทดสอบ Ticket นี้

---

## Scenario 1 — Engine wiring + overlay/track ยังเสถียรหลัง extraction

**เป้าหมาย:** พิสูจน์ว่า `CameraStage` ส่ง landmarks เข้า `PostureEngine` ได้ต่อเนื่อง และข้อมูล track ที่ engine คืนกลับมายังใช้วาด/แสดงสถานะได้โดยไม่เกิด regression จากการย้าย logic

### ขั้นตอน

1. Reload หน้า `http://localhost:5173`
2. อนุญาตกล้องถ้า Chrome ถาม
3. ตรวจ Settings ตาม Core smoke ด้านบน และให้ face features ปิด
4. นั่งตรงกลางเฟรมในท่าปกติ ค้าง **10 วินาที**
5. ระหว่าง 10 วินาที สังเกต:
   - skeleton สีฟ้า/จุด landmark บนภาพ
   - บรรทัด `ตรวจพบในเฟรม: ... คน ... · Pose ใช้เวลา ~... ms/ครั้ง`
6. ขยับตัวช้า ๆ ซ้ายประมาณ 10–20 ซม. แล้วกลับกลาง จากนั้นขยับขวาแบบเดียวกัน รวมประมาณ **10 วินาที**
7. ยก/ลดไหล่เล็กน้อยและหันศีรษะเล็กน้อย แต่ยังอยู่ในเฟรม
8. ดู Console ตลอดช่วงทดสอบ

### Expected result

- overlay/skeleton ตามตัวต่อเนื่อง ไม่หายสลับทุกเฟรมและไม่กระพริบผิดปกติ
- เส้น skeleton ไม่ค้างอยู่ตำแหน่งเก่าขณะตัวขยับ
- บรรทัดสถานะควรขึ้นประมาณ:
  - `ตรวจพบในเฟรม: 1 คน (รองรับสูงสุด 1 คน) · Pose ใช้เวลา ~N ms/ครั้ง`
- ค่า Pose ms ต้องเป็นตัวเลขที่อัปเดตได้ ไม่เป็น `NaN` และ UI ไม่ค้าง
- การขยับช้า ๆ ไม่ควรทำให้จำนวนคนสลับ 0/1 รัว ๆ ถ้าร่างกายยังเห็นชัด
- ไม่ควรมี alert สีแดงถ้ายังอยู่ในท่าปกติ
- Console ต้องไม่มี uncaught error / React error / exception จาก `PostureEngine`, tracker หรือ pose loop

### PASS

ผ่านเมื่อ overlay และ person tracking ยังดูต่อเนื่องตลอดการขยับ, status line อัปเดต, หน้าเว็บยังลื่น และ Console ไม่มี error

### FAIL

ถือว่า fail ถ้าเกิดอย่างใดอย่างหนึ่ง:

- skeleton กระพริบ/หายรัวทั้งที่ pose ยังเห็นชัด
- people count สลับผิดปกติขณะผู้ทดสอบอยู่กลางเฟรม
- overlay ค้างหลังตัวขยับ
- UI freeze หรือ pose status หยุดอัปเดต
- Console มี runtime exception
- alert posture เริ่มเองทั้งที่นั่งท่าปกติชัดเจนต่อเนื่อง

> หมายเหตุ: smoke นี้เช็ก regression เชิง browser แบบ qualitative เท่านั้น ไม่วัด 12 FPS หรือ benchmark inference เพราะเป็น scope ของ Ticket 10/11 และ HITL ภายหลัง

---

## Scenario 2 — Calibration → posture start event → banner/EventLog → posture end event

**เป้าหมาย:** พิสูจน์ path สำคัญที่ถูก refactor: raw features สำหรับ calibration ยังออกจาก engine ได้ถูก, posture state machine อยู่ใน engine, แต่ banner/เสียง/callback/EventLog ที่ React เป็นเจ้าของยังทำงานเหมือนเดิม

### เตรียมก่อนเริ่ม

- ใช้ Settings Core smoke
- ยืนยัน `มุมเอียงไหล่ที่ยอมรับได้ = 5°`
- ยืนยัน `นั่งท่าไม่ดีต่อเนื่อง... = 2s`
- face features ปิด
- เปิดเสียงแจ้งเตือน
- นั่งตรง หันหน้ากล้อง เห็นไหล่ทั้งสองข้างชัด
- Clear Console

### ขั้นตอน

1. นั่งท่าที่ถือว่าเป็น “ท่าดี” และอย่าขยับมาก
2. กดปุ่ม:
   - `Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)`
   - หรือถ้ามี baseline เดิม: `Calibrate ท่านั่งดีใหม่`
3. ค้างท่าดีอย่างน้อย **4 วินาที**
4. ระหว่าง calibrate ต้องเห็นปุ่มเปลี่ยนเป็น `กำลัง Calibrate...`
5. หลังครบเวลา ตรวจข้อความใต้ปุ่ม
6. ถ้า calibrate สำเร็จ ให้เริ่มจากท่าดีอีก **2 วินาที**
7. จากนั้น **เอียงตัวด้านข้างอย่างปลอดภัย** โดยลดไหล่ข้างหนึ่งชัดเจนและค้างประมาณ **4–5 วินาที**
   - ไม่ต้องล้ม ไม่ต้องทิ้งตัว
   - ให้ศีรษะและไหล่ยังอยู่ในเฟรม
8. สังเกตขอบกล้อง/banner และฟังเสียง
9. เลื่อนดู `ประวัติการแจ้งเตือนวันนี้`
10. ขณะ alert active ให้กลับมานั่งท่าที่ calibrate ไว้และค้าง **อย่างน้อย 2 วินาที**
11. สังเกตว่า banner หาย และดู EventLog แถวเดิม
12. ดู Console

### Expected result

หลัง calibration:

- ต้องเห็นข้อความ `Calibrate ท่านั่งสำเร็จ ✓ ระบบจะเทียบกับท่านี้เป็นหลัก`
- ถ้า calibration fail เพราะ pose ไม่ชัด ให้จัดตัวใหม่แล้วทำซ้ำ; failure จากการมองไม่เห็นตัวไม่ถือเป็น Ticket 14 regression

เมื่อเอียงไหล่ต่อเนื่อง:

- หลังผ่าน threshold + smoothing โดยประมาณ ต้องเกิด alert **หนึ่ง event** ไม่ยิง event ใหม่ทุก frame
- ขอบกล้อง/พื้นที่กล้องต้องเข้าสถานะแจ้งเตือน
- banner ต้องขึ้นลักษณะ `⚠ คนที่ 1: นั่งเอียงข้าง` หรือ label คนปัจจุบันที่เทียบเท่า
- ถ้าเสียงเปิด ต้องได้ยิน beep ตอน event เริ่ม **ครั้งเดียว** ไม่ beep ทุก frame
- EventLog ต้องเพิ่ม **1 แถว**
  - หมวด: `ท่านั่ง`
  - ประเภท: `นั่งเอียงข้าง`
  - ระยะเวลา: `กำลังดำเนินอยู่...` ขณะยัง alert
  - metrics มีค่ามุม เช่น `neckAngleDeg`, `torsoAngleDeg`, `shoulderTiltDeg`

เมื่อกลับท่าดี:

- หลัง good hysteresis ประมาณ 1 วินาที banner ต้องหาย
- EventLog ต้องอัปเดต **แถวเดิม** ให้มีระยะเวลาจบแล้ว
- ต้องไม่เพิ่ม posture row ใหม่เพียงเพราะ event จบ
- Console ไม่มี error

### PASS

ผ่านเมื่อ calibration สำเร็จ, posture event เริ่มเพียงครั้งเดียว, UI/banner/เสียง/EventLog ได้ event จาก engine ถูกต้อง และ event เดิมจบเมื่อกลับท่าดี

### FAIL

- calibration สำเร็จแต่ posture status/alert path หยุดทำงาน
- alert เริ่มซ้ำหลาย row ขณะค้างท่าเดิม
- beep รัวทุก pose frame
- banner active แต่ EventLog ไม่เพิ่ม หรือ EventLog เพิ่มแต่ banner ไม่ active
- กลับท่าดีแล้ว EventLog ค้าง `กำลังดำเนินอยู่...` นานเกินสมเหตุผล
- Console มี exception

---

## Scenario 3 — Active posture alert แล้วคนออกจากเฟรม: stale track ต้องปิด event ครั้งเดียว

**เป้าหมาย:** regression สำหรับ boundary ระหว่าง engine tracker กับ React state หลัง extraction โดยเฉพาะ `removedTrackIds` + `endedEvents`

### เตรียมก่อนเริ่ม

- ใช้ calibration จาก Scenario 2
- Settings เหมือน Scenario 2
- เริ่มโดยนั่งกลางเฟรม
- Clear Console

### ขั้นตอน

1. เอียงไหล่เหมือน Scenario 2 และค้าง **4–5 วินาที** จน banner posture alert active และ EventLog มีแถว active
2. เมื่อ alert active แล้ว ให้ **ลุก/เคลื่อนออกด้านข้างช้า ๆ** จนทั้งตัวออกจากเฟรม
   - อย่าก้มพรวดหรือทิ้งตัวลงด้านล่าง เพราะอาจกระตุ้น fall detector
3. อยู่นอกเฟรม **อย่างน้อย 5 วินาที**
4. สังเกต status line และ EventLog
5. รอเพิ่มอีก **2 วินาที** โดยยังอยู่นอกเฟรม
6. กลับเข้ากล้องในท่าปกติและนั่งกลางเฟรม **5 วินาที**
7. ตรวจ EventLog อีกครั้งและดู Console

### Expected result

- หลัง track stale (ประมาณ 4 วินาที) จำนวนคนต้องลดเป็น 0
- posture alert ที่ active ก่อนออกจากเฟรมต้องถูก end
- EventLog แถวเดิมต้องเปลี่ยนจาก `กำลังดำเนินอยู่...` เป็นระยะเวลาที่จบแล้ว
- ต้องเกิด end เพียงครั้งเดียว ไม่มี duplicate posture rows ระหว่างที่ยังอยู่นอกเฟรม
- banner posture ต้องไม่ค้างหลัง track ถูกลบ
- เมื่อกลับเข้ากล้อง ระบบต้องสร้าง/ติดตามคนใหม่ได้และ status line กลับมาพบ 1 คน
- ไม่มี stale alert จาก track เก่าติดอยู่
- Console ไม่มี error

### PASS

ผ่านเมื่อ stale track ปิด active posture event ครั้งเดียว, UI state ถูก cleanup และกลับมาตรวจคนได้ปกติเมื่อเข้ากล้องอีกครั้ง

### FAIL

- คนหายจากเฟรมเกิน 5 วินาทีแต่ posture banner/EventLog ยัง active
- EventLog สร้างแถวจบซ้ำ
- กลับเข้ากล้องแล้วคนใหม่ไม่ถูก track
- banner ของคนเก่าค้าง
- Console มี runtime exception

---

## Scenario 4 — Optional regression: ชื่อของ posture event ต้องไม่เปลี่ยนกลาง event หลัง identity resolve

Scenario นี้มาจาก finding ใน code review ของ Ticket 14 และเป็น integration ระหว่าง React ref กับ identity จึงเหมาะกับ browser มากกว่า pure engine test

**Scenario นี้ไม่ใช่ Core smoke gate** เพราะต้องใช้ backend + ข้อมูลใบหน้าที่ลงทะเบียนไว้ และ timing ของ identity เป็น async

### Prerequisites เพิ่มเติม

- รัน `backend/` ที่ `http://localhost:4000`
- มีใบหน้าของผู้ทดสอบที่ลงทะเบียนไว้แล้วอย่างถูกต้อง
- เริ่ม Scenario ด้วย face features **ปิด**
- Settings posture เหมือน Scenario 2
- Clear Console

### ขั้นตอน

1. ขณะ face features ปิด ให้ทำท่า leaning ค้าง **4–5 วินาที** จน posture alert เริ่ม
2. ตรวจ EventLog ว่าแถว posture active ใช้ label ณ ตอนเริ่ม เช่น `คนที่ 1`
3. ยังรักษาท่าที่ทำให้ alert active อยู่ แล้วเปิด:
   - `เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)`
4. รอประมาณ **4–6 วินาที** ให้ identity recheck มีเวลาทำงาน
5. ตรวจว่าระบบสามารถเปลี่ยน label ปัจจุบันของคนเป็นชื่อที่ลงทะเบียนได้ถ้าจับคู่สำเร็จ
6. กลับมาท่าดีและค้าง **2 วินาที** เพื่อจบ posture alert
7. ตรวจ posture row เดิมใน EventLog

### Expected result

- posture row ที่เริ่มด้วย label ใด ต้องยังใช้ label **เดียวกัน** ตอน event จบ
- ตัวอย่าง: ถ้าเริ่มเป็น `นั่งเอียงข้าง (คนที่ 1)` หลัง identity resolve แล้ว event จบ แถวนั้นต้องไม่ถูกเปลี่ยนย้อนหลังเป็นชื่อพนักงาน
- identity ปัจจุบันของ person UI สามารถเปลี่ยนเป็นชื่อจริงได้ตามปกติ
- Console ไม่มี error

### PASS / FAIL

- PASS: event history รักษา `personName` ณ ตอน start
- FAIL: EventLog ของ event ที่เริ่มไปแล้วเปลี่ยนชื่อย้อนหลังเมื่อ identity resolve

---

## Regression checks ที่ automated test อย่างเดียวไม่พอ

สิ่งเหล่านี้ต้องดูใน Chrome เพราะ pure Vitest ไม่เห็น canvas/React rendering/ความลื่น:

- overlay/skeleton ไม่กระพริบหลังย้าย tracker เข้า engine
- skeleton ไม่ค้างตำแหน่งเก่าขณะขยับ
- people count ไม่กระโดดผิดปกติระหว่างการเคลื่อนตัวเบา ๆ
- status line `Pose ใช้เวลา ~... ms/ครั้ง` ยังอัปเดต และหน้าไม่ freeze
- calibration button/message ยังทำงานผ่าน boundary ใหม่ระหว่าง engine กับ React
- posture start/end จาก engine ไปถึง banner, เสียง และ EventLog ถูกต้อง
- stale track cleanup ไม่ทิ้ง active banner/EventLog ค้าง
- Console ไม่มี uncaught error ระหว่าง rAF loop

สิ่งที่ **ไม่ต้อง** ทำใน Ticket 14 smoke เพื่อไม่ซ้ำ Ticket 17 หรือ Ticket อื่น:

- ไม่ benchmark ความแม่นยำของแต่ละ posture กับหลายมุมกล้อง
- ไม่วัด FPS เชิงตัวเลข/โหลด CPU เป็นเวลานาน
- ไม่ทดสอบหลายคนหรือหลายกล้องแบบเต็มรูปแบบ
- ไม่ทดสอบ IP camera/CORS
- ไม่ทดสอบ face fatigue/distance accuracy
- ไม่ทดสอบ fall accuracy ด้วยการล้มจริง

---

## กรณีที่ไม่ควรบังคับทำด้วยมือ และ Vitest ที่พิสูจน์แทน

### 1. ท่าผิดจำลองครบเวลาแล้วต้องได้ start event เพียงครั้งเดียวแบบ deterministic

ไม่ควรใช้ stopwatch ใน browser เพื่อยืนยัน exact state-machine timing เพราะ smoothing/frame cadence ทำให้เวลาที่เห็นบน UIคลาดได้เล็กน้อย

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureEngine.test.ts`
- test: `emits exactly one posture start event after 10 seconds of sustained bad posture`

### 2. Active posture event ต้อง end ครั้งเดียวเมื่อ track stale

Browser Scenario 3 เช็ก wiring แบบคร่าว ๆ แต่ exact event count/timing ใช้ Vitest เป็นหลัก

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureEngine.test.ts`
- test: `emits exactly one posture end event when an alerted track goes stale`

### 3. Break reminder ครบ threshold แล้วต้องยิงครั้งเดียว

SettingsPanel ตั้งเวลาเตือนพักต่ำสุด 15 นาที การนั่งรอ 15 นาทีเพื่อ smoke test Ticket 14 ไม่คุ้มและซ้ำงาน HITL/long-run verification

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureEngine.test.ts`
- test: `emits a break reminder only once when the sitting duration reaches the threshold`

ดังนั้น Core browser smoke แค่ยืนยันว่า pose presence/engine/UI ทำงานปกติ ไม่ต้องรอ break positive event

### 4. Direct fall event เมื่อ synthetic time เริ่มที่ `t=0`

นี่เป็น regression จาก code review และเป็น edge case ของ pure state/time logic ไม่สามารถสร้าง `Date.now() = 0` ใน browser smoke ปกติได้อย่างมีความหมาย

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureEngine.test.ts`
- test: `allows the first direct fall alert when synthetic time starts at zero`

### 5. Rapid drop แล้วหายจากเฟรมต้องได้ `fall_suspected_left_frame` ครั้งเดียว

**ห้ามตั้งใจล้ม/ตกจากเก้าอี้เพื่อ smoke test**

นอกจากเสี่ยงบาดเจ็บแล้ว การสร้าง shoulder drop ที่ตรง threshold ด้วยร่างกายจริงยังไม่ deterministic และเป็นเรื่อง accuracy/HITL มากกว่า refactor wiring

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureEngine.test.ts`
- test: `emits fall_suspected_left_frame exactly once after a rapid drop followed by 5 seconds of absence`
- helper regressions เพิ่มเติมอยู่ใน `src/lib/fallDetection.test.ts`

การตรวจ fall ด้วยกล้องจริงแบบเต็มรูปแบบให้ทำใน Ticket 17 ไม่ใช่ smoke ของ Ticket 14

---

## เกณฑ์ Core smoke PASS ของ Ticket 14

ถือว่า Manual browser smoke ของ Ticket 14 ผ่านเมื่อ:

1. Scenario 1 ผ่าน
2. Scenario 2 ผ่าน
3. Scenario 3 ผ่าน
4. Chrome Console ไม่มี runtime error ที่เกิดจาก flow นี้
5. ไม่พบ regression ใหม่ด้าน overlay/track/UI responsiveness
6. ไม่ต้องผ่าน Scenario 4 ถ้าไม่ได้เตรียม backend/identity; ให้ระบุว่า `SKIP (optional identity regression)`

ถ้า Scenario 1–3 ข้อใด fail ให้ถือ Ticket 14 manual smoke เป็น FAIL และบันทึกรายละเอียดก่อนแก้โค้ด

---

## ตารางสรุปผลการทดสอบ

**วันที่ทดสอบ:** ____________________

**ผู้ทดสอบ:** ____________________

**Browser / version:** Chrome ____________________

**OS:** ____________________

**Webcam ที่ใช้ (ยี่ห้อ/รุ่น หรือ Integrated Camera):** ____________________

**Frontend URL:** ____________________

**Node / npm:** ____________________

**Backend:** ไม่ได้รัน / รันที่ ____________________

| Scenario | ผล | หมายเหตุ |
|---|---|---|
| 1 — Engine wiring + overlay/track stability | ☐ PASS ☐ FAIL | |
| 2 — Calibration + posture start/end + EventLog | ☐ PASS ☐ FAIL | |
| 3 — Active alert + stale track cleanup | ☐ PASS ☐ FAIL | |
| 4 — Optional identity-name lifecycle | ☐ PASS ☐ FAIL ☐ SKIP | |
| Console ไม่มี runtime error | ☐ PASS ☐ FAIL | |
| **Core smoke รวม** | ☐ PASS ☐ FAIL | |

### ถ้า FAIL ให้บันทึก

- ขั้นตอนที่ fail:
- สิ่งที่เห็นจริง:
- สิ่งที่คาดหวัง:
- Console error:
- screenshot/video ที่เก็บไว้:
- ทำซ้ำได้หรือไม่:
