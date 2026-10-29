# 07: Manual browser smoke — มุมไหล่เอียงไม่ขึ้นกับทิศซ้าย/ขวาของภาพ

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 07 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะการแก้สูตร `shoulderTilt` ที่ทำให้กล้องหน้าซึ่ง landmark ไหล่ซ้าย (index 11) มีค่า x มากกว่าไหล่ขวา ไม่ถูกตีความเป็นมุมเกือบ 180° อีกต่อไป

smoke นี้ **ไม่ใช่** HITL/accuracy campaign ของ Ticket 17 และไม่ใช้วัดความแม่นยำเชิงสถิติ, FPS, CPU, inference time หรือหลายมุมกล้องจำนวนมาก

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 07 ต้องพิสูจน์ integration ที่ automated unit test อย่างเดียวมองไม่เห็นครบดังนี้:

- กล้องหน้าแบบ local webcam แสดงภาพแบบ mirror แต่ MediaPipe วิเคราะห์เฟรม unmirrored ได้โดยไม่ทำให้คนนั่งไหล่ตรงถูกสถานะ `นั่งเอียงข้าง`
- เมื่อผู้ทดสอบเอียงแนวไหล่จริงไปทางหนึ่ง ระบบยังตรวจ `นั่งเอียงข้าง` ได้
- เมื่อเอียงแนวไหล่อีกทิศ ระบบต้องตรวจได้เหมือนกัน ไม่ขึ้นกับซ้าย/ขวาของภาพ
- เมื่อ posture bad ต่อเนื่องครบเวลาที่กำหนด alert ต้องต่อถึง UI จริง: camera alert banner และ EventLog
- เมื่อกลับมานั่งตรง alert ต้องเคลียร์ตาม hysteresis และ EventLog ต้องปิด event
- pose overlay, status line และ people list ต้องยังอัปเดตระหว่าง/หลังการเปลี่ยนท่า ไม่มี freeze หรือ runtime error จาก posture flow
- Console ต้องไม่มี uncaught/runtime/React/MediaPipe/posture error ใหม่จาก scenario ที่กำลังทดสอบ

สิ่งที่ **ไม่ใช่ scope ของ Ticket 07**:

- upper-body quality gate / กรณีโต๊ะบังสะโพก — Ticket 08
- การสลับ source แล้ว cached skeleton reset — Ticket 04
- หลายกล้องพร้อมกัน / behavior ต่อกล้อง — ไม่ใช่ requirement ของ Ticket 07
- pose throttling / FPS / inference ms — Tickets 10/11
- calibration, smoothing, pixel-space geometry — Tickets 12/13
- repeated trials หลายคน หลายระยะ หลายแสง เพื่อวัด false-positive/false-negative rate — Ticket 17
- face recognition, fatigue, distance และ backend identity

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจได้ใน workspace ตอนเขียน smoke นี้:

- Node: `v26.1.0`
- npm: `12.0.2`
- Browser: **Google Chrome desktop**
- Webcam: **1 ตัวก็เพียงพอ** — Ticket 07 ไม่ใช่ multi-camera ticket
- กล้องควรวางด้านหน้า/เฉียงหน้าเล็กน้อย และจัดเฟรมให้เห็นอย่างน้อยศีรษะ หู ไหล่ และสะโพก เพราะโค้ดปัจจุบันก่อน Ticket 08 ยังต้องเห็นสะโพกจึงจะวิเคราะห์ posture ได้
- ใช้เก้าอี้ที่นั่งนิ่งได้ และมีพื้นที่ให้ยก/ลดไหล่ซ้าย-ขวาโดยไม่ต้องก้มตัวหรือเอนลำตัวมาก

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

**ไม่ต้องรัน `backend/` สำหรับ smoke ของ Ticket 07**

ทุก required scenario ใช้ MediaPipe Pose + posture logic ฝั่ง frontend เท่านั้น ไม่มี scenario ที่ต้องใช้ face/identity ให้ปิด checkbox ฟีเจอร์ใบหน้าตลอดการทดสอบ

หมายเหตุ: `App.tsx` ปัจจุบันยังพยายามโหลดรายชื่อพนักงานจาก identity backend ตอน mount แม้ face features จะปิด ถ้า Chrome แสดง network failure ไป `localhost:4000/api/employees` เพราะไม่ได้รัน backend ให้บันทึกแยกเป็นพฤติกรรมนอก scope ของ Ticket 07 และ **อย่าเปิด backend เพียงเพื่อกลบ network error นี้**

เกณฑ์ Console ของ Ticket 07 คือ ต้องไม่มี **runtime error ใหม่** จาก React, `CameraStage`, MediaPipe pose loop หรือ `postureAnalysis` ระหว่าง scenario

## SettingsPanel ที่ใช้สำหรับ smoke

เพื่อ isolate การตรวจ shoulder tilt จาก forward-head/slouching ให้ตั้งค่าดังนี้ทุก scenario:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| เปิดเสียงแจ้งเตือน | **ปิด** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **10°** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **2 s** |

เหตุผลที่ตั้ง neck/torso threshold ไว้ค่าสูงสุดของ slider คือให้ scenario นี้ตัดสิน shoulder tilt เป็นหลัก ไม่ให้การก้มคอหรือขยับลำตัวเล็กน้อยแย่ง classification ก่อน `leaning`

ค่า `shoulderTiltThresholdDeg = 10°` เป็น default ของโปรเจกต์และใช้เป็นเกณฑ์จริงของ Ticket นี้ ส่วน `sustainedMs = 2 s` ลดลงเพื่อให้ smoke จบเร็วขึ้นโดยไม่เปลี่ยนสูตรมุม

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ตรวจ Site settings ของ origin ให้ **Camera = Allow**
3. ใน “แหล่งภาพกล้อง” เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
4. เลือก webcam ที่ต้องการทดสอบ
5. ใช้ **1 camera slot เท่านั้น** ถ้ามี slot ที่ 2 ค้างจาก localStorage ให้กด `ลบกล้องนี้` จนเหลือกล้องเดียว
6. ตั้ง SettingsPanel ตามตารางด้านบน
7. จัดกล้องให้เห็นศีรษะ/หู/ไหล่/สะโพกชัดเจน ทั้งสองไหล่อยู่ในเฟรมตลอด
8. ใช้แสงสม่ำเสมอจากด้านหน้า/ด้านข้าง หลีกเลี่ยงย้อนแสงแรงหรือเสื้อที่กลืนกับฉากหลัง
9. นั่งห่างกล้องพอให้ช่วงไหล่ไม่ชิดขอบภาพ และสะโพกไม่ถูกโต๊ะ/ขอบจอบัง
10. รอข้อความ `กำลังโหลดโมเดล Pose Landmarker...` หาย
11. นั่งตัวตรงนิ่งประมาณ **5 วินาที**
12. ต้องเห็น skeleton/pose overlay ตามตัว และ status lineประมาณ:
    `ตรวจพบในเฟรม: 1 คน (รองรับสูงสุด ... คนพร้อมกัน)`
13. people list ใต้กล้องควรมี `คนที่ 1` พร้อมสถานะ posture
14. เปิด DevTools → **Console**
15. กด Clear Console หลัง pose พร้อมแล้ว
16. จดจำนวนรายการที่ `ประวัติการแจ้งเตือนวันนี้ (...)` ก่อนเริ่ม scenario
17. ถ้ามี posture alert ค้างจาก scenario ก่อน ให้กลับมานั่งตรงอย่างน้อย **2 วินาที** จน banner หายก่อนเริ่ม scenario ถัดไป
18. ระหว่างทดสอบให้ tab Camwell อยู่ foreground และไม่ปล่อยเครื่อง sleep/lock

> ถ้า status ไม่ขึ้น 1 คนอย่างค่อนข้างต่อเนื่อง หรือ people list ขึ้น `ยังไม่พบคนในเฟรม` เพราะสะโพกถูกบัง ให้จัดระยะ/มุมกล้องใหม่ก่อนตัดสิน Ticket 07; ข้อจำกัด “เห็นแค่ช่วงบน” เป็น scope Ticket 08

---

## Scenario 1 — นั่งไหล่ตรงหน้ากล้อง ต้องไม่ false-positive เป็น “นั่งเอียงข้าง”

**เป้าหมาย:** พิสูจน์ regression หลักของ Ticket 07 ใน browser จริง หลังสูตรเดิมเคยให้มุมประมาณ 170–180° เมื่อ left shoulder มี x มากกว่า right shoulder

### เตรียมก่อนเริ่ม

1. ตั้ง SettingsPanel ตามตาราง
2. นั่งกลางเฟรม ตัวตรง ศีรษะตรง
3. ให้ไหล่ทั้งสองอยู่ระดับใกล้เคียงกันตามธรรมชาติ
4. อย่ายักไหล่ อย่าเท้าศอกข้างเดียว อย่าเอนลำตัวซ้าย/ขวา
5. รอ status = 1 คนต่อเนื่องประมาณ 3–5 วินาที
6. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. มองตรงไปข้างหน้า
2. นั่งหลังตรง โดยให้ midpoint ของไหล่อยู่เหนือ midpoint ของสะโพก
3. ค้างท่านี้ต่อเนื่อง **8 วินาที** ซึ่งนานกว่า `sustainedMs = 2 s` มากพอที่จะเปิดเผย false-positive ถ้ายังมีบั๊ก 180°
4. ระหว่าง 8 วินาทีสังเกต skeleton overlay:
   - จุด/เส้นไหล่ต้องตามไหล่จริง
   - overlay ต้องไม่หายค้างหรือ freeze
5. ดู people list ทุก 1–2 วินาที
6. ดู camera frame ว่ามี alert banner `⚠ ...` หรือขอบ alert หรือไม่
7. หลังครบ 8 วินาที ตรวจ EventLog
8. ตรวจ Console

### Expected result

- status line ยังแสดงประมาณ `ตรวจพบในเฟรม: 1 คน ...`
- skeleton overlay ยังตามร่างกายตามปกติ
- people list ควรแสดง `คนที่ 1 — นั่งท่าดี` เมื่อท่าตรงและ landmark เสถียร
- ที่สำคัญต้อง **ไม่** แสดง `นั่งเอียงข้าง` ต่อเนื่องจากท่าตรง
- ต้องไม่มี posture alert banner ที่มีข้อความ `นั่งเอียงข้าง`
- EventLog ต้อง **ไม่เพิ่ม row ประเภท `นั่งเอียงข้าง`** จากช่วง 8 วินาทีนี้
- Console ต้องไม่มี uncaught/runtime/React/pose/posture error ใหม่

### PASS

PASS เมื่อท่าตรงถูกติดตามต่อเนื่องและไม่มี `leaning` alert/EventLog false-positive ตลอด 8 วินาที

### FAIL

FAIL ถ้าอย่างใดอย่างหนึ่งเกิดขึ้นโดย pose signal ยังเสถียร:

- people list ค้างเป็น `นั่งเอียงข้าง` ทั้งที่ไหล่ตรง
- หลัง 2 วินาทีเกิด posture banner `นั่งเอียงข้าง`
- EventLog เพิ่ม `ท่านั่ง / นั่งเอียงข้าง` จากท่าตรง
- pose/posture flow throw runtime error

ถ้าคนหายจาก pose เพราะ framing/visibility ไม่พอ ให้จัดกล้องใหม่แล้วรันทวน ไม่ควรตัดสินเป็น fail ของสูตร shoulder tilt ทันที

---

## Scenario 2 — เอียงแนวไหล่ทิศที่ 1 ต้องยังตรวจ “นั่งเอียงข้าง” ได้

**เป้าหมาย:** ยืนยันว่าแก้ false-positive แล้วไม่ได้ทำให้ detector สูญเสียความไวต่อ shoulder tilt จริง

### เตรียมก่อนเริ่ม

1. กลับมานั่งตรงจน people list แสดง `นั่งท่าดี`
2. รออย่างน้อย **2 วินาที** ให้ alert ก่อนหน้าถ้ามีเคลียร์
3. Clear Console
4. จด EventLog count
5. ให้ศีรษะและสะโพกอยู่กึ่งกลางเดิม

### ขั้นตอนบน browser

1. จากท่าตรง ให้ **ยกไหล่ซ้ายขึ้นและ/หรือลดไหล่ขวาลง** จนแนวเส้นไหล่เอียงชัด
2. หลีกเลี่ยงการก้มหน้าและหลีกเลี่ยงการเอนทั้งลำตัว ให้เปลี่ยนหลัก ๆ ที่แนวไหล่
3. ค้างท่านี้ **4 วินาที**
4. ช่วง 0–2 วินาทีแรก สังเกต people list
5. หลังประมาณ 2 วินาที สังเกต camera frame / alert banner
6. ตรวจ EventLog row ใหม่
7. ถ้า EventLog แสดง metrics ให้ดูค่า `shoulderTiltDeg` ซึ่งควรสูงกว่า threshold 10° ในช่วงที่ alert เริ่ม
8. กลับมานั่งไหล่ตรง
9. ค้างท่าตรงต่ออีก **2 วินาที**
10. ตรวจว่า alert banner หาย และ EventLog row เดิมเปลี่ยนจาก `กำลังดำเนินอยู่...` เป็นระยะเวลาที่สิ้นสุดแล้ว
11. ตรวจ Console

### Expected result

ขณะเอียง:

- skeleton overlay ยังคงตามตำแหน่งไหล่
- people list เปลี่ยนเป็น `คนที่ 1 — นั่งเอียงข้าง` เมื่อ pose วิเคราะห์ได้
- หลัง bad posture ต่อเนื่องประมาณ **2 วินาที** camera frame ต้องเข้าสถานะ alert และมี banner ที่มีใจความ `นั่งเอียงข้าง`
- EventLog เพิ่ม 1 row:
  - หมวด: `ท่านั่ง`
  - ประเภท: `นั่งเอียงข้าง`
  - ระยะเวลาเริ่มต้น: `กำลังดำเนินอยู่...`
  - metrics มี `shoulderTiltDeg` และควรเกิน 10° เมื่อ stimulus ชัดพอ

หลังกลับตรง:

- people list กลับเป็น `นั่งท่าดี`
- alert ต้องเคลียร์หลังดีต่อเนื่องประมาณ 1 วินาที; ให้เผื่อ browser/render แล้วสังเกตภายใน **2 วินาที**
- EventLog row เดิมมีเวลาสิ้นสุด ไม่สร้าง row ใหม่ซ้ำโดยไม่มี bad-posture episode ใหม่
- Console ไม่มี runtime error ใหม่

### PASS

PASS เมื่อเอียงไหล่จริงทำให้ `leaning` ถูกตรวจและ alert/EventLog ทำงานครบ แล้ว recovery กลับปกติได้

### FAIL

FAIL ถ้า pose signal เสถียรและแนวไหล่เอียงชัด แต่:

- สถานะยังเป็น `นั่งท่าดี` ตลอด
- ไม่มี alert หลังค้าง >2 วินาที
- EventLog ไม่ได้ type `นั่งเอียงข้าง`
- กลับท่าตรงแล้ว alert ไม่เคลียร์
- overlay/status freeze หรือเกิด runtime error

---

## Scenario 3 — เอียงแนวไหล่ทิศตรงข้าม ต้องได้ผลเหมือน Scenario 2

**เป้าหมาย:** พิสูจน์บน browser ว่าการตัดสิน shoulder tilt ไม่ขึ้นกับทิศของ dy/ซ้าย-ขวา และ regression ไม่เกิดเฉพาะด้านใดด้านหนึ่ง

### เตรียมก่อนเริ่ม

1. กลับมานั่งตรงอย่างน้อย 2 วินาที
2. ตรวจว่าไม่มี active posture banner
3. Clear Console
4. จด EventLog count

### ขั้นตอนบน browser

1. จากท่าตรง ให้ **ยกไหล่ขวาขึ้นและ/หรือลดไหล่ซ้ายลง** ซึ่งเป็นทิศตรงข้ามจาก Scenario 2
2. รักษาศีรษะและสะโพกให้อยู่กึ่งกลาง ไม่ก้มหน้า ไม่เอนลำตัวมาก
3. ค้าง **4 วินาที**
4. ตรวจ people list
5. รอเกิน sustained 2 วินาทีแล้วตรวจ alert banner
6. ตรวจ EventLog
7. กลับมานั่งตรงและค้าง **2 วินาที**
8. ตรวจ recovery ของ people list, banner, EventLog
9. ตรวจ Console

### Expected result

- behavior ต้องเหมือน Scenario 2: ทั้งสองทิศถูกจัดเป็น `นั่งเอียงข้าง`
- ต้องมี posture alert + EventLog เมื่อค้างเกิน 2 วินาที
- ไม่ควรมีกรณีทิศหนึ่งได้มุมสมเหตุสมผล แต่อีกทิศกลายเป็นค่าใกล้ 180° จน behavior แปลกหรือค้าง
- กลับตรงแล้วระบบ recover
- overlay/status line ยังอัปเดต
- Console ไม่มี runtime error ใหม่

### PASS

PASS เมื่อ shoulder tilt ทั้งสองทิศทำงานสมมาตรในเชิง behavior: straight = ไม่ alert, tilt ซ้าย/ขวา = detect/alert ได้

### FAIL

FAIL ถ้าทิศหนึ่งทำงาน แต่อีกทิศไม่ detect, false-positive ค้าง, หรือทำให้ posture pipeline/overlay พัง

---

## Regression integration check ที่ควรสังเกตระหว่าง Scenario 1–3

ไม่ต้องทำเป็น stress test แยก แต่ให้บันทึกถ้าพบ:

| Regression risk | สิ่งที่ต้องสังเกต |
|---|---|
| สูตรใหม่ทำให้ posture UI ไม่อัปเดต | people list ต้องสลับ `นั่งท่าดี` ↔ `นั่งเอียงข้าง` ตามท่าจริง |
| posture event wiring พัง | Scenario 2/3 ต้องมี camera alert banner + EventLog |
| recovery/state machine ค้าง | กลับมานั่งตรงแล้ว banner ต้องหายและ EventLog ปิด event |
| pose loop/overlay เกิด freeze ระหว่างเปลี่ยนท่า | skeleton และ status line ต้องยังอัปเดต |
| shoulder fix ทำให้เกิด exception/NaN ที่ runtime | Console ต้องไม่มี posture/MediaPipe error; EventLog metric `shoulderTiltDeg` ต้องเป็นตัวเลขเมื่อมี leaning event |

### Regression ที่ไม่บังคับใน Ticket 07

- ไม่ต้องสลับ webcam/device หรือ IP source เพื่อทดสอบ stale overlay — Ticket 04
- ไม่ต้องใช้ webcam 2 ตัว — Ticket 07 ไม่มี multi-camera requirement
- ไม่ต้องวัด FPS/ความลื่นเชิงตัวเลข — Tickets 10/11 และ Ticket 17
- ไม่ต้องรัน backend หรือเปิด face features
- ไม่ต้องทดลองหลายสิบมุม/หลายคนเพื่อวัด accuracy — Ticket 17
- ไม่ต้องทดสอบ “เห็นแค่ช่วงบน” — Ticket 08

## กรณีที่ไม่ควรบังคับพิสูจน์ด้วยมือ

### 1. ไหล่ระดับเดียวกัน + left shoulder x มากกว่า right shoulder ต้องได้ `≈ 0°` แบบ exact

UI ปัจจุบันไม่ได้แสดง `shoulderTiltDeg` ขณะ posture เป็น good และไม่ควรเพิ่ม debug code ชั่วคราวเพียงเพื่อ smoke นี้ เพราะ Ticket ระบุให้แทน guide ขั้น 2.1 ด้วย automated test

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureAnalysis.test.ts`
- test: **`reports level shoulders as about 0 degrees when the left shoulder has the larger x coordinate`**

test นี้คือ regression หลักของ Ticket 07 และก่อนแก้เคยได้ 180°

### 2. มุม reversed-image ต้องกลายเป็นมุมแหลมในช่วง 0–90° แบบเชิงตัวเลข

ไม่ควรให้ผู้ทดสอบพยายามกะองศา normalized landmark จากภาพด้วยสายตา

พิสูจน์ด้วย:

- ไฟล์: `src/lib/postureAnalysis.test.ts`
- test: **`keeps reversed-image shoulder tilt in the acute 0-90 degree range`**

เคส synthetic นี้คาดประมาณ 22.62°; ก่อนแก้ได้ประมาณ 157.38°

### 3. การยืนยันว่า landmark index 11 มี x มากกว่า index 12 ในกล้องหน้ารอบนั้น

ค่า x ภายใน MediaPipe ไม่ได้ถูกแสดงใน UI production และ Ticket 07 ระบุชัดว่า guide ขั้น 2.1 ซึ่งเคยเพิ่ม debug log ให้แทนด้วย test จึง **ไม่ต้อง** แก้ `CameraStage.tsx` เพื่อเพิ่ม console debug สำหรับ smoke

Scenario 1 ทำหน้าที่ยืนยัน browser behavior ที่ผู้ใช้เห็น ส่วนค่าพิกัด exact ให้ automated test เป็นหลักฐาน

### 4. timing ที่ `t = 0` ของ sustained state machine

ไม่ใช่ scope ของ Ticket 07 และไม่ควรพยายามสร้างด้วย browser timing จริง พิสูจน์ไว้แล้วใน Ticket 01 ด้วย:

- `src/lib/sustainedAlertMachine.test.ts`
- **`alerts once when a bad posture starting at t=0 reaches the sustained duration`**
- **`preserves zero-valued signal and recovery timestamps`**

manual Ticket 07 ใช้ sustained 2 วินาทีเพื่อพิสูจน์ wiring เท่านั้น ไม่ใช้พิสูจน์ millisecond boundary

## เกณฑ์สรุปรวมของ Ticket 07

Ticket 07 manual browser smoke = **PASS** เมื่อ:

- Scenario 1 ผ่าน: นั่งตรง 8 วินาทีโดย pose เสถียรแล้วไม่มี `leaning` false-positive
- Scenario 2 ผ่าน: shoulder tilt ทิศที่ 1 ตรวจ `leaning`, สร้าง alert/EventLog และ recover ได้
- Scenario 3 ผ่าน: shoulder tilt ทิศตรงข้ามให้ behavior เทียบเท่า Scenario 2
- skeleton overlay และ status line ไม่ freeze ระหว่างทุก scenario
- Console ไม่มี runtime/React/MediaPipe/posture error ใหม่จาก Ticket 07
- ไม่ใช้ backend/identity เป็นเงื่อนไขในการผ่าน smoke

ถ้าไม่สามารถรักษา pose signal ได้เพราะกล้องไม่เห็นสะโพก ให้บันทึก **BLOCKED — current pre-Ticket-08 posture analysis cannot see required hips** แล้วปรับ framing ก่อนลองใหม่; อย่านับเป็น fail ของ Ticket 07 จนกว่าจะได้ pose signal ที่เสถียร

## ตารางสรุปผล

| Scenario | ผล (PASS / FAIL / BLOCKED / INVALID / NOT RUN) | วันที่ทดสอบ | Browser / OS | กล้องที่ใช้ | Vite URL | EventLog / Console / หมายเหตุ |
|---|---|---|---|---|---|---|
| 1 — ไหล่ตรง 8 s → ต้องไม่ `leaning` false-positive | NOT RUN |  |  |  |  |  |
| 2 — เอียงไหล่ทิศที่ 1 → `leaning` + alert + recovery | NOT RUN |  |  |  |  |  |
| 3 — เอียงไหล่ทิศตรงข้าม → behavior เทียบเท่า | NOT RUN |  |  |  |  |  |
| **สรุป Ticket 07** | **NOT RUN** |  |  |  |  |  |

### ข้อมูล environment ของรอบที่ทดสอบ

- วันที่ทดสอบ:
- ผู้ทดสอบ:
- Browser + version:
- OS + version:
- Webcam ยี่ห้อ/รุ่น:
- Node: `v26.1.0`
- npm: `12.0.2`
- Vite URL:
- Camera permission: Allow / Block
- จำนวน camera slot: 1
- Face features: ปิด
- Sound: ปิด
- Posture settings: neck 45°, torso 35°, shoulder tilt 10°, sustained 2 s
- Console error ที่พบ (ถ้ามี):
- มี `localhost:4000/api/employees` network error จาก backend ที่ไม่ได้รันหรือไม่:
- หมายเหตุเพิ่มเติม:
