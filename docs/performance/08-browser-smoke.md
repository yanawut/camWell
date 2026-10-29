# 08: Manual browser smoke — รองรับ upper-body pose เมื่อ webcam มองไม่เห็นสะโพก

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 08 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ requirement ของ Ticket 08: ผู้ใช้ที่นั่งหน้า webcam โน้ตบุ๊กซึ่งเห็นศีรษะ/ไหล่แต่ไม่เห็นสะโพกต้องยังถูกติดตามเป็นคน, ได้สถานะ `upper_body`, ไม่ false-positive เป็น `leaning` ตอนนั่งตรง, UI ต้องแสดง `(เห็นแค่ช่วงบน)`, และการเปลี่ยน `torsoAngleDeg` เป็น nullable ต้องไม่ทำให้ fall/posture flow พังหรือแจ้งหกล้มผิด

smoke นี้ **ไม่ใช่** HITL/accuracy campaign ของ Ticket 17 จึงไม่ทำ repeated trials หลายคน/หลายระยะ/หลายแสง, ไม่วัด sensitivity/specificity, ไม่บังคับจำลองการหกล้มจริง, ไม่วัด FPS/CPU/inference time และไม่ทดสอบหลายกล้อง

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 08 มี browser integration ที่ unit test อย่างเดียวมองไม่เห็นครบดังนี้:

- เมื่อจัดเฟรมแบบ laptop webcam ตามการใช้งานจริงจนสะโพกไม่อยู่ในเฟรม แต่ยังเห็นศีรษะ/หูและไหล่ ระบบต้องยังคงแสดงว่าพบ 1 คน ไม่หลุดเป็น “ยังไม่พบคนในเฟรม”
- people list ต้องต่อท้าย posture status ด้วย `(เห็นแค่ช่วงบน)`
- ขณะนั่งไหล่ตรงใน upper-body mode ต้องไม่เกิด `leaning` false-positive
- เมื่อเอียงแนวไหล่จริงใน upper-body mode การตรวจ `leaning` และ sustained alert ต้องยังทำงาน
- การเปลี่ยน framing ระหว่าง full body ↔ upper body ต้องไม่ทำให้ pose loop freeze, status หายค้าง, overlay กระพริบผิดปกติ หรือเกิด runtime error
- การขยับตัวตามปกติขณะ hips ไม่พร้อมต้องไม่สร้าง `fall_detected` แบบผิด ๆ
- Console ต้องไม่มี uncaught/runtime/React/MediaPipe/posture/fall error ใหม่จาก scenario ที่กำลังทดสอบ

สิ่งที่ **ไม่ใช่ scope ของ Ticket 08**:

- สลับ camera source แล้ว cached skeleton ต้อง reset — Ticket 04
- break timer — Ticket 05
- การย่อตัวเร็วหลุดเฟรมแล้วรอ ~5 วินาทีเพื่อยืนยัน `fall_suspected_left_frame` — Ticket 06 / HITL Ticket 17
- ทดสอบ shoulder orientation หลายทิศแบบเฉพาะสูตร — Ticket 07
- หลายกล้อง, workstation/multi mode — Ticket 09
- pose throttle, FPS/CPU, inference time — Tickets 10–11
- pixel-space geometry, smoothing, calibration — Tickets 12–13
- multi-issue posture / dataset — Tickets 15–16
- repeated real-camera accuracy campaign — Ticket 17

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

- Node: `v26.1.0`
- npm: `12.0.2`
- Browser: **Google Chrome desktop**
- Webcam: **1 ตัวเพียงพอ** — Ticket 08 ไม่ใช่ multi-camera ticket
- กล้องแนะนำ: webcam ในตัว laptop หรือ USB webcam วางด้านหน้าในลักษณะที่สามารถปรับ framing ให้เห็นเฉพาะช่วงศีรษะ/ไหล่ได้ตามการใช้งานจริง
- แสง: สม่ำเสมอจากด้านหน้า/ด้านข้าง หลีกเลี่ยงย้อนแสงแรง เพื่อให้ visibility ของหู/ไหล่ไม่แกว่งจนแยก bug จาก pose confidence ไม่ได้

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

**ไม่ต้องรัน `backend/` สำหรับ smoke ของ Ticket 08**

ทุก required scenario ใช้ MediaPipe Pose + posture/fall logic ฝั่ง frontend และไม่ต้องใช้ face recognition/identity ให้ปิด “เปิดฟีเจอร์เกี่ยวกับใบหน้า” ตลอดการทดสอบ

หมายเหตุ: ถ้า app ปัจจุบันมี background request ไป identity backend ตอน mount และ Chrome แสดง network failure ไป `localhost:4000` ทั้งที่ face features ปิด ให้จดแยกเป็น known/out-of-scope behavior; **อย่ารัน backend เพียงเพื่อกลบ error นั้น** เพราะ scenario นี้ไม่ได้ใช้ identity

เกณฑ์ Console ของ Ticket 08 คือไม่มี error ใหม่จาก `CameraStage`, React render, MediaPipe pose, `postureAnalysis` หรือ fall detection ระหว่างขั้นที่ทดสอบ

## SettingsPanel ที่ใช้

ตั้งค่าเดียวกันทุก scenario เพื่อ isolate upper-body/shoulder behavior:

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition) | **ปิด** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **10°** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **2 s** |
| สัดส่วนร่วงตัวต่อหน้าต่างเวลาที่ถือว่าเร็วผิดปกติ | **0.20** |
| หน้าต่างเวลาที่ใช้ดูว่าร่วงตัวเร็วแค่ไหน | **700 ms** |
| มุมลำตัวที่ถือว่าล้มราบ/ใกล้แนวนอน | **55°** |
| cooldown หกล้ม | **15 s** |
| ทนรอหลังหายไปจากเฟรม | **2.5 s** |

เหตุผล:

- ตั้ง neck/torso threshold สูงเพื่อให้การนั่งตรงหรือการยก/ลดไหล่เล็กน้อยไม่ถูก `forward_head` / `slouching` แย่ง classification ก่อน `leaning`
- ใช้ shoulder tilt 10° ซึ่งเป็น default/เกณฑ์จริงของ feature
- ลด sustained posture เป็น 2 วินาทีเพื่อให้ smoke alert จบเร็ว
- fall thresholds ใช้ค่า default เพื่อให้ regression check ไม่เปลี่ยนความไวของ fall detector

> `minVisibility = 0.5` ไม่มี slider ใน SettingsPanel ให้คงค่าปกติของโปรเจกต์

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ตรวจ Site settings ของ origin ให้ **Camera = Allow**
3. ในแหล่งภาพกล้อง เลือก **กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)**
4. เลือก webcam ที่ต้องการทดสอบ
5. ใช้ camera slot เดียว ถ้ามี slot อื่นค้างจาก localStorage ให้ลบออกเพื่อไม่ให้ UI หลายกล้องรบกวนการสังเกต
6. ตั้ง SettingsPanel ตามตารางด้านบน
7. ปิด face features และ sound ตามที่กำหนด
8. จัดแสงให้หน้า/หู/ไหล่เห็นชัด และหลีกเลี่ยงฉากหลังที่สีใกล้กับเสื้อ
9. รอจนข้อความโหลด Pose Landmarker หาย และ skeleton/pose overlay เริ่มติดตาม
10. เปิด DevTools → **Console**
11. กด Clear Console หลังโมเดลพร้อมแล้ว
12. จดจำนวนรายการ `ประวัติการแจ้งเตือนวันนี้ (...)` ก่อนเริ่ม scenario
13. ถ้ามี posture alert ค้างจาก scenario ก่อน ให้กลับมานั่งตรงอย่างน้อย **2 วินาที** จน banner หายก่อนเริ่ม scenario ถัดไป
14. ให้ tab Camwell อยู่ foreground และอย่า lock/sleep เครื่องระหว่างทดสอบ

### วิธีจัดเฟรม “upper body” ให้เหมาะกับ Ticket 08

ใช้วิธีธรรมชาติแบบ laptop webcam:

- นั่งค่อนข้างใกล้กล้อง ให้เห็นศีรษะ/หูและไหล่ทั้งสองข้างชัด
- ให้ขอบล่างของภาพตัดบริเวณอก/เอว ทำให้สะโพกไม่อยู่ในภาพหรือ visibility ต่ำ
- ไม่ต้องใช้มือ/วัตถุปิด landmark เพราะจะสร้าง occlusion แปลกกว่าการใช้งานจริง
- สัญญาณที่ยืนยันว่าระบบเข้า upper-body path จริงคือ people list ต่อท้าย `(เห็นแค่ช่วงบน)`
- **อย่าตัดสินจากการเห็น/ไม่เห็นจุด hip บน overlay เพียงอย่างเดียว** เพราะ renderer วาด landmarks ที่ MediaPipe ส่งกลับโดยไม่ได้ใช้ visibility เป็นตัวซ่อนจุด

---

## Scenario 1 — นั่งตรงแบบ laptop webcam ที่ไม่เห็นสะโพก ต้องยังพบคนและไม่ false-positive `leaning`

**เป้าหมาย:** พิสูจน์ requirement หลักของ Ticket 08 บน browser จริง โดยไม่ทำ repeated accuracy trial แบบ Ticket 17

### เตรียมก่อนเริ่ม

1. จัด framing เป็น upper-body ตามหัวข้อด้านบน
2. ให้ศีรษะและหูอยู่ในเฟรมครบ ไหล่ซ้าย/ขวาไม่ชิดขอบภาพ
3. นั่งตัวตรงตามธรรมชาติ ไหล่ทั้งสองระดับใกล้เคียงกัน
4. รอ **3–5 วินาที** ให้ tracking settle
5. ต้องเห็น status line ประมาณ `ตรวจพบในเฟรม: 1 คน ...`
6. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. มองตรงไปข้างหน้า
2. นั่งไหล่ตรง ไม่ยักไหล่ ไม่เท้าศอกข้างเดียว และไม่เอนตัวไปด้านใดด้านหนึ่ง
3. ค้างท่านี้ต่อเนื่อง **10 วินาที**
4. ระหว่าง 10 วินาที ดู skeleton/pose overlay ว่ายังขยับตามศีรษะและไหล่ ไม่ freeze
5. ดู status line ทุก 1–2 วินาที ต้องยังเป็น 1 คนอย่างต่อเนื่องหลัง settle
6. ดู people list ใต้กล้อง
7. ดู alert banner / ขอบกล้อง
8. หลังครบ 10 วินาทีดู EventLog
9. ตรวจ Console

### Expected result

- status line แสดงประมาณ `ตรวจพบในเฟรม: 1 คน (รองรับสูงสุด ... คนพร้อมกัน)`
- people list มี `คนที่ 1` และ posture status ต่อท้าย **`(เห็นแค่ช่วงบน)`**
- ในท่าตรงควรเห็น `นั่งท่าดี (เห็นแค่ช่วงบน)`
- ต้อง **ไม่** กลายเป็น `นั่งเอียงข้าง` ต่อเนื่องจากการที่สะโพกหาย
- ไม่มี posture alert banner `นั่งเอียงข้าง`
- EventLog **ไม่เพิ่ม** row `ท่านั่ง / นั่งเอียงข้าง` จากช่วง 10 วินาทีนี้
- EventLog **ไม่เพิ่ม** row `การหกล้ม / ตรวจพบการหกล้ม/ตกจากเก้าอี้`
- overlay ไม่หายค้าง/กระพริบเป็นช่วงยาวขณะศีรษะและไหล่ยังเห็นชัด
- Console ไม่มี runtime error ใหม่จาก pose/posture/fall flow

### PASS

PASS เมื่อ upper-body framing ถูกติดตามเป็น 1 คน, มี suffix `(เห็นแค่ช่วงบน)`, ไม่ false-positive เป็น `leaning` และไม่มี fall event ผิด

### FAIL

FAIL ถ้า pose signal ของศีรษะ/ไหล่ดูเสถียร แต่เกิดอย่างใดอย่างหนึ่ง:

- status/people list หลุดเป็น “ไม่พบคน” ค้างเพียงเพราะ hips ไม่เห็น
- ไม่มี suffix `(เห็นแค่ช่วงบน)`
- people list ค้างเป็น `นั่งเอียงข้าง` ทั้งที่ไหล่ตรง
- เกิด posture `leaning` alert/EventLog
- เกิด `fall_detected` ขณะนั่งตรง
- overlay/status freeze หรือ Console มี runtime error ใหม่

ถ้าหู/ไหล่เองหลุดจากเฟรมหรือแสงทำให้ pose confidence แกว่ง ให้จัด framing ใหม่แล้วรันทวนก่อนตัดสิน FAIL

---

## Scenario 2 — Upper-body ยังต้องตรวจ `leaning` จริงและ alert/EventLog ทำงาน

**เป้าหมาย:** ยืนยันว่าการทำ hips optional ไม่ได้ทำให้ shoulder-tilt classification ถูกปิดไปด้วย และ UI suffix ยังอยู่ขณะมี posture issue

### เตรียมก่อนเริ่ม

1. คง framing แบบ upper-body; **อย่าให้สะโพกกลับเข้ามาในเฟรม**
2. กลับมานั่งตรงจน people list แสดง `นั่งท่าดี (เห็นแค่ช่วงบน)`
3. รออย่างน้อย **2 วินาที**
4. Clear Console
5. จด EventLog count

### ขั้นตอนบน browser

1. จากท่าตรง ให้ยกไหล่ข้างหนึ่งขึ้นและ/หรือลดอีกข้างลงจนแนวไหล่เอียงชัดกว่า 10°
2. พยายามไม่ก้มคอมากและไม่ขยับทั้งตัวลงล่างเร็ว
3. ค้างท่าเอียง **4 วินาที**
4. ช่วง 0–2 วินาทีแรกดู people list
5. หลังประมาณ 2 วินาทีดู alert banner/ขอบกล้อง
6. ดู EventLog row ใหม่
7. กลับมานั่งไหล่ตรง
8. ค้างท่าตรงต่อ **2 วินาที**
9. ตรวจว่า alert เคลียร์และ EventLog row ถูกปิด
10. ตรวจ Console

### Expected result

ขณะเอียง:

- status ยังคงพบ 1 คน
- people list เปลี่ยนเป็น **`นั่งเอียงข้าง (เห็นแค่ช่วงบน)`**
- suffix `(เห็นแค่ช่วงบน)` ต้องไม่หายเพียงเพราะ posture issue เปลี่ยนจาก good → leaning
- หลัง bad posture ต่อเนื่องประมาณ 2 วินาที alert banner ต้องขึ้นข้อความที่มี `นั่งเอียงข้าง (เห็นแค่ช่วงบน)`
- EventLog เพิ่ม row หมวด `ท่านั่ง`, ประเภท `นั่งเอียงข้าง`
- metrics ควรมี `shoulderTiltDeg` สูงกว่า threshold 10° เมื่อท่าเอียงชัด
- `torsoAngleDeg` ใน posture metrics อาจแสดง `0.00` เมื่อ hips ไม่พร้อม เพราะ nullable value ถูก normalize สำหรับ numeric AlertEvent metrics
- ต้องไม่มี row `การหกล้ม / ตรวจพบการหกล้ม/ตกจากเก้าอี้`

หลังกลับตรง:

- people list กลับเป็น `นั่งท่าดี (เห็นแค่ช่วงบน)`
- alert banner เคลียร์ภายในเวลาฟื้นตัวของ state machine; ให้เผื่อ UI แล้วสังเกตภายใน **2 วินาที**
- EventLog row เดิมมีเวลาสิ้นสุด ไม่สร้าง leaning row ซ้ำโดยไม่มี episode ใหม่
- Console ไม่มี runtime error ใหม่

### PASS

PASS เมื่อ upper-body ยังตรวจ leaning จริงได้ครบ people list → sustained alert → EventLog → recovery โดย suffix คงถูกต้องและไม่มี fall false-positive

### FAIL

FAIL ถ้า:

- เมื่อเอียงไหล่ชัดและ pose signal เสถียร สถานะยังเป็น good ตลอด
- suffix หายตอนเปลี่ยน posture issue
- alert/EventLog ไม่ทำงานหลังค้าง >2 วินาที
- กลับตรงแล้ว alert ไม่เคลียร์
- เกิด fall event จากท่าเอียงไหล่ปกติ
- overlay/status freeze หรือมี runtime error

---

## Scenario 3 — เปลี่ยน full body ↔ upper body ต้องไม่หลุด tracking หรือกระพริบเป็น “ไม่พบคน”

**เป้าหมาย:** regression check ของ integration เมื่อ hip visibility เปลี่ยนระหว่างใช้งานจริง ซึ่ง unit test แบบ landmark คงที่ไม่เห็น rendering/tracker continuity

### เตรียมก่อนเริ่ม

1. ถอยเก้าอี้/กล้องให้เห็นศีรษะ ไหล่ และสะโพกชัด
2. นั่งตรงและรอ **5 วินาที**
3. people list ควรเป็น `นั่งท่าดี` **โดยไม่มี** `(เห็นแค่ช่วงบน)`
4. Clear Console
5. จด EventLog count

### ขั้นตอนบน browser

1. จาก full-body framing ให้นั่งตรง
2. ค่อย ๆ เลื่อนเก้าอี้เข้าใกล้กล้องหรือปรับมุมจออย่างช้า ๆ ใช้เวลา **3–4 วินาที** จนสะโพกออกนอกเฟรม แต่ศีรษะ/ไหล่ยังเห็นครบ
3. อย่าเอียงไหล่หรือก้มคอระหว่างเปลี่ยนระยะ
4. หลังได้ upper-body framing แล้วค้าง **5 วินาที**
5. สังเกต status line, people list และ overlay ตลอดช่วงเปลี่ยน
6. จากนั้นค่อย ๆ ถอยกลับ ใช้เวลา **3–4 วินาที** จนสะโพกกลับมาเห็น
7. ค้าง full-body framing อีก **5 วินาที**
8. ดู EventLog และ Console

### Expected result

ช่วง full body แรก:

- พบ 1 คน
- posture status ไม่มี suffix `(เห็นแค่ช่วงบน)`

ช่วง transition ไป upper body:

- overlay ยังคงอัปเดตตามตัว ไม่มี skeleton ค้างจากเฟรมเก่า
- status ไม่ควรตกเป็น 0 คนค้างเพียงเพราะ hip visibility ลดลง
- หลัง settle people list เปลี่ยนเป็น `...(เห็นแค่ช่วงบน)`
- ไม่ควรเกิด `leaning` alert จากการหายของ hips อย่างเดียว
- ไม่ควรเกิด fall alert จากการเลื่อนตัวตามปกติ

ช่วงกลับ full body:

- status ยังพบ 1 คน
- suffix `(เห็นแค่ช่วงบน)` หายหลัง hips กลับมามี visibility
- overlay/status/people list ยังคง responsive
- EventLog ไม่มี posture/fall row ใหม่ถ้าท่านั่งตรงตลอด
- Console ไม่มี runtime error ใหม่

### PASS

PASS เมื่อ full-body ↔ upper-body transition เปลี่ยน label ตามคุณภาพ pose ได้โดยไม่ทำคนหายค้าง, ไม่ false-positive posture/fall และไม่มี visual/runtime regression

### FAIL

FAIL ถ้า:

- เมื่อ hips หาย status กลายเป็น 0 คนค้างทั้งที่ head + shoulders ยังชัด
- suffix ไม่ปรากฏเมื่อ upper-body หรือไม่หายเมื่อกลับ full body
- overlay freeze/ค้าง/กระพริบเป็นช่วงยาวโดยแหล่งภาพยังปกติ
- เกิด leaning/fall alert จากการเปลี่ยน framing แบบช้าและท่าตรง
- Console มี runtime error ใหม่

> การสลับ **camera source** ไม่อยู่ใน scenario นี้ เพราะเป็น Ticket 04; ที่ทดสอบคือ framing/visibility เปลี่ยนบน webcam ตัวเดิม

---

## Scenario 4 — การขยับตำแหน่งตามปกติใน upper-body mode ต้องไม่สร้าง fall alert

**เป้าหมาย:** browser-level regression check ว่า nullable torso angle ไม่ทำให้ fall path แจ้งผิดเมื่อผู้ใช้ขยับขึ้น/ลงตามปกติ โดยไม่บังคับทำ “หกล้มจริง”

### เตรียมก่อนเริ่ม

1. กลับไป framing แบบ upper-body และรอ `นั่งท่าดี (เห็นแค่ช่วงบน)`
2. ยืนยันว่าไม่มี fall cooldown/event ค้างจากการทดสอบอื่น
3. Clear Console
4. จด EventLog count

### ขั้นตอนบน browser

1. นั่งตรง **3 วินาที**
2. เลื่อนตัวลงต่ำบนเก้าอี้/ย่อตัวลงอย่างควบคุมได้ โดยให้ศีรษะและไหล่ยังอยู่ในเฟรม และ **อย่าหายออกจากเฟรม**
3. ทำการเลื่อนลงนี้ในประมาณ **1–2 วินาที** ไม่ต้องพยายามทำให้เหมือนหกล้ม
4. ค้างตำแหน่งต่ำ **3 วินาที**
5. กลับขึ้นท่านั่งเดิมใน **1–2 วินาที**
6. ทำซ้ำเพียง **2 รอบ**
7. ดู alert banner และ EventLog ตลอด
8. ตรวจ Console

### Expected result

- pose/people tracking ยังทำงานและยังเป็น upper-body
- อาจมี posture label เปลี่ยนชั่วคราวตามท่าจริง แต่ต้องไม่เกิด `fall_detected`
- EventLog ต้องไม่เพิ่ม row `การหกล้ม / ตรวจพบการหกล้ม/ตกจากเก้าอี้`
- ต้องไม่มีเสียง fall alarm เพราะตั้งเสียงปิดอยู่แล้ว
- overlay/status ไม่ freeze
- Console ไม่มี runtime error ใหม่

### PASS

PASS เมื่อการ reposition ปกติใน upper-body modeไม่สร้าง `fall_detected` และระบบยัง responsive

### FAIL

FAIL ถ้าเกิด `fall_detected` จากการขยับปกติขณะที่ torso angle ไม่สามารถวัดได้ หรือเกิด runtime error ใน fall flow

### ข้อจำกัดของ Scenario 4

Scenario นี้เป็น **user-visible false-positive smoke เท่านั้น** ไม่ได้พิสูจน์ว่า internal `dropRatio` ข้าม threshold จริงทุกครั้ง เพราะ browser ไม่มี debug UI แสดง `lastRapidDropAt`/drop ratio ต่อเฟรม และเราไม่ควรบังคับผู้ทดสอบทำท่าร่วงแรงเพื่อให้เข้า branch นั้น

เงื่อนไข exact ว่า `torsoAngleDeg === null` ต้องทำให้ `isNearHorizontal === false` พิสูจน์ด้วย Vitest ตามหัวข้อด้านล่าง

---

## สิ่งที่ไม่ควรบังคับพิสูจน์ด้วยมือ — ใช้ Vitest แทน

บาง requirement เป็น deterministic logic ภายในที่ browser smoke ทำให้เกิดซ้ำแบบควบคุมไม่ได้ หรือไม่มี UI ให้สังเกตค่าตรง ๆ จึงใช้ automated test เป็นหลัก:

| Requirement / edge case | เหตุผลที่ไม่บังคับ manual | Vitest ที่พิสูจน์ |
|---|---|---|
| pose มี ears + shoulders แต่ hips visibility ต่ำ → `quality === 'upper_body'`, `torsoAngleDeg === null` | คนทดสอบควบคุมค่า landmark visibility ให้เป็นค่าที่แน่นอนไม่ได้ | `src/lib/postureAnalysis.test.ts` — **analyzes an ears-and-shoulders-only pose as upper body without a torso angle** |
| head signal หาย แต่ shoulders/hips ยังเห็น → `no_person` | การเอาศีรษะออกจากภาพไม่ได้รับประกันว่า MediaPipe จะไม่ infer landmark หรือ visibility จะต่ำกว่า 0.5; exact quality gate ควรทดสอบ synthetic landmarks | `src/lib/postureAnalysis.test.ts` — **returns no_person when the head signal is missing even if shoulders and hips are visible** |
| full-body pose ยังได้ `quality === 'full_body'` หลังเพิ่ม quality gate | browser มองไม่เห็น enum ภายในโดยตรง มีเพียง suffix เป็น proxy | `src/lib/postureAnalysis.test.ts` — **reports level shoulders as about 0 degrees when the left shoulder has the larger x coordinate** |
| `torsoAngleDeg === null` ต้องทำให้ near-horizontal เป็น false | ไม่มี UI แสดง boolean นี้ และไม่ควรทำท่าหกล้มเพื่อบังคับ branch | `src/lib/fallDetection.test.ts` — **returns false when the torso angle is unavailable** |
| มุมลำตัวเท่ากับ threshold พอดีต้องนับว่า near-horizontal | มนุษย์จัดท่าให้ได้ 55.000° พอดีไม่ได้ | `src/lib/fallDetection.test.ts` — **returns true when the torso angle reaches the fall threshold** |
| timing boundary ภายใน sustained state machine / exact millisecond edge | browser scheduling และ MediaPipe frame cadence ไม่ deterministic ระดับ ms | automated suite ของ `src/lib/sustainedAlertMachine.test.ts`; Ticket 08 smoke ทดสอบเพียง integration แบบเผื่อเวลา |

### ทำไมไม่ทดสอบ “หกล้มจริง” ใน Ticket 08 smoke

Ticket 17 มี HITL ข้อเฉพาะสำหรับ real-camera fall behavior ของ Ticket 06 อยู่แล้ว และการบังคับผู้ทดสอบร่วง/ล้มเพื่อเข้าภาวะ rapid-drop + near-horizontal ไม่จำเป็นต่อ Ticket 08

สำหรับ Ticket 08 เราต้องยืนยันเพียงว่า upper-body mode ไม่สร้าง fall false-positive ในการใช้งานปกติ และใช้ deterministic Vitest ยืนยัน null guard ภายใน

---

## Regression scenarios ที่ automated test อย่างเดียวไม่พอ

ให้ถือ 3 เรื่องนี้เป็น mandatory browser observation ของ Ticket 08:

1. **Quality transition ไม่ทำ UI/overlay หลุด:** Scenario 3 ต้องเห็น full body ↔ upper body เปลี่ยน suffix ได้โดย pose loop ไม่ freeze และคนไม่หายค้าง
2. **Upper-body leaning ต่อถึง alert UI จริง:** Scenario 2 ต้องเห็น status → banner → EventLog → recovery; unit test `analyzePosture` อย่างเดียวไม่พิสูจน์ React/rAF/state-machine integration
3. **ไม่มี fall false-positive ระหว่างพฤติกรรมปกติ:** Scenario 1/3/4 ต้องไม่มี fall banner/EventLog จากการไม่มี hips หรือจากการ reposition ธรรมดา

ไม่ต้องทดสอบ:

- source switching
- 2+ webcams
- IP camera CPU
- FPS/inference time
- long-duration soak test
- หลายคน/หลายแสง/หลายระยะซ้ำ ๆ

รายการเหล่านั้นเป็น scope ของ Tickets อื่นหรือ Ticket 17

---

## เกณฑ์ PASS รวมของ Ticket 08

Ticket 08 manual browser smoke ถือว่า **PASS** เมื่อ:

- Scenario 1, 2, 3 และ 4 ผ่านทั้งหมด
- upper-body framing แสดง `(เห็นแค่ช่วงบน)`
- ท่าตรงไม่ false-positive เป็น `leaning`
- leaning จริงใน upper-body mode ยังแจ้งเตือนได้และ EventLog ทำงาน
- full-body ↔ upper-body transition ไม่ทำ tracking/overlay ค้าง
- ไม่มี `fall_detected` จากการนั่ง/ขยับตามปกติเมื่อ hips ไม่พร้อม
- Console ไม่มี runtime error ใหม่จาก scope Ticket 08

ถ้า scenario ใดทำซ้ำไม่ได้เพราะ MediaPipe signal ไม่เสถียร ให้จัด framing/แสงใหม่แล้วลองอีกครั้งหนึ่งก่อนตัดสิน FAIL และจดอาการไว้ใน Notes

## เกณฑ์ FAIL รวมของ Ticket 08

ถือว่า **FAIL** ถ้าพบอย่างใดอย่างหนึ่งแบบ reproducible:

- head + shoulders ชัดแต่ hips ไม่เห็นแล้วระบบค้างเป็น “ไม่พบคน”
- upper-body status ไม่มี suffix ที่กำหนด
- ท่าตรง upper-body กลายเป็น `leaning` และยิง alert
- upper-body leaning จริงไม่สามารถต่อถึง alert/EventLog
- เปลี่ยน hip visibility แล้ว overlay/tracking freeze หรือเกิด stale state
- เกิด `fall_detected` จากการขยับปกติใน upper-body mode
- มี runtime exception/error ใหม่ใน pose/posture/fall flow

---

## ตารางสรุปผล

กรอกหลังทดสอบจริง:

| รายการ | ผล |
|---|---|
| วันที่ทดสอบ | ____ / ____ / ______ |
| เวลาเริ่ม–จบ | __________ |
| Browser / version | Google Chrome __________ |
| OS | Windows __________ |
| Node | __________ |
| npm | __________ |
| URL ที่ใช้ | __________ |
| Webcam รุ่น/ชื่อ device | __________ |
| จำนวน webcam ที่ต่อ | 1 |
| Backend รันหรือไม่ | ไม่รัน |
| Face features | ปิด |
| Scenario 1 — upper-body ท่าตรงยังพบคน + suffix + ไม่ leaning | ☐ PASS ☐ FAIL |
| Scenario 2 — upper-body leaning → alert/EventLog → recovery | ☐ PASS ☐ FAIL |
| Scenario 3 — full body ↔ upper body continuity | ☐ PASS ☐ FAIL |
| Scenario 4 — normal upper-body reposition ไม่ false fall | ☐ PASS ☐ FAIL |
| Overlay/people status มี freeze หรือกระพริบผิดปกติหรือไม่ | ☐ ไม่มี ☐ มี |
| มี posture `leaning` false-positive ตอนนั่งตรงหรือไม่ | ☐ ไม่มี ☐ มี |
| มี `fall_detected` false-positive หรือไม่ | ☐ ไม่มี ☐ มี |
| Console มี runtime error ใหม่ใน scope หรือไม่ | ☐ ไม่มี ☐ มี |
| EventLog behavior ถูกต้อง | ☐ ใช่ ☐ ไม่ใช่ |
| ผลรวม Ticket 08 smoke | ☐ PASS ☐ FAIL |
| Notes / error / screenshot reference | ________________________________________________ |

ถ้า FAIL ให้บันทึกอย่างน้อย: scenario, ขั้นตอนที่เกิด, posture status ก่อน/หลัง, EventLog row ที่เกิด, Console error เต็มบรรทัด และ framing ว่าเห็น head/shoulders/hips ส่วนใดบ้าง
