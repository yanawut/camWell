# 03: Manual browser smoke — ท่านั่ง/เตือนพักไม่ผูกกับฟีเจอร์ใบหน้า

เอกสารนี้ใช้ยืนยันเฉพาะ browser integration ของ Ticket 03 หลัง code review และ automated verification ผ่านแล้ว ไม่ใช่ HITL รอบใหญ่ของ Ticket 17

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 03 ต้องทำให้ผู้ใช้เปิด Camwell แล้วใช้ฟีเจอร์ท่านั่งและเข้าถึงการตั้งค่าเตือนพักได้ โดยไม่ต้องเปิดฟีเจอร์ใบหน้าและไม่ต้องรัน backend

Manual smoke นี้จึงตรวจเฉพาะสิ่งที่ unit test อย่างเดียวพิสูจน์ไม่ได้ครบ:

- cold load ของหน้าเว็บโดย **ไม่รัน `backend/`**
- checkbox ฟีเจอร์ใบหน้าปิดเป็นค่าเริ่มต้นจริงใน UI
- local webcam + Pose Landmarker + overlay ยังเริ่มทำงานได้เมื่อ face features ปิด
- status line และรายชื่อคนใต้กล้องยังแสดงจาก pose แม้ face features ปิด
- posture alert และ EventLog ยังทำงานจริงเมื่อ face features ปิด
- หัวข้อ `เตือนพัก` และ slider ทั้งสองตัวไม่หายเมื่อ face features ปิด
- slider `breakResetMs` แสดงช่วง 1–15 นาทีและปรับค่าได้จริงใน browser
- ไม่มี runtime/React error หรือการพึ่ง backend ที่ทำให้ cold load ของ scope นี้ผิดปกติ

สิ่งที่ **ไม่ใช่ scope ของ Ticket 03** และไม่ใช้ smoke นี้ตัดสิน:

- ความถูกต้องของการ reset break timer หลังหายจากกล้องจริง — เป็น Ticket 05
- skeleton flicker / สลับ source แล้ว skeleton ค้าง — เป็น Ticket 04
- pose FPS / CPU / inference throttling — เป็น Ticket 10–11
- หลายคน/Detection Mode — เป็น Ticket 09
- upper-body quality gate — เป็น Ticket 08
- calibration, smoothing, dataset — tickets หลังจากนี้
- endurance / หลายกล้อง / HITL ครบระบบ — Ticket 17

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจพบตอน implement Ticket นี้:

- Node: `v24.21.0`
- npm: `11.19.0`
- Browser: **Google Chrome desktop**
- Webcam: อย่างน้อย **1 ตัว** (กล้องในตัวหรือ USB webcam)
- Ticket 03 ไม่ได้เปลี่ยน logic หลายกล้อง จึง **ไม่บังคับให้มี 2 webcam**; 1 ตัวพอสำหรับ required smoke

จาก root repo:

```bash
npm install
npm run dev
```

เปิด URL:

```text
http://localhost:5173/
```

ถ้า Vite ใช้ port อื่นเพราะ 5173 ถูกใช้งาน ให้ใช้ URL ที่ terminal แสดงจริงและบันทึก URL นั้นในตารางผลท้ายไฟล์

### Backend

**ห้ามรัน `backend/` ระหว่าง required smoke นี้**

เหตุผลคือ Ticket 03 ต้องพิสูจน์ว่าท่านั่งและการตั้งค่าเตือนพักใช้งานได้โดยไม่ต้องมี backend เมื่อ face features ปิด

ไม่มี scenario บังคับเปิด face recognition / identity ใน Ticket นี้ ดังนั้นไม่ต้องรัน backend เลย

> Regression guard จาก Ticket 02: ก่อน Ticket 03 ตัว `App` เคยมีโอกาสเรียกโหลด identity ตอน initial mount แม้ smoke ไม่ได้ใช้ identity. Scenario 1 ด้านล่างจึงเปิด Console **ก่อนเข้าเว็บ** และห้าม Clear หลัง load เพื่อจับ startup dependency นี้โดยตรง

### SettingsPanel ที่ใช้

ค่าพื้นฐานสำหรับ Scenario 1–3:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ต้องเริ่มเป็นปิดเองหลัง reload** |
| เปิดเสียงแจ้งเตือน | ปิด |
| มุมคอที่ยอมรับได้ (forward head) | 45° |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | 15° |
| มุมเอียงไหล่ที่ยอมรับได้ | 30° |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | 2s |
| นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก | 45 นาที |
| ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว | 3 นาที ก่อนเริ่ม Scenario 3 |

ค่าคอ/ไหล่ตั้งค่อนข้างสูงเพื่อลดโอกาส trigger หลาย posture issue พร้อมกัน ระหว่าง Scenario 2 ให้ตั้งใจ trigger จากลำตัวเป็นหลัก

## การเตรียมร่วมก่อนแต่ละ scenario

1. ใช้ Chrome desktop
2. เปิด DevTools → **Console**
3. ตรวจสิทธิ์ Camera ของ origin Vite ให้เป็น **Allow**
4. ในแหล่งภาพ เลือกกล้อง local / webcam ที่ต้องการใช้
5. วางกล้องไว้ด้านหน้า หรือเฉียงหน้าเล็กน้อย ไม่ใช้มุมด้านข้างเต็มตัว
6. นั่งห่างพอให้เห็น **ศีรษะ, ไหล่ทั้งสองข้าง และสะโพก** เพราะ posture pipeline ณ Ticket 03 ยังต้องเห็นสะโพกเพื่อได้ signal ที่เสถียร
7. ใช้แสงด้านหน้าหรือด้านข้างสม่ำเสมอ หลีกเลี่ยงย้อนแสงแรง
8. รอข้อความ `กำลังโหลดโมเดล Pose Landmarker...` หายก่อนเริ่มจับเวลา
9. เว้นแต่ Scenario 1 ที่ต้องเก็บ cold-load log ให้กด **Clear Console** ก่อนเริ่ม scenario
10. ระหว่าง scenario Console ต้องไม่มี red error, uncaught exception, React error หรือ error ที่เกิดซ้ำจาก action ที่กำลังทดสอบ
11. ถ้า browser แสดง permission error เพราะผู้ทดสอบกด Block เอง ให้แก้ permission แล้วเริ่ม scenario ใหม่ ไม่ถือเป็น product failure

---

## Scenario 1 — Cold load โดยไม่รัน backend + face features ต้องปิดเป็นค่าเริ่มต้น

**เป้าหมาย:** พิสูจน์ requirement หลักว่าเปิดแอปครั้งแรกโดยไม่ต้องรัน backend และ UI ที่ไม่ใช่ face ยังพร้อมใช้งาน

### เตรียมก่อนเริ่ม

1. ยืนยันว่าไม่มี process ของ `backend/` รันอยู่
2. ปิด tab Camwell เดิมทั้งหมด
3. เปิด Chrome tab ใหม่
4. เปิด DevTools → Console **ก่อน** เข้า URL
5. กด Clear Console ตอนนี้ได้หนึ่งครั้ง
6. หลังจากข้อ 7 ด้านล่าง **ห้าม Clear Console** จนจบ scenario

### ขั้นตอน

1. เข้า URL ของ Vite
2. ถ้า Chrome ถามสิทธิ์กล้อง ให้กด **Allow**
3. รอหน้า Camwell render จนครบประมาณ 3–5 วินาที
4. ดู checkbox `เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)`
5. **ห้ามกด checkbox นี้** — ต้องตรวจค่าที่ app เปิดมาเอง
6. เลื่อนลง SettingsPanel
7. ตรวจว่าหัวข้อ `เตือนพัก` แสดงอยู่ทันที
8. ตรวจว่ามี slider:
   - `นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก`
   - `ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว`
9. ตรวจว่ากลุ่ม face-only เช่น `ความเหนื่อยล้า` และ `ระยะห่างจากจอ` ไม่แสดงในขณะที่ checkbox ปิด
10. ตรวจหน้าเว็บว่าไม่ blank, ไม่มี React/Vite error overlay
11. ตรวจ Console ตั้งแต่ cold load จนถึงจุดนี้

### Expected result

- checkbox face features **ไม่ถูกติ๊ก**
- SettingsPanel ยังเห็น `ท่านั่ง`, `หกล้ม / ตกจากเก้าอี้` และ `เตือนพัก`
- หัวข้อ `เตือนพัก` มี 2 sliders
- face-only sections ถูกซ่อนเมื่อ face features ปิด
- หน้าเว็บ render ได้ครบโดยไม่ต้องรัน backend
- Console ไม่มี red error / uncaught exception / React error
- ต้องไม่มี startup failure ที่ทำให้หน้า posture/break ใช้งานไม่ได้

### Regression guard เรื่อง backend

ถ้า Console แสดง error จาก startup เช่น request ไป identity/backend แล้วได้ `ERR_CONNECTION_REFUSED`, `Failed to fetch` หรือ error สีแดงที่เกิดเพราะ backend ไม่ได้รัน ให้ **บันทึกข้อความจริงและถือ Scenario 1 = FAIL** สำหรับ smoke นี้

เหตุผล: Ticket 03 ระบุว่าเปิดแอปโดยไม่ต้องรัน backend และคำสั่ง smoke นี้กำหนดให้ Console ต้องไม่มี error; ห้าม Clear error ทิ้งแล้วนับผ่าน

### PASS

ผ่านเมื่อ face features ปิดเอง, break/posture UI แสดงครบ, app ไม่พังโดยไม่มี backend และ Console สะอาดตลอด cold load

### FAIL

ถือว่า fail ถ้า face checkbox เปิดเอง, break settings ถูกซ่อน, app มี error overlay, หน้าใช้งานไม่ได้เมื่อ backend ปิด หรือ Console มี red startup/runtime error

---

## Scenario 2 — Pose overlay + รายชื่อคน + posture alert ต้องทำงานเมื่อ face features ปิด

**เป้าหมาย:** พิสูจน์ว่า posture UI และ flow จริงไม่ได้ถูกผูกกับ `faceFeaturesEnabled` อีกแล้ว

### เตรียมก่อนเริ่ม

1. เริ่มจาก Scenario 1 ที่ face features ยังปิด
2. เลือก local webcam
3. ตั้ง SettingsPanel ตามตารางด้านบน โดยเฉพาะ:
   - face features = ปิด
   - เสียง = ปิด
   - sustained posture = 2s
4. จัดกล้องให้เห็นหัว–ไหล่–สะโพกครบ
5. นั่งตรงกลางภาพและนิ่งประมาณ **5 วินาที**
6. รอ Pose model พร้อม
7. Clear Console
8. ถ้ามี alert ค้างจาก scenario ก่อน ให้ reload แล้วเตรียมใหม่ก่อนเริ่ม

### ขั้นตอน

1. นั่งตรงต่อประมาณ **5 วินาที**
2. ดู overlay บนภาพและ status line ใต้กล้อง
3. ตรวจว่ามีข้อความประมาณ:
   `ตรวจพบในเฟรม: 1 คน (รองรับสูงสุด ... คนพร้อมกัน)`
4. ตรวจด้านล่าง CameraStage ว่ามีรายการคน เช่น `คนที่ 1 — นั่งท่าดี` หรือ posture status ปัจจุบัน
5. ยืนยันอีกครั้งว่า face checkbox ยังปิดอยู่
6. จากท่าตรง ค่อย ๆ เอนลำตัวไปด้านข้างหรือโน้มลำตัวให้ชัด โดยยังให้หัว–ไหล่–สะโพกอยู่ในเฟรม
7. ค้างท่าไม่ดีประมาณ **3–4 วินาที**
8. สังเกต posture status ของ `คนที่ 1`
9. ตรวจ alert banner
10. ตรวจ `ประวัติการแจ้งเตือน` (EventLog)
11. กลับมานั่งตรงและค้างอย่างน้อย **2 วินาที**
12. ดูว่า UI ไม่ค้าง/crash และ EventLog ยังคงแสดง event ที่เกิดขึ้น
13. ตรวจ Console

### Expected result

ขณะท่าปกติ:

- ภาพ webcam แสดงต่อเนื่อง
- เห็น pose/skeleton overlay ติดตามร่างกาย
- status line จำนวนคนอัปเดต
- รายชื่อคนใต้กล้อง **แสดงแม้ face features ปิด**
- ไม่ต้องเปิด face recognition จึงไม่ควรต้องใช้ identity/backend เพื่อให้ posture status แสดง

เมื่อค้างท่าไม่ดีเกิน sustained 2s:

- posture status เปลี่ยนตามผล pose เช่น `หลังค่อม/โน้มตัว` หรือ issue ที่ตรวจพบจริง
- alert banner ของ posture ปรากฏ
- EventLog เพิ่ม row หมวดท่านั่งหนึ่ง event
- face checkbox ยังคงปิดตลอด
- overlay/status line/people list ยังทำงาน
- Console ไม่มี red error / uncaught exception

### PASS

ผ่านเมื่อ pose overlay, status line, people list, posture status และ posture alert/EventLog ทำงานได้ทั้งหมดโดย face features ปิดและ backend ไม่รัน

### FAIL

ถือว่า fail ถ้า:

- ปิด face แล้ว people list หาย
- status line หยุดอัปเดตทั้งที่ pose ตรวจพบ
- posture status/alert ไม่ทำงานเฉพาะเพราะ face ปิด
- ต้องเปิด face features จึงเห็นรายชื่อคน
- app crash / overlay หายทั้งหมด / Console มี runtime error

> ไม่ใช้ scenario นี้ตัดสินว่า skeleton “ไม่กระพริบเลย” เพราะ flicker เป็น Ticket 04; สำหรับ Ticket 03 ขอเพียง overlay ทำงานและไม่หายเพราะ face toggle

---

## Scenario 3 — Break settings ต้องอยู่นอก face-only block และ `breakResetMs` ต้องปรับได้ 1–15 นาที

**เป้าหมาย:** จับ regression จาก code review ที่ break UI เคยมี structural coupling กับ face visibility และยืนยัน browser wiring ของ slider ใหม่

### เตรียมก่อนเริ่ม

1. backend ยังไม่รัน
2. face features = **ปิด**
3. กล้องจะเปิดหรือไม่ก็ได้ แต่แนะนำให้ใช้กล้องเดิมเพื่อดูว่า UI อื่นยังทำงานต่อเนื่อง
4. Clear Console
5. เลื่อน SettingsPanel มาที่หัวข้อ `เตือนพัก`

### ขั้นตอน

1. ยืนยันว่าหัวข้อ `เตือนพัก` ยังแสดงขณะ face checkbox ปิด
2. ตรวจ slider `นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก` ยังอยู่
3. ตรวจ slider `ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว`
4. เลื่อน `breakResetMs` ลงไปค่าต่ำสุด **1 นาที**
5. อ่านค่าที่แสดงข้าง label ต้องเป็น `1 นาที`
6. เลื่อนขึ้นไปค่ากลาง **3 นาที**
7. อ่านค่าต้องเป็น `3 นาที`
8. เลื่อนขึ้นไปค่าสูงสุด **15 นาที**
9. อ่านค่าต้องเป็น `15 นาที`
10. พยายามลากต่อให้ต่ำกว่า 1 หรือสูงกว่า 15
11. ตรวจว่าค่า UI ไม่ออกนอกช่วง 1–15
12. เลื่อนกลับมา **3 นาที** เพื่อคืนค่าพื้นฐาน
13. ยืนยันว่า face checkbox ยังปิดและ break section ไม่หายระหว่างการปรับ
14. ตรวจ EventLog — การปรับ slider อย่างเดียวไม่ควรสร้าง alert event
15. ตรวจ Console

### Expected result

- break section แสดงเสมอขณะ face features ปิด
- มี slider เตือนพักเดิมและ slider `breakResetMs` ใหม่พร้อมกัน
- `breakResetMs` เปลี่ยนได้ทีละ 1 นาที
- ค่าต่ำสุด = 1 นาที
- ค่าสูงสุด = 15 นาที
- ค่าไม่หลุดช่วง
- การปรับ setting ไม่ทำให้ CameraStage/overlay/status line หาย
- ไม่มี alert/EventLog ใหม่จากการขยับ slider อย่างเดียว
- Console ไม่มี red error / uncaught exception

### PASS

ผ่านเมื่อ break UI ไม่ขึ้นกับ face toggle และ slider ใหม่แสดง/ปรับค่า 1–15 นาทีได้ถูกต้องโดยไม่มี runtime error

### FAIL

ถือว่า fail ถ้า break section หายเมื่อ face ปิด, slider ใด slider หนึ่งอยู่ใน face-only block, slider ใหม่ไม่มี, min/max ไม่ใช่ 1/15, step ไม่เป็น 1 นาที, label แสดงค่าผิด หรือ Console มี runtime error

---

## Scenario 4 — Reload regression: default face ต้องกลับเป็นปิด และ break/people UI ยังอยู่

**เป้าหมาย:** ตรวจ browser state หลัง reload เพื่อกัน regression ที่ default ถูกแก้เฉพาะระหว่าง session แต่ initial state จริงยังผิด

### เตรียมก่อนเริ่ม

1. backend ยังไม่รัน
2. กล้อง local เคยอนุญาต permission แล้ว
3. ก่อน reload สามารถตั้ง `breakResetMs` เป็นค่าใดก็ได้
4. เปิด Console และ Clear ก่อนกด reload

### ขั้นตอน

1. กด Chrome Reload
2. รอหน้า render และ Pose model เริ่มใหม่ประมาณ **5 วินาที**
3. ตรวจ face checkbox โดย **ห้ามกดเอง**
4. ตรวจ break section
5. เลือก/ยืนยัน local webcam ถ้าจำเป็น
6. นั่งตรงให้เห็นหัว–ไหล่–สะโพกและรออีก **5 วินาที**
7. ตรวจ status line และ people list
8. ตรวจ Console

### Expected result

- หลัง reload face checkbox กลับมา **ปิด**
- break section แสดงโดยไม่ต้องเปิด face
- เมื่อ pose ตรวจพบคน people list แสดงโดยไม่ต้องเปิด face
- overlay/status line กลับมาทำงานหลัง model พร้อม
- Console ไม่มี red startup/runtime error

> Ticket 03 ไม่ได้กำหนด persistence ของค่า slider ดังนั้น **อย่าใช้การที่ `breakResetMs` กลับค่า default หลัง reload เป็น FAIL** เว้นแต่มี ticket อื่นกำหนด persistence เพิ่ม

### PASS

ผ่านเมื่อ default face=false ถูกใช้จริงทุก reload และ UI posture/break ยังไม่ถูก gate ด้วย face state

### FAIL

ถือว่า fail ถ้าหลัง reload face เปิดเอง, break section หาย, people list ต้องเปิด face ก่อนจึงเห็น หรือ Console มี red error

---

## สิ่งที่ไม่ควรบังคับพิสูจน์ด้วยมือใน Ticket 03

### 1. ไม่ต้องนั่งรอ 15–45 นาทีเพื่อพิสูจน์ break reminder timer

Ticket 03 เพิ่ม/ย้าย **UI settings** เท่านั้น ไม่ได้แก้ state machine ของ break timer

การทดสอบว่า:

- หายไป 10 วินาทีแล้วยังนับ session เดิม
- หายไป 4 นาทีแล้ว reset
- reminder ยิงครั้งเดียว

เป็น Ticket 05 และมี/จะมี test ของ `breakReminder` โดยเฉพาะ ไม่ควรลาก smoke Ticket 03 ให้ใช้เวลานานหรือสรุป behavior ที่ยังไม่อยู่ใน scope

### 2. ไม่ต้องพิสูจน์ conversion millisecond ด้วย stopwatch

Vitest พิสูจน์ deterministic logic แทน:

- `src/lib/breakReminderSettings.test.ts`
  - `uses the ticket range of 1-15 minutes and converts minutes to milliseconds`
  - พิสูจน์ slider model `min=1`, `max=15`, `step=1`
  - พิสูจน์ 1 นาที = 60,000 ms และ 15 นาที = 900,000 ms

Manual smoke ตรวจเพียงค่าที่ผู้ใช้เห็นและการลาก slider จริง

### 3. ไม่ต้องจำลอง branch จำนวนคนทุกค่าด้วยมือ

Vitest:

- `src/lib/featureVisibility.test.ts`
  - `starts face-dependent features disabled`
  - พิสูจน์ default constant เป็น `false`
- `src/lib/featureVisibility.test.ts`
  - `shows either the pose people list or its empty state without a face-feature dependency`
  - พิสูจน์ pure visibility rule สำหรับ 0 คนและมีคน โดยไม่รับ `faceFeaturesEnabled` เป็น input

Manual smoke ใช้กล้องจริงพิสูจน์ integration ว่า rule นี้ถูก wire เข้ากับ React UI แล้ว

### 4. ไม่ทดสอบ timing `t=0` / sustained-alert boundary แบบ millisecond

edge case เวลา `t=0` เป็น Ticket 01 และถูกพิสูจน์แล้วใน:

- `src/lib/sustainedAlertMachine.test.ts`
  - `alerts once when a bad posture starting at t=0 reaches the sustained duration`
  - `preserves zero-valued signal and recovery timestamps`

ห้ามเอา stopwatch ของคนมาทดแทน test deterministic เหล่านี้ใน Ticket 03

---

## Regression checks ที่ automated tests อย่างเดียวไม่พอ แต่จำกัดเฉพาะ Ticket 03

ตรวจด้วยตาระหว่าง Scenario 1–4:

- UI ไม่ blank / ไม่มี React error overlay
- face checkbox แสดงสถานะปิดจริง ไม่ใช่แค่ constant ใน unit test
- break section อยู่ตำแหน่งนอก face-only group จริง
- การปิด face ไม่ทำให้ people list หาย
- local webcam / Pose overlay ยังทำงานเมื่อ face ปิด
- status line ยังอัปเดต
- alert banner + EventLog posture ยังทำงานเมื่อ face ปิด
- reload แล้วยังได้ default face=false
- Console ไม่มี runtime error โดยเฉพาะ cold-load โดยไม่รัน backend

สิ่งต่อไปนี้เห็นได้ด้วยตาแต่ **ไม่ใช้เป็นเกณฑ์ของ Ticket 03**:

- skeleton กระพริบเป็นช่วง ๆ → Ticket 04
- สลับกล้องแล้ว skeleton เก่าค้าง → Ticket 04
- FPS/CPU/ความลื่นเชิง performance → Ticket 10–11 / Ticket 17
- 2 webcam พร้อมกัน → ไม่บังคับใน Ticket 03
- คุณภาพ posture ตอนเห็นแค่ช่วงบน → Ticket 08

---

## เกณฑ์สรุป Ticket 03

Ticket 03 manual smoke = **PASS** เมื่อ Scenario 1–4 ผ่านทั้งหมด โดยเฉพาะสาม contract หลัก:

1. backend ปิด + face default ปิด แล้วยังเปิดหน้า/ใช้ pose-posture ได้
2. people list และ posture flow ไม่หายเพราะ face ปิด
3. break settings แสดงเสมอและ `breakResetMs` ปรับได้ 1–15 นาที

ถ้า Scenario ใด fail ให้บันทึกข้อความจริงที่เห็น, Console error, URL และ hardware ที่ใช้ แล้ว **อย่า tick manual smoke ใน Ticket** จนกว่าจะแก้และ rerun scenario ที่ fail

## ตารางสรุปผล

### Environment ที่ใช้ทดสอบ

| รายการ | ค่าที่ใช้จริง |
|---|---|
| วันที่ทดสอบ | |
| ผู้ทดสอบ | |
| OS | |
| Browser + version | |
| Node | |
| npm | |
| Vite URL | |
| Webcam รุ่น/ชื่อ | |
| จำนวน webcam ที่ต่อ | |
| Camera permission | |
| Backend รันหรือไม่ | ต้องเป็น **ไม่รัน** |
| หมายเหตุ environment | |

### ผลแต่ละ scenario

| Scenario | ผล (PASS / FAIL / SKIP) | สิ่งที่เห็นจริง / Console / หมายเหตุ |
|---|---|---|
| 1. Cold load ไม่มี backend + face default ปิด | | |
| 2. Pose/people/posture alert ขณะ face ปิด | | |
| 3. Break settings + breakResetMs 1–15 นาที | | |
| 4. Reload regression | | |

### สรุปสุดท้าย

| รายการ | ผล |
|---|---|
| Manual browser smoke Ticket 03 | |
| มี red Console error หรือไม่ | |
| มี requirement ไหนยังพิสูจน์ไม่ได้ | |
| ต้องแก้โค้ดก่อน rerun หรือไม่ | |
| หมายเหตุเพิ่มเติม | |
