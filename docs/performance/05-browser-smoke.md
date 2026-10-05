# 05: Manual browser smoke — ตัวจับเวลาเตือนพักระดับกล้อง

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 05 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ scope ของ Ticket 05 และไม่แทน HITL/endurance รอบใหญ่ของ Ticket 17

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 05 เปลี่ยนตัวจับเวลาเตือนพักจาก state ที่ผูกกับ person track ให้เป็น state ระดับ `CameraStage` หรือระดับกล้อง ดังนั้น manual smoke ต้องพิสูจน์สิ่งที่ unit test อย่างเดียวมองไม่เห็นครบ:

- ผู้ใช้ออกจากเฟรมประมาณ 10 วินาที ซึ่งนานกว่า lifetime ของ pose track เดิม แล้วกลับมา ตัวจับเวลาเตือนพักต้องยังเป็น session เดิม
- ถ้าไม่มีใครอยู่หน้ากล้องนานถึง `breakResetMs` ตัวจับเวลาต้อง reset จริงใน browser flow
- single-camera reminder ใช้คำว่า `คุณ`
- เมื่อมี 2 กล้อง แต่ละ `CameraStage` ต้องมี timer ของตัวเอง และ reminder ต้องบอกชื่อกล้องถูกตัว
- การเพิ่มกล้องตัวที่ 2 ต้องไม่ทำให้ timer ของกล้อง 1 เริ่มใหม่โดยไม่ตั้งใจ
- reminder ต้องไม่ยิงซ้ำทุก pose frame หลังผู้ใช้กด `รับทราบ` แต่ยังนั่งอยู่ใน session เดิม
- pose overlay/status line ต้องยังอัปเดตระหว่างการออกจากเฟรมและกลับเข้ามา และ Console ต้องไม่มี runtime error

สิ่งที่ **ไม่ใช่ scope ของ Ticket 05** และไม่ใช้ smoke นี้ตัดสิน:

- ความนิ่งของ skeleton แบบละเอียด/การค้างของ cached overlay ตอนสลับ source — Ticket 04
- ความแม่นยำของ posture classification, fall detection, fatigue, distance หรือ identity
- CPU, inference ms, FPS benchmark เชิงตัวเลข — Tickets performance ขั้นถัดไป
- endurance หลายชั่วโมง, acceptance หลายฟีเจอร์พร้อมกัน หรือ HITL ครบระบบ — Ticket 17
- การเปลี่ยน physical camera source ภายใน slot เดิมแล้ว timer ควร reset หรือไม่ — Ticket 05 นิยาม timer ต่อ `CameraStage`/กล้องใน grid แต่ไม่ได้กำหนด semantics ของ source-switch จึงไม่เพิ่ม acceptance criterion เอง

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจได้ใน workspace ตอนเขียน smoke นี้:

- Node: `v26.1.0`
- npm: `12.0.2`
- Browser: **Google Chrome desktop**
- Webcam: **อย่างน้อย 2 ตัวที่เป็น video input คนละอุปกรณ์** สำหรับ required multi-camera scenario
- แนะนำให้ webcam ทั้งสองตัวมองเห็นที่นั่งเดียวกันจากมุมด้านหน้าหรือเฉียงหน้าเล็กน้อย เพื่อให้คนเดียวสามารถอยู่ในเฟรมทั้งสองกล้องพร้อมกัน
- ใช้นาฬิกาจับเวลาภายนอก/โทรศัพท์ หรือ stopwatch ที่มองเห็นได้ โดยไม่สลับ Chrome ไป background เป็นเวลานาน

จาก root repo:

```bash
npm install
npm run dev
```

เปิด URL:

```text
http://localhost:5173/
```

ถ้า Vite ใช้ port อื่นเพราะ `5173` ถูกใช้งาน ให้ใช้ URL ที่ terminal แสดงจริงและบันทึก URL นั้นในตารางผลท้ายไฟล์

### Backend

**ไม่ต้องรัน `backend/` สำหรับ required smoke ของ Ticket 05**

ทุก scenario ในเอกสารนี้ใช้สัญญาณ presence จาก pose เท่านั้น และไม่ใช้ face recognition/identity ดังนั้นให้ปิด checkbox ฟีเจอร์ใบหน้าตลอดการทดสอบ

ถ้า Console มี error จาก identity/backend ทั้งที่ face features ปิด ให้บันทึกข้อความจริงไว้ ห้ามเปิด backend เพียงเพื่อกลบ error ระหว่าง smoke นี้ เพราะ requirement ของ scenario นี้ไม่ได้ใช้ identity

### SettingsPanel ที่ใช้

ก่อน Scenario 1, 2 และ 3 ให้ตั้งดังนี้:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| เปิดเสียงแจ้งเตือน | **ปิด** เพื่อให้ตรวจ banner ได้แน่นอน; เสียงไม่ใช่ acceptance criterion ของ Ticket 05 |
| นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก | **15 นาที** (ค่าต่ำสุดของ UI) |
| ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว | **1 นาที** (ค่าต่ำสุดของ UI) |

ค่า posture/fall อื่นไม่ใช่ประเด็นของ Ticket 05 ถ้ามี posture/fall alert รบกวนระหว่างทดสอบ ให้กลับมานั่งตรงและเริ่ม scenario ใหม่ ห้ามใช้ event ประเภทอื่นเป็นหลักฐานของ break timer

> ห้ามแก้ `DEFAULT_BREAK_THRESHOLDS` หรือ source code เป็นค่าหนึ่งนาทีเพื่อเร่ง smoke test เอกสารนี้ตั้งใจพิสูจน์ browser wiring ด้วย SettingsPanel จริง

## การเตรียมร่วมก่อนแต่ละ scenario

1. ใช้ Chrome desktop และเปิด Camwell จาก Vite URL
2. เปิด DevTools → **Console**
3. ตรวจ permission ของ origin Vite ให้ Camera = **Allow**
4. ปิด checkbox `เปิดฟีเจอร์เกี่ยวกับใบหน้า...`
5. ตั้ง break settings เป็น 15 นาที / 1 นาทีตามตารางด้านบน
6. วางกล้องให้เห็นศีรษะ ไหล่ และลำตัวช่วงบนชัดเจน; ถ้าเห็นสะโพกได้ยิ่งดี
7. ใช้แสงด้านหน้าหรือด้านข้างสม่ำเสมอ หลีกเลี่ยงย้อนแสงแรง
8. รอ `กำลังโหลดโมเดล Pose Landmarker...` หายก่อนเริ่มจับเวลา
9. นั่งนิ่งตรงกลางเฟรมประมาณ 5 วินาที และยืนยันว่า:
   - มี skeleton/pose overlay ตามตัว
   - status line แสดง `ตรวจพบในเฟรม: 1 คน ...`
10. เปิด tab Camwell ค้างเป็น foreground ระหว่างช่วงที่จับเวลา อย่าปล่อยเครื่อง sleep/lock screen
11. กด Clear Console ก่อนเริ่ม scenario หลัง model พร้อมแล้ว
12. จดจำนวน row ใน EventLog ก่อนเริ่ม scenario เพื่อใช้เทียบหลัง break reminder
13. ถ้ามี break banner ค้างจาก scenario ก่อน ให้กด `รับทราบ` แล้ว **reload หน้า** ก่อน scenario ใหม่ เพื่อให้เริ่ม timer ใหม่อย่างชัดเจน
14. Console ระหว่าง scenario ต้องไม่มี red runtime error, uncaught exception, React error หรือ error ที่เกิดซ้ำจาก pose/break flow

---

## Scenario 1 — ออกจากเฟรม 10 วินาทีต้องไม่ทำให้ session หาย และเตือนครั้งเดียว

**เป้าหมาย:** จำลอง regression หลักของ Ticket 05 โดยจงใจหายจากเฟรมนานกว่า pose track stale time เดิม (~4 วินาที) แต่สั้นกว่า `breakResetMs = 1 นาที` แล้วพิสูจน์ว่า break timer ยังนับจาก session เดิม

### เตรียมก่อนเริ่ม

1. ใช้ **กล้องเดียว** เท่านั้น ถ้ามีกล้องตัวที่ 2 ใน grid ให้ลบออกก่อน
2. ตั้ง 15 นาที / 1 นาที และ face features = ปิด
3. นั่งให้ status line เป็น 1 คนต่อเนื่องอย่างน้อย 5 วินาที
4. Clear Console
5. เริ่ม stopwatch ที่เวลาใกล้เคียงกับตอนที่ status line เริ่มเห็น 1 คนอย่างเสถียร
6. EventLog ต้องไม่มี event ใหม่ที่เกิดจากการเริ่ม stopwatch

### ขั้นตอนบน browser

1. นั่งอยู่ในเฟรมต่อเนื่องจน stopwatch ถึงประมาณ **14 นาที 30 วินาที**
2. ระหว่างรอ ให้ดูเป็นระยะว่า skeleton ยังตามตัวและ status line ยังเป็น 1 คน
3. ที่ประมาณ 14:30 ให้ **ลุก/เดินออกจากภาพทั้งตัว** จน pose มองไม่เห็น
4. อยู่นอกเฟรม **10 วินาทีเต็ม**
5. ระหว่างอยู่นอกเฟรม:
   - ดูว่า skeleton หายไปตามการไม่มีคน
   - หลัง track stale ผ่านไป status line ควรลงเป็น 0 คน
6. เมื่อครบ 10 วินาที ให้กลับมานั่งตำแหน่งเดิมทันที
7. รอจน skeleton กลับมาและ status line กลับเป็น 1 คน
8. **อย่า reload และอย่าปรับ slider**
9. นั่งต่อจน stopwatch จากจุดเริ่ม session เดิมถึงประมาณ **15 นาที**
10. สังเกต break banner บริเวณด้านบนของแอป
11. ข้อความต้องขึ้นต้น/มีใจความประมาณ:
    `คุณ นั่งต่อเนื่องมาแล้วประมาณ 15 นาที ...`
12. จดเวลาที่ banner เกิดจริง โดยยอมให้มี jitter เล็กน้อยจาก pose frame/detection; จุดสำคัญคือต้องเกิดใกล้ 15 นาทีจาก **session แรก** ไม่ใช่ 15 นาทีหลังกลับเข้ากล้อง
13. ตรวจ EventLog แล้วเทียบกับจำนวน row ก่อนเริ่ม
14. กด `รับทราบ` บน break banner
15. **ยังนั่งอยู่ต่ออีก 60 วินาที** โดยไม่ออกจากเฟรม
16. ตรวจว่า break banner **ไม่เด้งกลับมาอีก** ใน session เดิม
17. ตรวจ Console

### Expected result

- ก่อนออกจากเฟรม: skeleton แสดงและ status line = 1 คน
- ตอนออกจากเฟรม 10 วินาที: pose signal หายและ status line ลงเป็น 0 คนได้ตาม tracker lifetime
- กลับเข้ามา: skeleton/status line กลับมาทำงานตามปกติ แม้ person track ภายในอาจเป็น track ใหม่
- break reminder ยังเกิดใกล้เวลา 15 นาทีจาก session เดิม
- label ในโหมดกล้องเดียวเป็น **`คุณ`** ไม่ใช่ `คนที่ 1` และไม่ใส่ชื่อกล้อง
- หลัง `รับทราบ` แล้วนั่งต่อ 60 วินาที banner ไม่ยิงซ้ำ
- **EventLog ต้องไม่เพิ่ม row จาก break reminder** เพราะ break reminder ใช้ `onBreakDue`/break banner ไม่ได้สร้าง `AlertEvent`
- Console ไม่มี red runtime/React error จาก sequence ออกเฟรม → track หาย → กลับเข้ามา → break reminder

### PASS

ผ่านเมื่อ short absence 10 วินาทีไม่ทำให้ reminder เลื่อนไปเริ่มนับใหม่, single-camera label ถูกต้อง, reminder ไม่ยิงซ้ำหลัง acknowledge และ EventLog ไม่ถูกเพิ่มจาก break reminder

### FAIL

ถือว่า fail ถ้าเกิดข้อใดข้อหนึ่ง:

- กลับเข้ามาหลัง 10 วินาทีแล้วต้องรออีกประมาณ 15 นาทีจึงเตือน
- timer เหมือน reset ทันทีที่ status line ลง 0 / person track ถูกลบ
- banner ใช้ชื่อ `คนที่ 1` หรือชื่อกล้องใน single-camera mode
- กด `รับทราบ` แล้ว banner กลับมาซ้ำทุกเฟรม/ทุกไม่กี่วินาทีทั้งที่ยังนั่ง session เดิม
- EventLog เพิ่ม break event ที่ Ticket นี้ไม่ได้ออกแบบไว้
- overlay/status ไม่กลับมาหลังกลับเข้ากล้อง หรือ Console มี runtime error

> ไม่ใช้ scenario นี้ตัดสิน micro-flicker ของ skeleton ระหว่างเฟรม เพราะเป็น scope Ticket 04; ตรวจเพียงว่า pose presence หาย/กลับได้จริงและ flow ไม่ค้าง

---

## Scenario 2 — หายจากกล้องนานถึง breakResetMs ต้อง reset session

**เป้าหมาย:** พิสูจน์ browser integration ของ `lastPresentAtMs` + `breakResetMs` ว่าการพักจริง 1 นาทีทำให้ session เก่าถูกทิ้ง ไม่เกิด stale reminder ทันทีตอนกลับมา

### เตรียมก่อนเริ่ม

1. reload หน้าเพื่อเริ่ม state ใหม่
2. ใช้กล้องเดียว
3. face features = ปิด
4. ตั้ง `นั่งต่อเนื่อง = 15 นาที`
5. ตั้ง `ถือว่าพักแล้ว = 1 นาที`
6. รอ pose พร้อมและ status line = 1 คนประมาณ 5 วินาที
7. Clear Console
8. เริ่ม stopwatch ใหม่

### ขั้นตอนบน browser

1. นั่งต่อเนื่องจน stopwatch ถึงประมาณ **14 นาที 30 วินาที**
2. ที่ประมาณ 14:30 ลุกออกจากเฟรมให้ pose มองไม่เห็น
3. อยู่นอกเฟรมอย่างน้อย **1 นาที 5 วินาที**
   - 5 วินาทีเผื่อ frame scheduling/jitter; requirement จริงคือ reset เมื่อ absence `>= 1 นาที`
4. ระหว่างอยู่นอกเฟรม ยืนยันว่า status line ลงเป็น 0 คน
5. หลังครบ 1:05 กลับมานั่งในเฟรม
6. รอ skeleton กลับมาและ status line = 1 คน
7. สังเกตช่วง **60 วินาทีแรกหลังกลับมา**
8. ต้อง **ไม่มี break banner โผล่ทันทีหรือภายในนาทีแรก** จาก session เก่าที่เริ่มก่อนพัก
9. เพื่อพิสูจน์ว่า timer ใหม่เริ่มทำงานจริง ให้คง tab foreground และนั่งต่อจากเวลาที่กลับเข้ามาจนครบประมาณ **15 นาทีของ session ใหม่**
10. เมื่อ session ใหม่ครบประมาณ 15 นาที ต้องมี break banner:
    `คุณ นั่งต่อเนื่องมาแล้วประมาณ 15 นาที ...`
11. กด `รับทราบ`
12. ตรวจ EventLog และ Console

### Expected result

- absence 1:05 ทำให้ session เดิม reset
- เมื่อกลับเข้ากล้องหลังเวลารวมจาก session เก่าเกิน 15 นาทีแล้ว **ต้องไม่เตือนทันที**
- reminder จะเกิดเมื่อ session หลังกลับมาเดินถึงประมาณ 15 นาทีของตัวเอง
- label = `คุณ`
- EventLog ไม่เพิ่ม row จาก break reminder
- overlay/status line กลับมาปกติ
- Console ไม่มี runtime/React error

### PASS

ผ่านเมื่อไม่มี stale reminder หลังกลับจากพักเกิน `breakResetMs` และ reminder รอบถัดไปอิง session ใหม่

### FAIL

ถือว่า fail ถ้า:

- กลับเข้ามาแล้ว banner เด้งทันทีเพราะยังใช้ `continuousSinceMs` ของ session เก่า
- หายเกิน 1 นาทีแล้วยังนับต่อจาก session ก่อนพัก
- reset แล้วระบบไม่สามารถเริ่ม session ใหม่/ไม่เตือนอีกเลยเมื่อครบ threshold ใหม่
- EventLog ถูกเพิ่มจาก break reminder หรือ Console มี runtime error

---

## Scenario 3 — สองกล้องต้องมี timer แยกกัน และเพิ่มกล้อง 2 ห้าม reset กล้อง 1

**เป้าหมาย:** พิสูจน์ requirement “หนึ่ง break timer ต่อ CameraStage” ใน browser จริง และ regression ที่ unit test ของ pure function ไม่สามารถพิสูจน์ React instance/ref separation ได้

### เตรียมก่อนเริ่ม

1. ต้องมี **webcam อย่างน้อย 2 ตัว** และ Chrome ต้องเห็นเป็น video input คนละอุปกรณ์
2. reload หน้าให้เหลือกล้องเดียว
3. ตั้ง face features = ปิด, break = 15 นาที / reset = 1 นาที
4. เลือก webcam A ให้ `กล้อง 1`
5. จัด webcam A ให้เห็นผู้ทดสอบชัด
6. รอ status ของกล้อง 1 = 1 คน
7. Clear Console
8. เริ่ม stopwatch A

### ขั้นตอนบน browser

1. นั่งให้กล้อง 1 เห็นต่อเนื่อง **2 นาที**
2. ที่ stopwatch A ประมาณ 2:00 กดปุ่ม `+ เพิ่มกล้อง (สูงสุด 2 ตัวพร้อมกัน)`
3. ในช่อง `กล้อง 2` เลือก **webcam B** ซึ่งต้องเป็นคนละ device กับกล้อง 1
4. จัด webcam B ให้เห็นผู้ทดสอบด้วย โดยพยายามให้ทั้งสองกล้องเห็นคนพร้อมกัน
5. รอจน:
   - กล้อง 1 status = 1 คน
   - กล้อง 2 status = 1 คน
   - ทั้งสองภาพมี pose overlay
6. เริ่ม stopwatch B เมื่อกล้อง 2 เห็น 1 คนอย่างเสถียร
7. นั่งอยู่ในมุมที่กล้องทั้งสองเห็นต่อเนื่อง
8. เมื่อ stopwatch A ใกล้ **15 นาที** ให้จับตา break banner
9. กล้อง 1 ต้องเตือนก่อน โดยข้อความต้องมี:
   `คนที่นั่งหน้ากล้อง 1 นั่งต่อเนื่องมาแล้วประมาณ 15 นาที ...`
10. ถ้า timer กล้อง 1 ถูก reset ตอนกดเพิ่มกล้อง 2 จะไม่เตือน ณ จุดนี้ — ให้ถือเป็น FAIL
11. กด `รับทราบ` บน banner ของกล้อง 1
12. อยู่ในเฟรมทั้งสองกล้องต่อ
13. ก่อน stopwatch B ครบ 15 นาที ต้องไม่มี reminder ของกล้อง 2 ก่อนเวลา
14. เมื่อ stopwatch B ครบประมาณ **15 นาที** กล้อง 2 ต้องเตือนด้วยข้อความ:
    `คนที่นั่งหน้ากล้อง 2 นั่งต่อเนื่องมาแล้วประมาณ 15 นาที ...`
15. กด `รับทราบ`
16. ตรวจ EventLog ว่าจำนวน row จาก break reminder ยังไม่เพิ่ม
17. สังเกตภาพทั้งสองกล้องอีก 30–60 วินาที:
    - overlay ยังตามตัว
    - status line ยังอัปเดต
    - UI ไม่ freeze
    - banner ไม่ spam ซ้ำ
18. ตรวจ Console

### Expected result

- เพิ่มกล้อง 2 แล้ว timer ของกล้อง 1 **ยังเดินต่อ**
- กล้อง 1 กับกล้อง 2 เตือนคนละเวลา ตามเวลาที่ presence ของแต่ละ `CameraStage` เริ่มจริง
- multi-camera label แยกเป็น `คนที่นั่งหน้ากล้อง 1` และ `คนที่นั่งหน้ากล้อง 2`
- การ acknowledge banner ของกล้อง 1 ไม่ทำให้ timer ของกล้อง 2 reset
- break reminder ของแต่ละกล้องยิงครั้งเดียวต่อ session
- EventLog ไม่เพิ่ม break event
- overlay/status ของทั้งสองกล้องยังใช้งานได้และ UI ไม่ freeze
- Console ไม่มี red runtime/React error

### PASS

ผ่านเมื่อ timer ทั้งสองแยกกันจริง, กล้อง 1 ไม่ reset ตอนเพิ่มกล้อง 2, label ถูกกล้อง, ไม่มี alert spam และ UI/pose loop ของทั้งสองกล้องยังเดินต่อ

### FAIL

ถือว่า fail ถ้า:

- เพิ่มกล้อง 2 แล้วกล้อง 1 เริ่มนับใหม่
- กล้อง 1 และกล้อง 2 แชร์ state จนเตือนพร้อมกันทั้งที่เริ่ม presence ห่างกันประมาณ 2 นาที
- label ระบุกล้องผิด
- acknowledge ของกล้องหนึ่งไป reset/ทำให้ reminder อีกกล้องหาย
- มี banner spam, UI ค้าง, overlay/status หยุดอัปเดต หรือ Console มี runtime error

> Smoke นี้ดูเพียงว่า 2-camera integration ยัง responsive พอใช้งานและ timer แยก instance จริง ไม่ใช้วัด FPS/CPU/inference ms เชิงตัวเลข เพราะเป็น scope performance/HITL อื่น

---

## Regression scenarios ที่ manual browser ต้องจับและ automated test อย่างเดียวไม่พอ

| Regression | วิธีที่ smoke นี้จับ |
|---|---|
| break timer ผูกกับ person track แล้วหายเมื่อ track stale | Scenario 1 ออกจากเฟรม 10 วินาที (> ~4 วินาทีของ track lifetime เดิม) แล้วต้องยังเตือนตาม session แรก |
| `deskBreakStateRef` ถูกวางผิดตำแหน่ง/ถูกสร้างใหม่จาก render | Scenario 1/3 ใช้เวลาจริงและการเปลี่ยน UI state; timer ต้องไม่เริ่มใหม่โดยไม่ตั้งใจ |
| เพิ่ม CameraStage ตัวที่ 2 แล้ว state ของตัวแรกถูก reset | Scenario 3 เริ่มกล้อง 1 ก่อน 2 นาที แล้วเพิ่มกล้อง 2 |
| timer สองกล้องแชร์ state กัน | Scenario 3 ต้องได้ reminder ห่างกันตามเวลาที่แต่ละกล้องเริ่ม presence |
| label จาก per-person logic เดิมยังหลงเหลือใน browser | Scenario 1 ต้องเป็น `คุณ`; Scenario 3 ต้องเป็น `คนที่นั่งหน้ากล้อง N` |
| reminder edge-trigger ใน pure function ถูก wire ผิดจน UI spam | Scenario 1/3 กด `รับทราบ` แล้วนั่งต่อ ต้องไม่เด้งซ้ำใน session เดิม |
| pose/rAF loop พังหลังย้าย break step ออกนอก per-person loop | ทุก scenario ตรวจ overlay + status line + Console; Scenario 3 ตรวจพร้อมกันสอง CameraStage |
| break reminder ถูกส่งเข้า EventLog โดยไม่ตั้งใจ | ทุก scenarioเทียบจำนวน EventLog ก่อน/หลัง break banner |

## กรณีที่ไม่ควรบังคับพิสูจน์ด้วยมือ

บาง edge case ควรเชื่อ Vitest เพราะ browser smoke จับเวลา exact boundary ได้ไม่แม่นและไม่มี UI แสดง internal timestamp โดยตรง

### 1. exact boundary `absence === breakResetMs` และค่าเวลาเริ่มเป็น 0

พิสูจน์ด้วย:

- ไฟล์: `src/lib/breakReminder.test.ts`
- test: **`resets at the exact breakResetMs boundary even when last presence was time zero`**

เหตุผล: มนุษย์กด stopwatch ให้ตรง millisecond ไม่ได้ และ browser frame scheduling มี jitter; test นี้ยืนยันทั้ง `>=` และ regression เรื่องค่า timestamp `0` ที่เป็น falsy

### 2. short absence state transition แบบ deterministic

พิสูจน์ระดับ pure function ด้วย:

- ไฟล์: `src/lib/breakReminder.test.ts`
- test: **`keeps the same sitting session after a short 10 second absence`**

Manual Scenario 1 มีไว้พิสูจน์ wiring กับ pose tracker/CameraStage เพิ่มเติม ไม่ต้องพยายามเทียบ internal `continuousSinceMs` ด้วย DevTools

### 3. long absence reset ของ state machine แบบไม่พึ่ง frame timing

พิสูจน์ด้วย:

- ไฟล์: `src/lib/breakReminder.test.ts`
- test: **`resets the sitting session after absence longer than breakResetMs`**

Manual Scenario 2 พิสูจน์เฉพาะว่า behavior นี้ถูกต่อเข้ากับ browser flow จริง

### 4. one-shot reminder ที่ระดับ state machine

พิสูจน์ exact edge ด้วย:

- ไฟล์: `src/lib/breakReminder.test.ts`
- test: **`fires the break reminder only once for the current sitting session`**

Manual smoke ตรวจเพียงว่า UI ไม่ spam หลัง acknowledge ไม่ต้องนับจำนวน pose frames

### 5. label mapping แบบ deterministic

พิสูจน์ด้วย:

- ไฟล์: `src/lib/breakReminder.test.ts`
- tests:
  - **`uses คุณ for a single camera`**
  - **`uses the camera label for multi-camera reminders`**

Manual Scenario 1/3 ยืนยัน integration ว่า `CameraStage` ส่งค่า mode/label จริงเข้าฟังก์ชันถูกต้อง

## เกณฑ์สรุปรวมของ Ticket 05

Ticket 05 manual browser smoke = **PASS** เมื่อ Scenario 1, 2 และ 3 ผ่านทั้งหมด และไม่มี Console runtime error ที่เกิดจาก flow ที่กำลังทดสอบ

ถ้า scenario ใดทำไม่ได้เพราะไม่มี webcam 2 ตัว ให้บันทึก **BLOCKED — hardware unavailable** ไม่ให้นับเป็น PASS และอย่าแทน Scenario 3 ด้วยการเลือก device เดียวกันให้ทั้งสอง slot เพราะนั่นไม่ใช่หลักฐานที่ดีพอสำหรับ requirement หลายกล้อง

หากพบ error ที่ชัดว่าเป็นฟีเจอร์นอก Ticket 05 ให้บันทึกข้อความ/ขั้นตอน reproduction แยกไว้ แต่อย่าขยาย smoke นี้ไปทดสอบ Ticket 17

## ตารางสรุปผล

| Scenario | ผล (PASS / FAIL / BLOCKED / NOT RUN) | วันที่ทดสอบ | Browser / OS | กล้องที่ใช้ | Vite URL | หมายเหตุ / หลักฐาน |
|---|---|---|---|---|---|---|
| 1 — หาย 10 วิยังเป็น session เดิม + single label + ไม่ยิงซ้ำ | NOT RUN |  |  |  |  |  |
| 2 — หาย >= breakResetMs แล้ว reset | NOT RUN |  |  |  |  |  |
| 3 — 2 กล้อง timer แยกกัน + label ถูกกล้อง | NOT RUN |  |  |  |  |  |
| **สรุป Ticket 05** | **NOT RUN** |  |  |  |  |  |

### ข้อมูล environment ของรอบที่ทดสอบ

- วันที่ทดสอบ:
- ผู้ทดสอบ:
- Browser + version:
- OS + version:
- Webcam 1 ยี่ห้อ/รุ่น:
- Webcam 2 ยี่ห้อ/รุ่น:
- Node:
- npm:
- Vite URL:
- Settings: continuous sitting = 15 นาที, break reset = 1 นาที, face features = ปิด
- Console error ที่พบ (ถ้ามี):
- หมายเหตุเพิ่มเติม:
