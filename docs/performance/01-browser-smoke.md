# 01: Manual browser smoke — Vitest + sustained alert ที่รองรับเวลา 0

เอกสารนี้ใช้ยืนยันเฉพาะ browser integration ของ Ticket 01 หลัง automated tests / code review ผ่านแล้ว ไม่ใช่ HITL รอบใหญ่ของ Ticket 17 และไม่ใช้แทน Vitest สำหรับ edge case ที่ต้องควบคุมเวลาแบบเจาะจง

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket นี้เปลี่ยน test harness และแก้ `stepSustainedAlert` ให้ถือ timestamp ค่า `0` เป็นค่าที่มีอยู่จริง พร้อมเพิ่ม regression tests ของ fall-detection pure functions

Manual smoke จึงพิสูจน์เฉพาะสิ่งที่ automated test อย่างเดียวมองไม่เห็น:

- Vite dev app ยังเปิดใน Chrome ได้หลังเพิ่ม Vitest
- กล้อง local + Pose Landmarker ยังเริ่มทำงานและวาด overlay ได้
- posture status จากกล้องจริงยังไหลเข้าสู่ sustained alert state machine
- alert เริ่มเมื่อท่าไม่ดีค้างเกิน threshold, ไม่ยิงซ้ำระหว่าง event เดิม และจบเมื่อกลับมาท่าดี
- banner + EventLog + Console ยังเชื่อมกับ state machine ถูกต้อง
- ไม่มี browser runtime error จากการเปลี่ยน Ticket นี้

ไม่ทดสอบหลายกล้อง, การสลับกล้อง, FPS/CPU, IP camera, calibration, identity, dataset หรือ endurance ของ skeleton flicker เพราะเป็น scope ของ ticket อื่น/ Ticket 17

## Prerequisites / config

ใช้เครื่องคอมพิวเตอร์ที่รัน Chrome desktop ได้ และมีกล้อง local อย่างน้อย **1 ตัว** (กล้องในตัวหรือ USB webcam ก็ได้) Ticket 01 ไม่เกี่ยวกับหลายกล้อง จึง **ไม่ต้องมี 2 กล้อง**

Environment ที่ใช้กับ workspace นี้ตอนเขียนเอกสารคือ Node `v24.21.0` และ npm `11.19.0`. สำหรับ smoke แนะนำ Node 24.x + npm ที่มากับ Node 24 เพื่อให้ตรงกับ Vitest 5 ที่ติดตั้งใน Ticket นี้

จาก root ของ repo (ห้ามเข้า `backend/`) รัน:

```bash
npm install
npm run dev
```

เปิด Chrome ที่:

```text
http://localhost:5173/
```

> ถ้า Vite แจ้ง port อื่นเพราะ 5173 ถูกใช้งาน ให้ใช้ URL ที่ Vite พิมพ์จริงใน terminal และบันทึกไว้ในช่องหมายเหตุท้ายไฟล์

### Backend

**ไม่ต้องรัน `backend/` สำหรับ smoke นี้** เพราะทุก scenario ใช้เฉพาะ pose/posture และ sustained alert ซึ่งทำงานใน browser

เพื่อไม่ให้ผลทดสอบปนกับ face/identity ให้ปิด setting:

- `เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)` = **ปิด**

### SettingsPanel ที่ใช้

ตั้งค่าเหล่านี้ก่อน Scenario 2–3:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | ปิด |
| เปิดเสียงแจ้งเตือน | ปิด (ลดตัวแปรจาก autoplay/audio; Ticket นี้ไม่ได้แก้เสียง) |
| มุมคอที่ยอมรับได้ (forward head) | 45° |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | 15° |
| มุมเอียงไหล่ที่ยอมรับได้ | 30° |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | 2s |

การตั้งคอ/ไหล่ไว้สูงช่วยให้ scenario ตั้งใจ trigger `slouching` จากมุมลำตัวเป็นหลัก ไม่ให้ปัญหา posture ชนิดอื่นแทรกง่าย

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome DevTools → **Console** และกด clear log
2. ที่แถบ address bar/permission ของ Chrome ให้ยืนยันว่า `Camera = Allow`
3. ในการ์ดแหล่งภาพกล้อง เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
4. ถ้ามีกล้องหลายตัวในเครื่อง ให้เลือกกล้องที่จะใช้จาก dropdown แล้วใช้กล้องเดิมตลอด smoke
5. จัดกล้องให้เห็น **ศีรษะ, ไหล่ทั้งสองข้าง และสะโพก** ชัดเจน เพราะ posture implementation ปัจจุบันต้องใช้จุดสะโพก
6. นั่งห่างกล้องพอให้ลำตัวอยู่ในเฟรม ไม่ครอปไหล่/สะโพก
7. ใช้แสงด้านหน้าหรือด้านข้างที่สม่ำเสมอ หลีกเลี่ยงย้อนแสงแรง
8. รอ banner `กำลังโหลดโมเดล Pose Landmarker...` หายก่อนเริ่มจับเวลา
9. ระหว่างทดสอบ Console ต้องไม่มี **red error / uncaught exception**  
   - log ระดับ info จาก `[alertReporter]` ตอน alert เริ่ม/จบเป็น expected
   - warning GPU fallback ที่ recover ไป CPU ได้ไม่ถือว่า FAIL ด้วยตัวมันเอง แต่ต้องบันทึกในหมายเหตุ

