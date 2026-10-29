# 13: Manual browser smoke — Calibrate ท่านั่งส่วนตัวแยกต่อกล้อง

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 13 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ requirement ของ Ticket 13: calibrate ท่านั่งดีเป็นเวลา 3 วินาที, สร้าง baseline จาก raw posture features, ใช้ baseline ตัดสินท่านั่งแบบ relative ต่อคน/ต่อกล้อง, persistence หลัง reload, baseline แยกระหว่างกล้อง, calibrated head-drop → `forward_head`, และ slider `headDropThreshold` 5–40%

smoke นี้ **ไม่ใช่** HITL campaign ของ Ticket 17 จึงไม่ทำ accuracy/precision/recall, ไม่เก็บ dataset หลายคน, ไม่หา threshold ที่เหมาะสมเชิงสถิติ, ไม่ทำ endurance/CPU/GPU benchmark ระยะยาว และไม่บังคับให้ผู้ทดสอบหกล้มหรือทิ้งตัวจริง

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

สิ่งที่ automated test อย่างเดียวมองไม่เห็นและต้องเช็คบน Chrome จริง:

- ปุ่ม Calibrate เริ่มช่วงเก็บตัวอย่างจริง, แสดงสถานะ `กำลัง Calibrate...`, และจบประมาณ 3 วินาทีโดยไม่ทำให้ video/pose loop ค้าง
- calibration สำเร็จเมื่อมีคนเดียวในเฟรมและ pose signal ชัดพอ
- baseline ที่สำเร็จถูกเก็บใน `localStorage` แยกตาม `cameraId` และยังถูกโหลดกลับหลัง reload
- เมื่อกล้อง 1 มี baseline แล้ว การเพิ่มกล้อง 2 ต้องไม่ทำให้กล้อง 2 inherit baseline ของกล้อง 1
- calibrated head-drop ของคนจริงต้องเปลี่ยน posture status เป็น `ก้มคอ/ยื่นคอไปข้างหน้า` และยังผ่าน sustained alert lifecycle → banner + EventLog
- failed recalibration ต้องไม่ทำลาย baseline เดิมที่เคยสำเร็จ
- slider `หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน` ต้องเลื่อนได้ครบ 5–40% และค่าใน UI เปลี่ยนถูกต้อง
- หลังเพิ่ม state/ref/persistence ของ Ticket 13 แล้ว overlay, status line, inference-ms และสอง camera loops ต้องยังลื่นและไม่กระพริบ/หยุด
- Console ต้องไม่มี runtime/React/MediaPipe/canvas/localStorage error ใหม่จาก calibration path

สิ่งที่ **ไม่ใช่ scope ของ Ticket 13**:

- multi-issue posture พร้อมกัน — Ticket 15
- dataset recorder — Ticket 16
- formal camera accuracy / threshold tuning / long-run performance — Ticket 17
- face recognition, fatigue, distance calibration — ปิดไว้ตลอด required smoke
- พิสูจน์ RULA score — RULA ยังไม่ใช่ฟีเจอร์ของ Ticket 13
- positive fall test ด้วยการหกล้ม/ตกจากเก้าอี้จริง — ไม่ควรทำ
- พิสูจน์ exact pose FPS หรือ inference benchmark เชิงสถิติ — Tickets 10–11 / Ticket 17

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง **ไม่ใช้ WSL**

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

| รายการ | ค่า |
|---|---|
| Node | `v26.1.0` |
| npm | `12.0.2` |
| Browser | Google Chrome desktop |
| Webcam | **อย่างน้อย 2 ตัว** สำหรับ required per-camera scenario |
| คนทดสอบ | 1 คนสำหรับ required scenarios; 2 คนเฉพาะ Optional Scenario 7 |
| Backend | **ไม่ต้องรัน `backend/`** |
| Face/identity | ปิดตลอด required smoke |

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

Ticket 13 ใช้ MediaPipe Pose, React state/ref และ `localStorage` ฝั่ง frontend เท่านั้น required scenarios ไม่ใช้ face/identity จึง **ไม่ต้องรัน `backend/`**

ตั้ง `เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)` = **ปิด** เพื่อไม่ให้ face model/backend availability ปนกับผลของ posture calibration

### SettingsPanel — ค่าเริ่มต้นสำหรับ smoke

ก่อน Scenario 1 ให้ตั้ง:

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| โหมดการตรวจจับ | **ใช้คนเดียว (Personal Workstation) — แนะนำ** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **30°** |
| หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน | **15%** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **2 s** |
| สัดส่วนร่วงตัวต่อหน้าต่างเวลาที่ถือว่าเร็วผิดปกติ | **0.40** |
| หน้าต่างเวลาที่ใช้ดูว่าร่วงตัวเร็วแค่ไหน | **300 ms** |
| มุมลำตัวที่ถือว่าล้มราบ/ใกล้แนวนอน | **80°** |
| ห้ามแจ้งเตือนซ้ำสำหรับคนเดิมถี่กว่านี้ | **60 s** |
| ทนรอหลังหายไปจากเฟรมก่อนสรุปว่าตกจากเก้าอี้ | **1 s** |
| เตือนพัก | คงค่าเดิม; smoke สั้นกว่าช่วงเตือนพักมาก |

เหตุผลที่ตั้ง neck/torso/shoulder สูง: ต้องการ isolate `headDropThreshold` ให้การก้มศีรษะหลัง calibrate มีโอกาสถูกตัดสินจาก calibrated head-height ratio มากกว่าถูก threshold มุม absolute ตัวอื่นแย่งก่อน

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ที่ Site settings ของ origin ให้ **Camera = Allow**
3. ปิด Zoom / Teams / OBS / Camera app หรือโปรแกรมอื่นที่กำลังใช้ webcam
4. ต่อ webcam **2 ตัว** และตรวจว่า Chrome/OS มองเห็นทั้งสองอุปกรณ์
5. ใช้กล้องด้านหน้าหรือเฉียงหน้าเล็กน้อย ไม่ใช้มุมข้างจัด
6. จัดแสงด้านหน้าให้สม่ำเสมอ หลีกเลี่ยงย้อนแสงแรงและไฟกระพริบ
7. นั่งประมาณ **0.7–1.2 เมตร** ให้เห็นศีรษะและไหล่ชัด; ถ้าเห็นสะโพกด้วยยิ่งดี แต่ Ticket 13 ไม่บังคับ full-body
8. เปิด DevTools → **Console**
9. รอ banner `กำลังโหลดโมเดล Pose Landmarker...` หาย
10. รอ skeleton เกาะตัวต่อเนื่องอย่างน้อย **5 วินาที**
11. ตรวจ status line ใต้แต่ละกล้องว่ามี `ตรวจพบในเฟรม: ... คน` และ `Pose ใช้เวลา ~X ms/ครั้ง`
12. หลัง model/startup เสร็จ กด **Clear Console**
13. จดจำนวน EventLog ก่อนเริ่ม scenario
14. ถ้ามี posture alert ค้างจาก scenario ก่อน ให้กลับมานั่งตรงจน banner หายก่อนเริ่ม scenario ถัดไป
15. อย่าสลับ Chrome ไป background tab ระหว่างจับเวลา calibration เพราะ rAF อาจถูก browser throttle
16. ห้ามกระโดด, ทิ้งตัว, ล้มจากเก้าอี้ หรือเคลื่อนตัวเร็วเพื่อพยายาม trigger fall

### Reset baseline ก่อนเริ่ม smoke ทั้งชุด

เพื่อให้ผลไม่ปน baseline จากการทดสอบเก่า ให้เปิด DevTools Console แล้วรัน:

~~~js
Object.keys(localStorage)
  .filter((key) => key.startsWith('camwell:posture-baseline:v1:'))
  .forEach((key) => localStorage.removeItem(key))
~~~

จากนั้น reload หน้า 1 ครั้ง

คำสั่งนี้ลบเฉพาะ posture baseline ของ Ticket 13 ไม่ลบ settings/identity/camera-slot key อื่น

---

## Scenario 1 — Calibrate สำเร็จจากคนเดียว + เก็บ raw sample 3 วินาที

**เป้าหมาย:** พิสูจน์ happy path ของ calibration บน camera loop จริง และ UI ไม่ค้างขณะเก็บตัวอย่าง

### เตรียมก่อนเริ่ม

1. ให้เหลือ CameraStage เดียวก่อน ถ้ามีกล้อง 2 จาก session เก่าให้กด `ลบกล้องนี้` ที่กล้อง 2
2. เลือก webcam ตัวที่ 1
3. ใช้ Settings ค่าเริ่มต้นด้านบน
4. ให้มีผู้ทดสอบ **1 คนเท่านั้น** ในเฟรม
5. นั่งท่าที่ต้องการใช้เป็น “ท่าดี”: หลังตรง ศีรษะตั้ง ไหล่ใกล้ระดับเดิม ไม่ก้มมองโทรศัพท์
6. รอ status `ตรวจพบในเฟรม: 1 คน` คงที่อย่างน้อย **5 วินาที**
7. Clear Console

### ขั้นตอนบน browser

1. ตรวจว่าปุ่มใต้กล้องเขียนว่า **`Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)`**
2. กดปุ่มนั้น 1 ครั้ง
3. ทันทีหลังคลิก ต้องเห็นปุ่มเปลี่ยนเป็น **`กำลัง Calibrate...`**
4. นั่งท่าเดิมนิ่ง ๆ **อย่างน้อย 4 วินาที** เพื่อครอบช่วงเก็บ 3 วินาที
5. ระหว่าง 4 วินาทีสังเกต video, skeleton และ status line ตลอด
6. หลังจบ calibration ตรวจข้อความใต้ปุ่ม
7. เปิด DevTools Console แล้วรัน:

~~~js
Object.keys(localStorage).filter((key) =>
  key.startsWith('camwell:posture-baseline:v1:')
)
~~~

8. ควรเห็น key ของกล้อง 1 จำนวน 1 key
9. อ่านค่า key นั้นด้วย `localStorage.getItem('<key ที่พบ>')`
10. ตรวจว่า JSON มี field `neckAngleDeg`, `torsoAngleDeg`, `shoulderTiltDeg`, `headHeightRatio`, `createdAt`
11. ตรวจ Console

### Expected result

**Calibration UI**

- ระหว่าง 3 วินาทีปุ่มเป็น `กำลัง Calibrate...` และกดซ้ำไม่ได้
- หลังครบเวลาขึ้นข้อความ **`Calibrate ท่านั่งสำเร็จ ✓ ระบบจะเทียบกับท่านี้เป็นหลัก`**
- ปุ่มกลับมาเป็น **`Calibrate ท่านั่งดีใหม่`**

**Overlay / status line**

- skeleton ต้องตามศีรษะ/ไหล่ต่อเนื่อง ไม่หายทั้งโครงตอนเริ่ม/จบ calibration
- `ตรวจพบในเฟรม: 1 คน` ควรคงอยู่
- `Pose ใช้เวลา ~X ms/ครั้ง` ต้องยังอัปเดต
- video ต้องไม่ freeze ตอน state เปลี่ยนจาก calibrating → success

**Storage**

- มี key prefix `camwell:posture-baseline:v1:`
- JSON parse ได้และมี baseline fields ครบ
- ค่าตัวเลขไม่ควรเป็น `NaN` / `Infinity`

**Alert / EventLog**

- การกด Calibrate ขณะนั่งดี **ไม่ควรสร้าง alert**
- EventLog ไม่ควรเพิ่ม row จาก calibration เอง

**Console**

- ไม่มี uncaught exception
- ไม่มี React error
- ไม่มี MediaPipe/canvas error
- ไม่มี `localStorage` error
- ไม่มี error spam ทุก pose frame

### PASS

PASS เมื่อ calibration สำเร็จ, มี baseline ใน storage, ปุ่มเปลี่ยนเป็น “ใหม่”, overlay/status line ยังเดิน และไม่มี alert/error ที่เกิดจากการ calibrate

### FAIL

FAIL ถ้าเกิดอย่างใดอย่างหนึ่ง:

- พบคนเดียวชัดเจนตลอดแต่ครบ ~3–4 วินาทีแล้วยังไม่จบ calibration
- success message ไม่ขึ้นหรือ key baseline ไม่ถูกสร้าง
- ปุ่มค้าง `กำลัง Calibrate...`
- video/skeleton/status line freeze หรือ restart ชัดเจนจากการกดปุ่ม
- calibration เองสร้าง posture alert/EventLog
- Console มี runtime error ใหม่

---

## Scenario 2 — Baseline ต้องอยู่หลัง reload

**เป้าหมาย:** พิสูจน์ persistence browser จริง ไม่ใช่แค่ unit test ของ service

### เตรียมก่อนเริ่ม

1. Scenario 1 ต้อง PASS แล้ว
2. ห้ามลบ `localStorage`
3. Camera 1 ยังใช้ slot เดิม
4. Clear Console

### ขั้นตอนบน browser

1. กด reload ปกติของ Chrome 1 ครั้ง
2. อนุญาตกล้องอีกครั้งถ้า Chrome ถาม
3. รอ Pose model พร้อมและ skeleton settle **5 วินาที**
4. ดูปุ่ม calibration ของ Camera 1
5. นั่งท่าดีเดิม **5 วินาที**
6. ตรวจ localStorage key เดิมว่ายังอยู่
7. ตรวจ EventLog และ Console

### Expected result

- ปุ่ม Camera 1 ต้องเป็น **`Calibrate ท่านั่งดีใหม่`** ทันทีหลัง component โหลด baseline กลับ
- baseline key เดิมยังอยู่และ JSON ยังอ่านได้
- ท่านั่งดีเดิมควรไม่ทำให้เกิด false posture alert
- overlay/status line ยังทำงานตามปกติหลัง reload
- EventLog ไม่เพิ่มเพราะ reload/calibration persistence เพียงอย่างเดียว
- Console ไม่มี error ใหม่

### PASS

PASS เมื่อ reload แล้ว baseline ของ Camera 1 ยังถูกโหลดจริงและ UI แสดง state ว่า calibrate แล้ว โดย detection loop ยังปกติ

### FAIL

FAIL ถ้า reload แล้วปุ่มกลับเป็น “แนะนำให้ทำก่อนใช้งาน”, baseline key หาย, หรือ app error ตอน parse/load baseline

---

## Scenario 3 — Calibrated head-drop ต้อง trigger `forward_head` + alert lifecycle

**เป้าหมาย:** พิสูจน์ integration ของ baseline → smoothing → `classifyPosture` → sustained alert → EventLog บนคนจริง

> ไม่ต้องพยายามกะ “15%” ด้วยสายตาแบบ exact เพราะนั่นเป็นหน้าที่ของ unit test; smoke นี้ดู behavior integration ว่าการก้มศีรษะจาก baseline อย่างชัดเจนส่งผลถึง UI/alert จริง

### เตรียมก่อนเริ่ม

1. Camera 1 ต้องมี baseline จาก Scenario 1
2. ตั้ง:
   - neck = **45°**
   - torso = **35°**
   - shoulder tilt = **30°**
   - head drop = **15%**
   - sustained = **2 s**
3. นั่งท่าดีเดิม **5 วินาที**
4. ตรวจ status เป็น `นั่งท่าดี` เป็นส่วนใหญ่
5. ถือโทรศัพท์/วัตถุไว้ระดับอกหรือตักโดย **ไม่บังไหล่**
6. Clear Console
7. จด EventLog row count

### ขั้นตอนบน browser

1. จากท่าดี ค่อย ๆ ก้มหน้า/ลดศีรษะเข้าหาไหล่เหมือนมองโทรศัพท์ โดยพยายามให้ไหล่และลำตัวอยู่ตำแหน่งเดิม
2. ทำการก้มให้ชัดเจนแต่ไม่กระชาก
3. ค้างท่านี้ **5 วินาที**
4. สังเกต posture status ระหว่างค้าง
5. หลังสถานะเป็น bad posture ต่อเนื่องเกิน sustained 2 วินาที สังเกต banner
6. ตรวจ EventLog
7. กลับมาท่าดีเดิมและค้าง **3 วินาที**
8. ตรวจว่า alert จบและ EventLog row ไม่ถูกสร้างซ้ำแบบ spam
9. ตรวจ Console

### Expected result

**Overlay / status**

- skeleton ยังคงเกาะศีรษะ/ไหล่ขณะก้ม
- status ควรเปลี่ยนเป็น **`ก้มคอ/ยื่นคอไปข้างหน้า`**
- status ไม่ควรสลับหายทั้งโครง/กลายเป็น no-person ทั้งที่ landmark ชัด

**Alert**

- ก่อนครบ sustained 2 วินาทีไม่ควรมี alert ทันที
- หลัง bad posture ต่อเนื่องประมาณ >2 วินาที ควรมี banner เตือน `ก้มคอ/ยื่นคอไปข้างหน้า`
- เมื่อกลับมาท่าดี banner ต้องหายตาม alert recovery flow

**EventLog**

- เพิ่ม row ใหม่ 1 row สำหรับ posture
- หมวด = **ท่านั่ง**
- ประเภท = **ก้มคอ/ยื่นคอไปข้างหน้า**
- ขณะ active ระยะเวลาแสดง `กำลังดำเนินอยู่...`
- หลังกลับท่าดี row เดิมต้องจบ ไม่ควรสร้าง row ซ้ำทุก frame

**Console**

- ไม่มี error ใหม่

### PASS

PASS เมื่อ calibrated head-drop ส่งผลถึง posture status, sustained banner และ EventLog จริง โดย recovery ทำงานและไม่มี alert spam

### FAIL

FAIL ถ้าก้มศีรษะชัดเจนหลายครั้งแต่ status ไม่เคยเปลี่ยนทั้งที่ pose signal ดี, alert ไม่เกิดหลัง sustained period, EventLog ไม่เพิ่ม, หรือ loop/Console error

> ถ้าท่าที่ทำยังไม่เกิน calibrated head-drop จริง ให้ลองก้มมากขึ้นแบบช้า ๆ ก่อนตัดสิน FAIL ห้ามใช้การกระชากตัว

---

## Scenario 4 — กล้อง 2 ต้องเริ่ม uncalibrated และ baseline ต้องแยกจากกล้อง 1

**เป้าหมาย:** พิสูจน์ requirement หลัก “per-camera” บน CameraStage 2 ตัวจริง

### เตรียมก่อนเริ่ม

1. ต้องมี webcam จริง **2 ตัว**
2. Camera 1 มี baseline และปุ่มเป็น `Calibrate ท่านั่งดีใหม่`
3. ตรวจว่า baseline keys ตอนนี้มีเฉพาะ Camera 1
4. Clear Console
5. จด EventLog row count

### ขั้นตอนบน browser

1. กด **`+ เพิ่มกล้อง (สูงสุด 2 ตัวพร้อมกัน)`**
2. ที่ Camera 2 เลือก webcam ตัวที่ 2
3. รอทั้งสองกล้องแสดงภาพและ skeleton settle **5–10 วินาที**
4. ตรวจปุ่ม calibration ของทั้งสอง CameraStage
5. **ห้าม calibrate Camera 2 ก่อนตรวจข้อ 4**
6. Camera 1 ต้องยังแสดง `Calibrate ท่านั่งดีใหม่`
7. Camera 2 ต้องแสดง **`Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)`**
8. ตรวจ status line ของทั้งสองกล้องว่า `Pose ใช้เวลา ~X ms/ครั้ง` ยังอัปเดต
9. ตอนนี้ calibrate Camera 2: ให้ผู้ทดสอบอยู่ใน Camera 2 คนเดียวและนั่งท่าดี จากนั้นกดปุ่มและค้าง **4 วินาที**
10. รอ Camera 2 ขึ้น success
11. ใน Console รัน:

~~~js
Object.keys(localStorage).filter((key) =>
  key.startsWith('camwell:posture-baseline:v1:')
)
~~~

12. ต้องเห็น **2 key ที่ต่างกัน**
13. reload หน้า
14. รอทั้งสองกล้องพร้อม
15. ตรวจปุ่มทั้งสองกล้องอีกครั้ง
16. ตรวจ EventLog และ Console

### Expected result

**ก่อน calibrate Camera 2**

- Camera 1 = `Calibrate ท่านั่งดีใหม่`
- Camera 2 = `Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)`
- การเพิ่ม Camera 2 ห้าม reset baseline/state ของ Camera 1

**หลัง calibrate Camera 2**

- Camera 2 ขึ้น success และปุ่มเป็น `Calibrate ท่านั่งดีใหม่`
- localStorage มี posture-baseline 2 key แยกกัน
- หลัง reload ทั้งสอง CameraStage ต้องโหลด baseline ของตัวเองและแสดง `Calibrate ท่านั่งดีใหม่`

**Performance regression**

- overlay ของทั้งสองกล้องยังเคลื่อนต่อเนื่อง
- skeleton ไม่หายทั้งโครงเป็นจังหวะจากการเพิ่ม calibration state
- status/inference-ms ของทั้งสองกล้องยัง update
- UI ไม่ freeze หลายวินาทีตอน add/calibrate/reload
- การ add/calibrate camera เพียงอย่างเดียวไม่สร้าง EventLog

**Console**

- ไม่มี React key/state error
- ไม่มี MediaPipe/canvas error ใหม่
- ไม่มี error จาก localStorage key collision

### PASS

PASS เมื่อกล้อง 2 เริ่มโดยไม่มี baseline ของกล้อง 1, calibrate ได้แยก key และ reload แล้วแต่ละกล้องยังมี baseline ของตัวเอง โดยสอง detection loops ยังทำงานปกติ

### FAIL

FAIL ถ้าเกิดอย่างใดอย่างหนึ่ง:

- เพิ่ม Camera 2 แล้วปุ่มขึ้น `Calibrate ท่านั่งดีใหม่` ทั้งที่ยังไม่เคย calibrate และ baseline prefix ถูก reset ก่อน scenario แล้ว
- Camera 2 ใช้ key เดียวกับ Camera 1
- calibrate Camera 2 แล้ว Camera 1 เปลี่ยน/หาย baseline
- reload แล้ว baseline ข้ามกล้องหรือหาย
- loop กล้องใดกล้องหนึ่งตาย/overlay freeze/Console error

---

## Scenario 5 — Failed recalibration ต้องไม่ overwrite baseline เดิม

**เป้าหมาย:** พิสูจน์ failure path ของ calibration และกัน regression ที่กด recalibrate ผิดจังหวะแล้วทำ baseline ที่ดีหาย

### เตรียมก่อนเริ่ม

1. ใช้ Camera 1 ที่มี baseline สำเร็จอยู่แล้ว
2. ปุ่มต้องเป็น `Calibrate ท่านั่งดีใหม่`
3. จดค่า baseline JSON ของ Camera 1 จาก localStorage ไว้
4. ให้ผู้ทดสอบลุกออกจากเฟรมจน status แสดง **0 คน** อย่างต่อเนื่องอย่างน้อย **5 วินาที**
5. Clear Console

### ขั้นตอนบน browser

1. ขณะเฟรมว่าง กด `Calibrate ท่านั่งดีใหม่`
2. อย่าให้คนกลับเข้ากล้องเป็นเวลา **4 วินาที**
3. รอข้อความผล calibration
4. ตรวจปุ่ม
5. อ่าน baseline JSON key เดิมอีกครั้ง
6. ให้ผู้ทดสอบกลับมานั่งท่าดี **5 วินาที**
7. ตรวจ status/overlay/EventLog/Console

### Expected result

- ระหว่างรอปุ่มขึ้น `กำลัง Calibrate...`
- หลังครบเวลา ต้องขึ้นข้อความ failure:
  **`Calibrate ไม่สำเร็จ — ต้องมีคนเดียวในเฟรมและเห็นหัว+ไหล่ชัดเจน ลองใหม่อีกครั้ง`**
- baseline เดิม **ต้องยังอยู่** และไม่ถูกเขียนทับด้วย empty/invalid baseline
- ปุ่มยังควรเป็น `Calibrate ท่านั่งดีใหม่` เพราะ baseline เก่ายังคงมี
- เมื่อกลับเข้ากล้อง detection/posture ต้องทำงานต่อ
- failed calibration ไม่สร้าง EventLog
- Console ไม่มี error

### PASS

PASS เมื่อ no-person calibration fail อย่างปลอดภัยและ baseline เดิมยังใช้ได้

### FAIL

FAIL ถ้า failure กลายเป็น success, baseline เดิมหาย/เปลี่ยนเป็น invalid data, ปุ่มกลับเป็น uncalibrated, หรือ loop ค้าง

---

## Scenario 6 — Slider `headDropThreshold` ต้องมีช่วง 5–40%

**เป้าหมาย:** พิสูจน์ UI wiring/range จริงของ requirement slider โดยไม่พยายามใช้ร่างกายกะ threshold เป๊ะเป็นเปอร์เซ็นต์

### เตรียมก่อนเริ่ม

1. ไม่จำเป็นต้องลบ baseline
2. face features ปิด
3. Clear Console

### ขั้นตอนบน browser

1. หา slider **`หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน`**
2. คลิก slider แล้วกด **Home** เพื่อไปค่าต่ำสุด
3. ตรวจ label ต้องแสดง **5%**
4. กด **End** เพื่อไปค่าสูงสุด
5. ตรวจ label ต้องแสดง **40%**
6. ใช้ลูกศรเลื่อนกลับมาที่ **15%**
7. ระหว่างเลื่อนสังเกต video/overlay/status line ว่ายังทำงาน
8. ตรวจ Console

### Expected result

- minimum = 5%
- maximum = 40%
- step = 1%
- เลื่อนค่าแล้ว UI ไม่ crash
- pose loop ไม่ restart/freeze จาก settings update
- ไม่มี EventLog เพิ่มจากการเลื่อน slider เพียงอย่างเดียว
- Console ไม่มี error

### PASS

PASS เมื่อ slider เข้าถึง 5% และ 40% ได้จริงและคืน 15% ได้ โดย loop ปกติ

### FAIL

FAIL ถ้าช่วงไม่ตรง, label ไม่สัมพันธ์กับตำแหน่ง slider, หรือ settings update ทำ detection loop ค้าง/error

---

## Optional Scenario 7 — สองคนอยู่ในเฟรมตลอด calibration ต้องไม่ถูกใช้เป็น baseline

Scenario นี้เป็น **best-effort regression** ไม่ใช่ required PASS ของ smoke เพราะ pose detector อาจสลับจาก 2 คนเป็น 1 คนชั่วคราว ทำให้ผลไม่ deterministic

### เตรียมก่อนเริ่ม

1. ต้องมีคนทดสอบ 2 คน
2. เลือก `กล้องเดียวหลายคน (Multi-person)`
3. ใช้กล้องเดียวที่มองเห็นทั้ง 2 คนชัด
4. รอ status แสดง **2 คน** ต่อเนื่องอย่างน้อย 5 วินาที
5. ใช้ camera slot ที่ยังไม่มี baseline หรือจด baseline เดิมไว้ก่อน

### ขั้นตอน

1. เมื่อ status ยังเป็น 2 คน กด Calibrate
2. ทั้งสองคนนั่งอยู่ในเฟรมต่ออีก 4 วินาที
3. เฝ้าดูจำนวนคนตลอดช่วง calibration

### Expected result

ถ้า status แสดง **2 คนตลอดทั้งช่วง** calibration ควร fail เพราะโค้ดเก็บ sample เฉพาะ `matches.length === 1`

ถ้าระหว่าง 3 วินาที status เคยตกเป็น 1 คน ผลถือว่า **INCONCLUSIVE** ไม่ใช่ FAIL เพราะ detector อาจเก็บ valid single-person samples ได้จริง

หลังจบให้กลับ detection mode เป็น **Personal Workstation**

---

## Optional Scenario 8 — สลับ physical webcam ใน slot แล้ว loop ต้อง recover

Ticket 13 ผูก baseline ตาม `cameraId` ของ CameraStage/slot ตาม contract ไม่ได้ผูกกับ hardware `deviceId` ดังนั้น scenario นี้ **ไม่ใช้ตัดสิน isolation ของ baseline** แต่ใช้ regression check ว่า calibration state ใหม่ไม่ทำให้ source switching พัง

1. ใช้ Camera 2 ที่มี baseline แล้ว
2. สลับ source จาก webcam 2 → webcam 1
3. รอภาพ/skeleton settle 5 วินาที
4. สลับกลับ webcam 2
5. รออีก 5 วินาที
6. ตรวจ overlay/status/inference-ms/Console

PASS เมื่อ video + pose loop recover ทุกครั้ง ไม่มี freeze/error และ baseline state ของ slot ไม่ทำให้ component crash

---

## Regression scenarios ที่ automated test อย่างเดียวไม่พอ

| Regression ที่ต้องดูบน browser | วิธีพิสูจน์ |
|---|---|
| กด Calibrate แล้ว rAF/pose loop freeze เพราะ state/ref update | Scenario 1 ดู overlay + status line ตลอดก่อน/ระหว่าง/หลัง 3 วินาที |
| baseline โหลดจาก localStorage ได้ใน React lifecycle จริง | Scenario 2 reload แล้วดูปุ่ม + detection |
| CameraStage ตัวที่ 2 inherit baseline ของตัวแรก | Scenario 4 ตรวจ label ก่อน calibrate + key คนละตัว |
| เพิ่ม CameraStage ตัวที่ 2 แล้ว loop ตัวแรกตาย/กระตุกหนัก | Scenario 4 ดู overlay และ `Pose ใช้เวลา ~X ms/ครั้ง` ทั้งคู่ |
| calibrated head-drop ถึง UI แต่ sustained alert/EventLog ไม่เดิน | Scenario 3 |
| failed recalibration ทำ baseline ดีหาย | Scenario 5 |
| settings update ทำ rAF loop restart/freeze | Scenario 6 |
| overlay หายทั้งโครง/กระพริบจาก calibration state changes | Scenarios 1, 3, 4 |
| source switching หลังเพิ่ม calibration state ทำ component crash | Optional Scenario 8 |

คำว่า “ลื่น” ใน smoke นี้หมายถึง interactive UI/video/overlay ยังตอบสนองต่อเนื่องในระดับใช้งานได้และไม่มี freeze หลายวินาที ไม่ใช่ formal FPS benchmark ของ Ticket 17

---

## สิ่งที่ไม่ควรหรือไม่สามารถพิสูจน์ exact ด้วยมือ — ใช้ Vitest แทน

### Median / จำนวนตัวอย่างขั้นต่ำ

มนุษย์ไม่สามารถยืนยันได้จาก browser ว่า raw frame sample ถูกเรียงและ median ถูกคำนวณ exact หรือมี sample 11/12 จุดพอดี จึงใช้:

`src/lib/postureCalibration.test.ts`

- **`uses the middle value and ignores an outlier`**
- **`averages the two middle values for an even sample count`**
- **`returns null for no values`**
- **`requires at least the minimum number of calibration samples`**
- **`builds a median baseline while preserving optional torso/head values and timestamp`**

### สูตร baseline deviation / calibrated head-drop exact

ไม่ควรให้คนทดสอบพยายามจัดคอ/หัวให้เป็นองศาหรือเปอร์เซ็นต์ exact ด้วย webcam ใช้:

`src/lib/postureAnalysis.test.ts`

- **`compares neck, torso, and shoulder angles as deviations from a baseline`**
- **`classifies a calibrated head drop at the configured ratio as forward_head`**

browser Scenario 3 พิสูจน์ integration เท่านั้น ส่วนเลข exact พิสูจน์โดย test ข้างต้น

### Persistence API / key isolation exact

browser Scenario 2/4 พิสูจน์ integration แต่ behavior exact ของ service ใช้:

`src/services/postureBaselineStore.test.ts`

- **`stores baselines under separate per-camera keys`**
- **`clears only the selected camera baseline`**
- **`treats malformed stored JSON as uncalibrated instead of throwing`**

malformed JSON ไม่จำเป็นต้องจงใจทำ storage ของ browser เสียใน smoke

### Timing edge ของ sustained state machine

ไม่ควรใช้ stopwatch มนุษย์พิสูจน์ exact boundary `t=0` หรือ millisecond edge ใช้:

`src/lib/sustainedAlertMachine.test.ts`

- **`does not alert before the sustained duration elapses`**
- **`alerts once when a bad posture starting at t=0 reaches the sustained duration`**
- **`preserves zero-valued signal and recovery timestamps`**

Scenario 3 จึงยอมรับเวลาโดยประมาณรอบ threshold ไม่ใช่ exact millisecond

### Fall detection / raw torso regression

Ticket 13 เก็บ `neckAngleDeg` และ `torsoAngleDeg` แบบ raw absolute ไว้ใน `PersonState` ก่อน smoothing/baseline เพื่อไม่ทำลาย consumer อย่าง fall detection และรองรับ RULA ภายหลัง

**ไม่ควรบังคับผู้ทดสอบหกล้มจริง** เพื่อพิสูจน์ path นี้ ใช้ pure fall tests:

`src/lib/fallDetection.test.ts`

- **`returns false when the torso angle is unavailable`**
- **`returns true when the torso angle reaches the fall threshold`**
- **`reports a 0.30 downward drop from y=0.40 to y=0.70`**
- **`does not count upward movement as a drop`**

หมายเหตุ: `PersonState` เป็น internal state ของ `CameraStage` และไม่มี UI แสดง raw angle ตรง ๆ จึงไม่มี manual observation ที่พิสูจน์ได้ว่า field นี้เป็น raw แบบตัวเลข exact การ assign raw ก่อน smoothing และการที่ fall path อ่าน `person.torsoAngleDeg` ถูกยืนยันใน code review; smoke นี้ตรวจเฉพาะว่า posture/fall-related UI ไม่มี regression โดยไม่ทำท่าอันตราย

---

## เกณฑ์ PASS / FAIL รวมของ Ticket 13

### PASS รวม

Ticket 13 manual browser smoke ผ่านเมื่อ **required Scenario 1–6 ผ่านทั้งหมด** และ:

- Camera 1 calibrate สำเร็จจากคนเดียว
- baseline ยังอยู่หลัง reload
- calibrated head-drop ไปถึง status + sustained alert + EventLog
- Camera 2 เริ่ม uncalibrated แม้ Camera 1 มี baseline
- baseline ของสอง camera slots อยู่คนละ key และโหลดกลับได้
- failed recalibration ไม่ทำ baseline เดิมหาย
- slider ใช้ช่วง 5–40% ได้
- overlay/status/inference-ms ไม่ freeze หรือกระพริบผิดปกติจาก calibration flow
- ไม่มี runtime error ใหม่ใน Console

Optional Scenario 7–8 ใช้เป็น regression confidence เพิ่ม ไม่ทำให้ required smoke fail ถ้า hardware/คนทดสอบไม่พร้อม หรือ Scenario 7 ได้ผล INCONCLUSIVE เพราะ detector count ไม่นิ่ง

### FAIL รวม

ถือว่า FAIL ถ้า required scenario ใด scenario หนึ่ง fail โดย reproducible หลังจัด framing/แสง/permission ถูกต้องแล้ว โดยเฉพาะ:

- baseline ไม่ persist
- baseline leak ข้ามกล้อง
- calibrated head-drop ไม่เข้าถึง UI/alert แม้ทำ pose ชัดและซ้ำได้
- failed recalibration overwrite baseline เดิม
- add/calibrate camera ทำ pose loop ตาย
- Console มี uncaught error ใหม่จาก Ticket 13

---

## ตารางสรุปผลการทดสอบ

### Environment ที่ใช้จริง

| รายการ | ค่าที่ทดสอบจริง |
|---|---|
| วันที่ทดสอบ | ____________________ |
| ผู้ทดสอบ | ____________________ |
| OS | ____________________ |
| Browser / version | Google Chrome ____________________ |
| Node | ____________________ |
| npm | ____________________ |
| Vite URL | ____________________ |
| Webcam 1 รุ่น/ชื่อใน Chrome | ____________________ |
| Webcam 2 รุ่น/ชื่อใน Chrome | ____________________ |
| ความละเอียด/เงื่อนไขกล้องที่สังเกตได้ | ____________________ |
| แสง/ตำแหน่งกล้องโดยย่อ | ____________________ |

### ผลราย Scenario

| # | Scenario | ผล | หมายเหตุ / evidence |
|---:|---|---|---|
| 1 | Calibrate คนเดียว 3 วินาที + baseline ถูกสร้าง | ☐ PASS ☐ FAIL | ____________________ |
| 2 | Baseline อยู่หลัง reload | ☐ PASS ☐ FAIL | ____________________ |
| 3 | Calibrated head-drop → forward_head + alert + EventLog | ☐ PASS ☐ FAIL | ____________________ |
| 4 | กล้อง 2 เริ่ม uncalibrated + baseline แยกต่อกล้อง | ☐ PASS ☐ FAIL | ____________________ |
| 5 | Failed recalibration ไม่ overwrite baseline เดิม | ☐ PASS ☐ FAIL | ____________________ |
| 6 | Slider headDropThreshold 5–40% | ☐ PASS ☐ FAIL | ____________________ |
| 7 | Optional: multi-person calibration guard | ☐ PASS ☐ FAIL ☐ INCONCLUSIVE ☐ SKIP | ____________________ |
| 8 | Optional: สลับ webcam source แล้ว loop recover | ☐ PASS ☐ FAIL ☐ SKIP | ____________________ |

### Final

| รายการ | ผล |
|---|---|
| Required scenarios 1–6 ผ่านทั้งหมด | ☐ YES ☐ NO |
| Console ไม่มี runtime error ใหม่ | ☐ YES ☐ NO |
| ไม่มี unsafe fall test | ☐ YES ☐ NO |
| Ticket 13 manual smoke โดยรวม | ☐ PASS ☐ FAIL |

ถ้า FAIL ให้แนบ scenario number, ขั้นตอนที่ทำซ้ำได้, Console error (ถ้ามี), browser/OS/webcam และภาพหน้าจอเฉพาะที่จำเป็น ก่อนแก้โค้ดรอบถัดไป