---

## Scenario 1 — Browser boot + camera/overlay baseline

**เป้าหมาย:** ยืนยันว่าการเพิ่ม Vitest และ test files ไม่ทำให้ dev app/browser integration พัง

### ขั้นตอน

1. เปิด `http://localhost:5173/` ใน Chrome
2. เมื่อ Chrome ขอสิทธิ์กล้อง ให้กด **Allow**
3. เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
4. เลือก webcam ที่ต้องการ หรือใช้ `ค่าเริ่มต้นของเบราว์เซอร์`
5. นั่งตรงให้ศีรษะ–ไหล่–สะโพกอยู่ในเฟรม
6. รออย่างน้อย 5 วินาทีหลัง Pose Landmarker โหลดเสร็จ
7. ขยับศีรษะ/ไหล่เล็กน้อยเพื่อดูว่า overlay ยังตามภาพ
8. ดู status line ใต้กล้องและรายการคน
9. ดู `ประวัติการแจ้งเตือนวันนี้`
10. ตรวจ Console

### Expected result

- ภาพ webcam แสดงต่อเนื่อง
- เห็น skeleton/pose overlay บนภาพ และ overlay ยังตอบสนองต่อการขยับ
- status line ขึ้นประมาณ `ตรวจพบในเฟรม: 1 คน ...`
- รายการคนมี `คนที่ 1` และเมื่อท่าตรงพอควรเห็น `นั่งท่าดี`
- ไม่ควรมี alert banner ขณะนั่งท่าดี
- EventLog แสดง `ยังไม่มีการแจ้งเตือน` หรือจำนวนยังไม่เพิ่มจาก baseline ของการ reload ครั้งนี้
- Console ไม่มี red error / uncaught exception

### PASS

ผ่านเมื่อ camera + overlay + people status ทำงานต่อเนื่องอย่างน้อย 5 วินาที และไม่มี runtime error

### FAIL

ถือว่า fail ถ้า app blank/crash, กล้องเปิดไม่ได้ทั้งที่ permission ถูกต้อง, Pose model ขึ้น error, overlay ไม่ปรากฏเลย, people status ไม่อัปเดตทั้งที่เห็นตัวครบ หรือ Console มี runtime error ที่เกิดซ้ำ

> หมายเหตุ: Ticket 01 ไม่ได้แก้ skeleton flicker จึงไม่ใช้ scenario นี้ตัดสินความนิ่งระดับ Ticket 04/17; ขอแค่ overlay มีชีวิตและไม่ crash

---

## Scenario 2 — Sustained alert: ยังไม่เตือนก่อน threshold และเตือนครั้งเดียวหลังเกิน threshold

**เป้าหมาย:** ตรวจ browser wiring ของ `stepSustainedAlert` ตั้งแต่ pose → posture status → alert banner → EventLog

### เตรียมก่อนเริ่ม

1. Reload หน้าเพื่อให้ EventLog เริ่มจาก state ใหม่
2. ตั้ง SettingsPanel ตามตารางด้านบน โดยเฉพาะ sustained = **2s**
3. จัดท่านั่งตรงจนรายการคนแสดง `นั่งท่าดี` ต่อเนื่องประมาณ 3 วินาที
4. เปิด Console และ clear log

### ขั้นตอน

1. เริ่มจากท่าตรง
2. ค่อย ๆ **เอนลำตัวไปด้านข้างจากสะโพก** ให้เห็นชัด โดยยังให้หัว ไหล่ และสะโพกอยู่ในเฟรม
3. ดูรายการคนจน posture status เปลี่ยนเป็น `หลังค่อม/โน้มตัว`
4. จากจังหวะที่ status เปลี่ยน ให้ค้างท่านี้ประมาณ **1 วินาที** แล้วตรวจ:
   - ยังไม่มี red alert banner
   - EventLog ยังไม่มี posture event ใหม่
5. ค้างท่าเดิมต่อจนรวมอย่างน้อย **3 วินาที** เพื่อเผื่อความคลาดเคลื่อนจากเวลาคนจับด้วยสายตา
6. ตรวจ banner และ EventLog
7. **ยังค้างท่าไม่ดีต่ออีก 4 วินาที** โดยไม่กลับท่าดี
8. ตรวจว่า EventLog ไม่เพิ่ม posture event ซ้ำสำหรับ event เดิม
9. ตรวจ Console

### Expected result

ช่วงประมาณ 1 วินาทีแรก (< 2s):

- status ของคนอาจแสดง `หลังค่อม/โน้มตัว` ทันทีตามเฟรม
- แต่ sustained alert **ยังไม่เริ่ม**
- ไม่มี alert banner จาก posture
- EventLog ยังไม่มี row ใหม่ของหมวด `ท่านั่ง`

เมื่อค้างเกิน 2 วินาที:

- alert banner ปรากฏ และข้อความมี `คนที่ 1: หลังค่อม/โน้มตัว` หรือข้อความเทียบเท่าตาม label ปัจจุบัน
- EventLog เพิ่ม **1 row**:
  - หมวด = `ท่านั่ง`
  - ประเภท = `หลังค่อม/โน้มตัว`
  - ระยะเวลา = `กำลังดำเนินอยู่...`
- Console อาจมี info `[alertReporter] เริ่มแจ้งเตือน ...`
- เมื่อค้างต่ออีก 4 วินาที EventLog ต้องยังมี event เดิม **เพียง 1 row** ไม่ยิง start ซ้ำทุกเฟรม
- camera video, overlay และ status line ยังทำงาน ไม่ค้าง/ไม่ crash
- Console ไม่มี red error / uncaught exception

### PASS

ผ่านเมื่อไม่มี alert ก่อน threshold อย่างชัดเจน, มี alert หลังเกิน threshold และ event เดิมไม่ถูกสร้างซ้ำระหว่างที่ยังค้างท่าไม่ดี

### FAIL

ถือว่า fail ถ้า alert โผล่ทันทีโดยไม่รอ sustained duration, ค้างเกิน 3 วินาทีแล้วยังไม่ alert ทั้งที่ posture status เป็น `หลังค่อม/โน้มตัว` ต่อเนื่อง, มี EventLog หลาย row จาก event เดียว หรือ browser runtime error

> Manual timing ไม่ใช้ตัดสิน boundary ระดับ millisecond; edge case เวลา `t=0` พิสูจน์ด้วย Vitest ด้านล่าง

---

## Scenario 3 — Recovery: กลับท่าดีแล้ว alert จบหลัง hysteresis และไม่ค้างผิดสถานะ

**เป้าหมาย:** ตรวจ browser wiring ฝั่งจบ event หลังกลับมาท่าดี

### เตรียมก่อนเริ่ม

เริ่มต่อจาก Scenario 2 ขณะที่ posture alert ยัง active และ EventLog row แสดง `กำลังดำเนินอยู่...`

ถ้า Scenario 2 ถูก reload ไปแล้ว ให้ทำ Scenario 2 ซ้ำจนได้ active alert ก่อน

### ขั้นตอน

1. จากท่าเอน ให้กลับมานั่งตรงช้า ๆ
2. จัดไหล่และลำตัวให้ตรงจนรายการคนเปลี่ยนเป็น `นั่งท่าดี`
3. ค้างท่าดีอย่างน้อย **2 วินาที**
4. ดู alert banner ระหว่างช่วงกลับท่าดี
5. ดู EventLog row เดิม
6. ค้างท่าดีต่ออีก 3 วินาที
7. ตรวจว่าไม่มี posture event ใหม่เกิดเอง
8. ตรวจ Console

### Expected result

- posture status กลับเป็น `นั่งท่าดี`
- alert ไม่จำเป็นต้องหายทันทีในเฟรมแรก เพราะ state machine มี hysteresis ประมาณ 1 วินาที
- หลังนั่งท่าดีต่อเนื่องประมาณ 1–2 วินาที alert banner ต้องหาย
- EventLog row เดิมเปลี่ยนจาก `กำลังดำเนินอยู่...` เป็นระยะเวลาที่จบแล้ว
- ไม่เพิ่ม row ใหม่เพียงเพราะกลับท่าดี
- Console อาจมี info `[alertReporter] จบการแจ้งเตือน ...`
- overlay/status ยังอัปเดตต่อเนื่อง
- Console ไม่มี red error / uncaught exception

### PASS

ผ่านเมื่อ active event จบหลังกลับท่าดีต่อเนื่อง, EventLog row เดิมถูกปิด และไม่มี duplicate/new event ที่ไม่ควรเกิด

### FAIL

ถือว่า fail ถ้า alert ค้างไม่ยอมจบหลังนั่งท่าดีชัดเจนเกิน 2–3 วินาที, event หาย/ถูกสร้างซ้ำผิดปกติ, EventLog ยัง `กำลังดำเนินอยู่...` ตลอด หรือ browser มี runtime error

---

## Edge cases ที่ไม่ควรบังคับทำด้วยมือ

### 1. Timestamp เริ่มที่ `t=0`

Browser path ปัจจุบันส่ง `Date.now()` เข้า state machine จึงไม่สามารถกด reload แล้วบังคับให้ `candidateSince`, `goodSince` หรือ `lastSignalAt` เท่ากับเลข `0` จริงได้อย่างน่าเชื่อถือ

**ห้ามใช้ stopwatch/manual smoke แทน regression นี้** เพราะ bug เดิมเกิดจาก JavaScript falsy semantics โดยตรง

Vitest ที่พิสูจน์แทน:

- `src/lib/sustainedAlertMachine.test.ts`
  - `alerts once when a bad posture starting at t=0 reaches the sustained duration`
  - `preserves zero-valued signal and recovery timestamps`

สอง test นี้ครอบ `candidateSince=0`, `lastSignalAt=0` และ `goodSince=0` โดยตรง

### 2. Boundary ว่า “ยังไม่ครบ sustained duration”

Vitest ใช้เวลา deterministic และเหมาะกว่า human timing:

- `src/lib/sustainedAlertMachine.test.ts`
  - `does not alert before the sustained duration elapses`

Manual Scenario 2 ตรวจเฉพาะ integration ก่อน/หลัง threshold แบบมีระยะเผื่อ ไม่ใช้ฟันธง boundary ระดับ ms

### 3. Fall detection

Ticket 01 **ไม่ได้แก้ production fall-detection logic** แต่เพิ่ม tests กัน regression ให้ pure functions เท่านั้น และไม่ควรให้ผู้ทดสอบหกล้มจริงเพื่อ smoke test

Vitest ที่พิสูจน์แทน:

- `src/lib/fallDetection.test.ts`
  - `returns null when there is only one torso reading`
  - `reports a 0.30 downward drop from y=0.40 to y=0.70`
  - `does not count upward movement as a drop`
  - `removes readings older than the configured time window`

การตรวจ fall ด้วยกล้องจริงเป็น HITL ของ ticket ภายหลัง ไม่อยู่ใน Ticket 01

## Regression ที่ intentionally ไม่รวมใน Ticket 01

รายการต่อไปนี้สำคัญกับโปรเจกต์ แต่ไม่ควรขยาย smoke ของ Ticket 01 ไปซ้ำ Ticket 17 หรือ ticket performance อื่น:

- skeleton flicker แบบละเอียดขณะเคลื่อนไหว → Ticket 04 / Ticket 17
- สลับ camera source แล้วตรวจ stale overlay → Ticket 04 / Ticket 17
- หลายกล้องพร้อมกัน / ต้องใช้ webcam 2 ตัว → ticket หลายกล้องและ Ticket 17
- วัด pose FPS, inference ms, CPU หรือความลื่น workstation vs multi → Ticket 10–11 / Ticket 17
- identity / face recognition / backend → ไม่เกี่ยวกับ Ticket 01
- ทดสอบหกล้มจริง → ไม่บังคับใน smoke นี้

สำหรับ Ticket 01 ให้สังเกตเพียงว่า overlay/status **ยังทำงานตลอดช่วง alert start/end และไม่ crash** เท่านั้น

## เกณฑ์สรุป Ticket 01 manual smoke

Manual browser smoke ถือว่า **PASS** เมื่อ Scenario 1–3 ผ่านทั้งหมด และไม่มี red runtime error ใน Console

ถ้า scenario ใด fail:

1. จด step ที่ fail
2. จดข้อความบน UI และ Console error แบบเต็ม
3. จด browser/OS/webcam
4. ห้าม tick checklist ใน Ticket จนกว่าจะ reproduce และแก้แล้ว
5. ถ้า fail เฉพาะสิ่งที่อยู่ใน “Edge cases ที่ไม่ควรบังคับทำด้วยมือ” ให้กลับไปดู Vitest ที่ระบุแทน ไม่พยายามสร้าง physical workaround

## ตารางสรุปผล

| Scenario | ผล (PASS/FAIL) | วันที่ทดสอบ | Browser / OS | กล้องที่ใช้ | หมายเหตุ |
|---|---|---|---|---|---|
| 1 — Browser boot + camera/overlay baseline |  |  |  |  |  |
| 2 — Sustained alert start + no duplicate |  |  |  |  |  |
| 3 — Recovery / alert end |  |  |  |  |  |

ข้อมูล environment ของรอบทดสอบ:

- ผู้ทดสอบ:
- วันที่:
- URL dev server:
- Browser + version:
- OS:
- Webcam รุ่น/ชื่อที่ Chrome แสดง:
- Node:
- npm:
- หมายเหตุเพิ่มเติม:
