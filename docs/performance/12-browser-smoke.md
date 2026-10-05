# 12: Manual browser smoke — pixel-space posture features + smoothing

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 12 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ requirement ของ Ticket 12: geometry ของ posture ใช้ขนาดเฟรมจริง, feature ถูกแยกออกจาก classification, ค่าที่ใช้ตัดสินท่านั่งผ่าน EMA smoothing (`alpha = 0.3`) ต่อ person track, upper-body quality gate จาก Ticket 08 ยังไม่ถอยหลัง และ fall path ยังไม่ถูก posture smoothing ทำให้เกิด regression

smoke นี้ **ไม่ใช่** HITL campaign ของ Ticket 17 จึงไม่ทำ accuracy/precision/recall, ไม่ทำ dataset validation, ไม่ทำ long-run benchmark, ไม่หาค่า threshold ที่เหมาะกับคนจริงหลายคน, ไม่ทดสอบ calibration ของ Ticket 13 และ **ไม่บังคับให้ผู้ทดสอบหกล้ม/ทิ้งตัวจริง**

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

สิ่งที่ automated test อย่างเดียวมองไม่เห็นและต้องเช็คบน Chrome จริง:

- video + pose overlay ยังทำงานต่อเนื่องหลัง pipeline เปลี่ยนจาก `analyzePosture` เป็น extract → smooth → classify
- posture status ของคนจริงไม่กระพริบสลับไปมาถี่ ๆ จาก noise เล็กน้อยขณะนั่งแทบไม่ขยับ
- เมื่อจงใจเอียงไหล่จริง ระบบยังเปลี่ยนเป็น `นั่งเอียงข้าง` และ sustained alert/EventLog ยังทำงานครบ
- laptop-webcam framing ที่ไม่เห็นสะโพกยังตรวจคนได้และต่อท้าย `(เห็นแค่ช่วงบน)`
- เมื่อศีรษะหลุดจากเฟรมแต่ยังเห็นไหล่ ระบบต้องเลิกถือว่ามี valid posture หลัง tracker stale period แทนที่จะ classify ต่อจากไหล่อย่างเดียว
- การขยับตัวตาม scenario ต้องไม่ทำให้ skeleton หายทั้งโครงเป็นจังหวะ, loop ค้าง, UI freeze หรือ Console มี runtime/MediaPipe/canvas error ใหม่
- status line จาก Tickets 10–11 ต้องยังอัปเดต และ performance โดยรวมต้องยังลื่นในระดับใช้งานได้

สิ่งที่ **ไม่ใช่ scope ของ Ticket 12**:

- personal/per-camera calibration, baseline persistence, `headDropThreshold` และ calibrated head-drop — Ticket 13
- multi-issue posture พร้อมกัน — Ticket 15
- benchmark หลายเครื่อง/หลายคน/หลายกล้อง, endurance, CPU/GPU profiling แบบเป็นทางการ — Ticket 17
- พิสูจน์ exact 12 FPS ด้วย stopwatch — Ticket 10
- พิสูจน์ค่า inference ms เชิงสถิติ — Ticket 11
- face recognition / fatigue / distance — ปิดไว้ตลอด smoke นี้
- positive fall test ที่ต้องทิ้งตัวหรือหกล้มจริง — ไม่ควรทำใน smoke ของ Ticket 12

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง **ไม่ใช้ WSL**

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

| รายการ | ค่า |
|---|---|
| Node | `v26.1.0` |
| npm | `12.0.2` |
| Browser | Google Chrome desktop |
| Webcam | **อย่างน้อย 1 ตัว** สำหรับ required scenarios ทั้งหมด |
| Webcam ตัวที่ 2 | ไม่จำเป็น; ใช้เฉพาะ Optional Scenario 5 ถ้ามี |
| IP camera | ไม่จำเป็น |
| Backend | **ไม่ต้องรัน `backend/`** เพราะ required scenarios เป็น pose-only และปิด face features |

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

required scenarios ของ Ticket 12 ใช้ MediaPipe Pose + posture/fall logic ฝั่ง frontend เท่านั้น จึง **ไม่ต้องรัน `backend/`**

ตั้ง `เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)` = **ปิด** ตลอด smoke เพื่อลด noise จาก face/identity และไม่ให้ backend availability มีผลกับผลทดสอบ

> หมายเหตุ: ตัวแอปอาจพยายามโหลดรายชื่อ identity ตอน mount ตาม flow เดิม แต่เมื่อ face features ปิด สิ่งนี้ไม่ใช่ acceptance criterion ของ Ticket 12 ให้ Clear Console หลัง startup เสร็จก่อนเริ่มแต่ละ scenario แล้วพิจารณา error ที่เกิด **หลัง Clear** เป็นหลัก

### SettingsPanel — ค่าเริ่มต้นสำหรับ smoke

ตั้งค่าต่อไปนี้ก่อน Scenario 1:

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| โหมดการตรวจจับ | **ใช้คนเดียว (Personal Workstation) — แนะนำ** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **10°** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **2 s** |
| สัดส่วนร่วงตัวต่อหน้าต่างเวลาที่ถือว่าเร็วผิดปกติ | **0.40** |
| หน้าต่างเวลาที่ใช้ดูว่าร่วงตัวเร็วแค่ไหน | **300 ms** |
| มุมลำตัวที่ถือว่าล้มราบ/ใกล้แนวนอน | **80°** |
| ห้ามแจ้งเตือนซ้ำสำหรับคนเดิมถี่กว่านี้ | **60 s** |
| ทนรอหลังหายไปจากเฟรมก่อนสรุปว่าตกจากเก้าอี้ | **1 s** |
| เตือนพัก | คงค่าเดิม; required scenarios สั้นกว่าช่วงเตือนพักมาก |

เหตุผล:

- neck/torso ตั้งสูงเพื่อ isolate การทดสอบ `leaning`
- shoulder tilt = 10° เป็น threshold ที่ไวพอให้สร้าง leaning ได้ด้วยมือ แต่ท่านั่งตรงปกติควรยังนิ่ง
- sustained = 2 s ทำให้ทดสอบ alert lifecycle ได้โดยไม่ต้องค้างท่านาน
- fall threshold ตั้ง conservative เพื่อไม่ให้การเอียงไหล่ช้า ๆ ใน smoke ถูกตีความเป็นการหกล้ม

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ที่ Site settings ของ origin ให้ **Camera = Allow**
3. ปิด Zoom / Teams / OBS / Camera app หรือโปรแกรมอื่นที่กำลังใช้ webcam
4. ใช้ webcam ด้านหน้าหรือเฉียงหน้าเล็กน้อย ไม่ใช้มุมข้างจัด
5. จัดแสงให้ใบหน้า/ไหล่สว่างสม่ำเสมอ หลีกเลี่ยงย้อนแสงแรงและไฟกระพริบ
6. เริ่มระยะประมาณ **0.7–1.2 เมตร** ให้เห็นศีรษะ ไหล่ และช่วงอกชัด; สำหรับ scenario upper-body ไม่จำเป็นต้องเห็นสะโพก
7. เปิด DevTools → **Console**
8. รอ banner `กำลังโหลดโมเดล Pose Landmarker...` หาย
9. รอ skeleton เกาะตัวต่อเนื่องอย่างน้อย **5 วินาที**
10. ตรวจ status line ใต้กล้องว่ามีจำนวนคนและ `Pose ใช้เวลา ~X ms/ครั้ง`
11. หลัง startup/model load เสร็จ กด **Clear Console**
12. จดจำนวน EventLog ก่อนเริ่ม scenario
13. ถ้า scenario ก่อนหน้าทำให้มี active posture alert ให้กลับมานั่งตรงจน banner หายก่อนเริ่ม scenario ถัดไป
14. ระหว่างสังเกต smoothing อย่าสลับ Chrome ไป background tab เพราะ rAF อาจถูก browser throttle
15. ห้ามใช้การกระโดด, ทิ้งตัว, ล้มจากเก้าอี้ หรือเคลื่อนไหวเร็วเพื่อพยายาม trigger fall

---

## Scenario 1 — Neutral + upper-body framing: pipeline ใหม่ต้องตรวจคนได้และไม่ false leaning

**เป้าหมาย:** พิสูจน์เส้นทางหลัก extract → smooth → classify บน webcam จริง และ regression จาก Ticket 08 ว่าไม่เห็นสะโพกก็ยังใช้ได้

### เตรียมก่อนเริ่ม

1. ใช้ webcam 1 ตัว
2. ใช้ Settings ตามตารางด้านบน
3. นั่งตรงกลางเฟรม หลังตรง ศีรษะตั้งตรง ไหล่สองข้างให้ใกล้ระดับเดียวกัน
4. ปรับระยะ/มุมกล้องให้เห็นศีรษะ + ไหล่ชัด แต่ **จงใจให้สะโพกอยู่นอกเฟรม**
5. รอ skeleton settle **5 วินาที**
6. Clear Console
7. จด EventLog row count

### ขั้นตอนบน browser

1. นั่งนิ่งท่าปกติ **10 วินาที**
2. ระหว่าง 10 วินาที สังเกต skeleton ทุกเฟรมว่าตามศีรษะ/ไหล่ต่อเนื่องหรือไม่
3. ดูรายการคนใต้กล้อง ควรเห็นประมาณ `คนที่ 1 — นั่งท่าดี (เห็นแค่ช่วงบน)`
4. หายใจ/ขยับไหล่เล็กน้อยตามธรรมชาติ แต่ไม่จงใจเอียง
5. สังเกต status อีก **10 วินาที**
6. ตรวจ alert banner
7. ตรวจ EventLog
8. ตรวจ status line จำนวนคน + inference ms
9. ตรวจ Console

### Expected result

**Overlay / status**

- video แสดงสด
- skeleton ต้องอยู่บนศีรษะ/ไหล่ต่อเนื่อง ไม่หายทั้งโครงเป็นจังหวะ
- จำนวนคนควรเป็น 1 หลัง tracking settle
- posture status ต้องเป็น `นั่งท่าดี (เห็นแค่ช่วงบน)` เป็นส่วนใหญ่ขณะนั่งตรง
- ห้ามกลายเป็น `หลังค่อม/โน้มตัว` เพียงเพราะสะโพกไม่อยู่ในเฟรม
- ห้าม false `นั่งเอียงข้าง` ต่อเนื่องขณะไหล่จริงเกือบระดับ
- status line `Pose ใช้เวลา ~X ms/ครั้ง` ต้องยังอัปเดต

**Alert / EventLog**

- ไม่ควรมี posture alert banner
- EventLog ไม่ควรเพิ่ม row ใหม่จากการนั่งตรง

**Console**

- ไม่มี uncaught exception
- ไม่มี React error
- ไม่มี MediaPipe `detectForVideo` error
- ไม่มี canvas error
- ไม่มี error ที่เกิดซ้ำทุกเฟรมจาก pipeline ใหม่

### PASS

PASS เมื่อ upper-body framing ยังตรวจคนได้, ป้ายต่อท้าย `(เห็นแค่ช่วงบน)`, ไม่มี false slouch/lean ต่อเนื่อง, overlay/status line ยังทำงาน และ Console สะอาด

### FAIL

FAIL ถ้าเกิดอย่างใดอย่างหนึ่ง:

- เห็นหัว+ไหล่ชัดแต่ระบบขึ้น `ยังไม่พบคนในเฟรม` ต่อเนื่อง
- upper-body ถูก report เป็น slouch เพียงเพราะไม่มีสะโพก
- นั่งตรงแต่ status กระพริบ `นั่งเอียงข้าง` ซ้ำ ๆ จนเกิด alert
- skeleton หาย/กลับทั้งโครงเป็นจังหวะหรือ freeze หลายวินาที
- status line หยุดอัปเดต
- EventLog เพิ่ม posture event ทั้งที่นั่งตรง
- Console มี runtime error ใหม่

---

## Scenario 2 — Smoothing stability: noise เล็กน้อยต้องไม่ทำให้ status สลับทุกเฟรม

**เป้าหมาย:** พิสูจน์ผลที่ผู้ใช้ควรมองเห็นจาก EMA `alpha = 0.3`: landmark noise และ micro-movement เล็กน้อยไม่ควรทำให้ posture status เด้งไปมาถี่ ๆ ขณะท่าจริงแทบไม่เปลี่ยน

> Scenario นี้เป็น visual smoke ไม่ใช่การพิสูจน์สูตร EMA เชิงตัวเลข เพราะหน้าเว็บไม่ได้ expose raw/smoothed angle ทุกเฟรม

### เตรียมก่อนเริ่ม

1. ใช้ webcam และ Settings เดิม
2. ให้ศีรษะ + ไหล่เห็นชัด
3. นั่งตรง **5 วินาที**
4. Clear Console
5. จด EventLog row count

### ขั้นตอนบน browser

1. นั่งนิ่งจริง ๆ **5 วินาที**
2. ต่อมา **10 วินาที** ให้ขยับเฉพาะไหล่เล็กมากแบบธรรมชาติ:
   - ยกไหล่ซ้ายขึ้นเล็กน้อยประมาณ 1–2 ซม. แล้วกลับ
   - ยกไหล่ขวาขึ้นเล็กน้อยประมาณ 1–2 ซม. แล้วกลับ
   - ทำช้า ๆ ไม่เกิน 1 รอบต่อ 2 วินาที
3. ห้ามเอียงตัวแรงหรือยกไหล่จนเห็นเป็นมุมชัด
4. ระหว่าง 10 วินาที มองข้อความ posture status ตลอด
5. จากนั้นหยุดขยับและนั่งนิ่ง **5 วินาที**
6. ตรวจ alert banner, EventLog และ Console

### Expected result

- status อาจเปลี่ยนชั่วคราวได้ถ้าท่าจริงข้าม threshold แต่ **ไม่ควรสลับ good ↔ leaning แบบ frame-to-frame/หลายครั้งต่อวินาที** ขณะที่ท่าทางแทบคงเดิม
- เมื่อหยุด micro-movement แล้ว status ควรกลับ/คงที่ภายในช่วงสั้น ๆ ไม่ค้างสถานะผิดเป็นเวลานาน
- ไม่ควรมี sustained posture alert จาก micro-movement ชุดนี้
- EventLog row count ควรเท่าเดิม
- overlay ยังลื่นและต่อเนื่อง
- Console ไม่มี error ใหม่

### PASS

PASS เมื่อ status มีความนิ่งทางสายตาอย่างชัดเจนระหว่างท่าคงที่/ขยับเล็กน้อย, ไม่เกิด alert จาก noise และ UI/overlay ไม่ regression

### FAIL

FAIL เมื่อ:

- status สลับ `นั่งท่าดี` ↔ `นั่งเอียงข้าง` รัว ๆ หลายครั้งต่อวินาทีขณะท่าจริงแทบไม่เปลี่ยน
- micro-movement เล็กน้อยสร้าง sustained alert/EventLog ซ้ำ ๆ
- status ค้างผิดหลังกลับมานิ่งนานหลายวินาที
- overlay/video กระตุกหรือ loop หยุดอย่างเห็นได้ชัด
- Console มี error ใหม่

---

## Scenario 3 — Intentional leaning: smoothing ต้องไม่ทำให้ detection/alert หาย

**เป้าหมาย:** ตรวจด้านตรงข้ามกับ Scenario 2: smoothing ต้องลด noise แต่ยังตอบสนองต่อ posture ที่ผิดจริง และต่อเข้า posture state machine / alert / EventLog ถูกต้อง

### เตรียมก่อนเริ่ม

1. ใช้ Settings เดิม โดยเฉพาะ:
   - neck = 45°
   - torso = 35°
   - shoulder tilt = 10°
   - sustained = 2 s
2. ให้เห็นหัวและไหล่ชัด
3. นั่งตรงจน status เป็น `นั่งท่าดี` อย่างน้อย **3 วินาที**
4. Clear Console
5. จด EventLog row count

### ขั้นตอนบน browser

#### รอบ A — ผิดท่าสั้นกว่า sustained

1. ค่อย ๆ ลดไหล่ข้างหนึ่งและยกอีกข้างหนึ่งให้เห็นเอียงชัด ใช้เวลา **1 วินาที**
2. ค้างท่าเอียง **ประมาณ 1 วินาที**
3. กลับมานั่งตรง ใช้เวลา **1 วินาที**
4. นั่งตรงต่อ **3 วินาที**
5. ตรวจ banner และ EventLog

#### รอบ B — ผิดท่านานพอให้แจ้งเตือน

6. ทำท่าเอียงแบบเดิมอีกครั้ง
7. ค้างท่าเอียงชัด **5 วินาที**
8. ระหว่างค้างดู posture status; ต้องเปลี่ยนเป็น `นั่งเอียงข้าง`
9. หลังผ่าน sustained + smoothing delay ต้องมี alert banner `⚠ คนที่ 1: นั่งเอียงข้าง` หรือข้อความเทียบเท่าตาม label ปัจจุบัน
10. ดู EventLog ต้องมี row ใหม่:
    - หมวด `ท่านั่ง`
    - ประเภท `นั่งเอียงข้าง`
    - ระยะเวลาเริ่มเป็น `กำลังดำเนินอยู่...`
11. กลับมานั่งตรง
12. ค้างท่าตรงอย่างน้อย **3 วินาที** เพื่อให้ smoothing decay + 1 s hysteresis มีเวลาจบ event
13. ตรวจว่า alert banner หาย
14. ตรวจ EventLog row เดิมต้องเปลี่ยนจาก active เป็นมีระยะเวลาแล้ว ไม่สร้าง row duplicate สำหรับ event เดียว
15. ตรวจ Console

### Expected result

**รอบ A**

- status อาจเริ่มตอบสนอง แต่ไม่ควรมี sustained alert
- EventLog ต้องไม่เพิ่ม posture row

**รอบ B**

- status ต้องเปลี่ยนเป็น `นั่งเอียงข้าง` ภายในช่วงค้าง 5 วินาที
- ต้องเกิด alert หลังปัญหาต่อเนื่องครบ threshold; ไม่จำเป็นต้องตรง stopwatch 2.000 s เพราะมี pose cadence + EMA + render timing
- EventLog เพิ่ม **1 row** สำหรับ leaning event
- กลับมานั่งตรงแล้ว banner ต้องหายหลัง recovery
- row เดิมต้องมี ended duration
- ห้ามมี fall banner/EventLog จากการเอียงช้า ๆ ตามขั้นตอนนี้
- Console ไม่มี error

### PASS

PASS เมื่อ short lean ไม่ alert, sustained lean alert 1 ครั้ง, recovery จบ event ได้ และไม่มี false fall/runtime error

### FAIL

FAIL เมื่อ:

- short lean ประมาณ 1 s สร้าง alert
- ค้าง lean 5 s แล้ว status ไม่เคยเป็น leaning
- ค้าง lean 5 s แล้วไม่มี posture alert/EventLog
- alert เดียวสร้าง EventLog หลาย row ซ้ำ
- กลับนั่งตรง >3 s แล้วยัง active โดยที่ status กลับ good แล้ว
- การเอียงช้าทำให้เกิด fall alert
- Console มี error ใหม่

---

## Scenario 4 — Quality gate regression: ศีรษะหลุดเฟรมต้องไม่ถูกวิเคราะห์จากไหล่อย่างเดียว

**เป้าหมาย:** ครอบ regression finding จาก code review และ Ticket 08 dependency: valid posture ต้องมี head signal + shoulder signal; ถ้าเห็นไหล่แต่ไม่เห็นศีรษะต้องหยุดวิเคราะห์ posture นั้น

### เตรียมก่อนเริ่ม

1. เริ่มจาก Scenario 1 framing ที่ระบบตรวจได้ปกติ
2. นั่งตรงจนเห็น `คนที่ 1 — นั่งท่าดี (เห็นแค่ช่วงบน)`
3. ไม่มี active alert
4. Clear Console
5. จด EventLog row count

### ขั้นตอนบน browser

1. โดย **ไม่เคลื่อนไหวเร็ว** ให้ค่อย ๆ เลื่อนตัว/ปรับท่านั่งสูงขึ้นจน:
   - ศีรษะและหูหลุดพ้นขอบบนของภาพ
   - ยังเห็นไหล่อย่างน้อยหนึ่ง/สองข้างอยู่ในภาพ
2. ค้างตำแหน่งนี้ **6 วินาที**
   - ต้องเผื่อ tracker stale period ประมาณ 4 วินาที; ไม่คาดหวังให้คนหายทันทีเฟรมแรก
3. สังเกต skeleton/people list
4. หลังประมาณ 5–6 วินาที ตรวจว่าจำนวนคนลดเป็น 0 หรือ UI แสดง `ยังไม่พบคนในเฟรม`
5. ตรวจว่าไม่มี posture alert ใหม่จาก shoulders-only signal
6. ค่อย ๆ กลับเข้าตำแหน่งเดิม
7. รอ **5 วินาที**
8. ต้องตรวจคนได้ใหม่และ posture status กลับมา
9. ตรวจ EventLog และ Console

### Expected result

- ช่วงแรกที่หัวเพิ่งหลุด อาจยังเห็น person summary เดิมชั่วคราวเพราะ tracker stale timeout — **ไม่ถือว่า fail**
- หลังค้าง ~6 s โดยไม่มี head signal ระบบต้องไม่วิเคราะห์ posture ต่อแบบถาวรจากไหล่อย่างเดียว
- UI ต้องเปลี่ยนเป็นไม่พบคน/จำนวน 0 หลัง track ถูกถอด
- ไม่ควรสร้าง leaning/slouching event จาก shoulders-only period
- เมื่อศีรษะกลับเข้าเฟรม ระบบต้อง recover ได้โดยไม่ reload หน้า
- overlay ต้องไม่ค้าง skeleton เก่าถาวร
- Console ไม่มี error

### PASS

PASS เมื่อ shoulders-only โดยไม่มีหัวถูก reject หลัง tracker timeout, ไม่เกิด false posture event และกลับเข้ากล้องแล้ว tracking recover

### FAIL

FAIL เมื่อ:

- หลังหัวหาย >6 s ยังถือว่าคนเดิมมี valid posture ต่อเนื่อง
- shoulders-only ทำให้เกิด leaning/slouch alert
- คนกลับเข้ากล้องแล้ว pose loop ไม่ recover
- skeleton เก่าค้างถาวร
- Console มี error

---

## Optional Scenario 5 — สลับ local webcam source แล้ว pipeline ต้อง recover

**สถานะ:** optional regression เท่านั้น ไม่ใช่ acceptance criterion หลักของ Ticket 12 และไม่ต้องซื้อ/หา webcam ตัวที่ 2 เพื่อทำ scenario นี้

ทำเมื่อมี local webcam **2 ตัวขึ้นไป**

**เป้าหมาย:** ตรวจแบบสั้นว่าการเพิ่ม per-person smoothing history ไม่ทำให้ source switch regression เช่น loop ตาย, overlay ค้าง หรือ status ไม่กลับมา

### ขั้นตอน

1. ใช้ webcam ตัวที่ 1 และนั่งตรงจน tracking stable **5 วินาที**
2. Clear Console
3. ใน `แหล่งภาพกล้อง` เลือก webcam ตัวที่ 2 ใน **slot เดิม**
4. อนุญาตกล้องถ้า Chrome ถาม
5. รอภาพใหม่ + skeleton **5–10 วินาที**
6. นั่งตรงและดู posture status อีก **5 วินาที**
7. สลับกลับ webcam ตัวที่ 1
8. รอ recover อีก **5–10 วินาที**
9. ตรวจ overlay/status/EventLog/Console

### Expected result

- source ใหม่แสดงภาพจริง ไม่ใช่ frame เก่า
- skeleton เก่าต้องไม่ค้างถาวรบน source ใหม่
- pose tracking และ posture status ต้องกลับมาอัปเดตได้
- status อาจมี transient จาก smoothing/tracker ระหว่างเปลี่ยน sourceได้ แต่ไม่ควรค้างผิดหลายวินาทีหรือสร้าง alert โดยไม่มี posture ผิดจริงต่อเนื่อง
- Console ไม่มี MediaPipe/canvas/runtime error ใหม่

ถ้าไม่มี webcam 2 ตัว ให้บันทึก `N/A — hardware ไม่พร้อม; Ticket 12 ไม่ได้ require multi-camera`

---

## สิ่งที่ไม่ควรบังคับทำด้วยมือ และ automated verification ที่พิสูจน์แทน

### 1. Exact pixel-space math

หน้าเว็บไม่ได้แสดง raw `neckAngleDeg`, `torsoAngleDeg`, `shoulderTiltDeg` ทุกเฟรม จึงไม่ควรให้คนพยายามจัดร่างกายเพื่อพิสูจน์ตัวเลขระดับองศา exact ด้วยสายตา

พิสูจน์ด้วย Vitest:

- `src/lib/postureAnalysis.test.ts`
  - `computes neck angle in pixel space instead of normalized coordinate space`
  - `computes shoulder tilt in pixel space`
  - `computes torso angle in pixel space`
  - `reports level shoulders as about 0 degrees when the left shoulder has the larger x coordinate`

### 2. Exact `headHeightRatio` formula / both-shoulders rule

ไม่ควรใช้ไม้บรรทัดวัด pixel จากหน้าจอด้วยมือ

พิสูจน์ด้วย:

- `src/lib/postureAnalysis.test.ts`
  - `computes head height ratio from pixel head height divided by pixel shoulder width`
  - `keeps head height ratio null when only one shoulder is visible`

### 3. Quality-gate edge cases แบบ synthetic

บางกรณีจัดเฟรมจริงให้ landmark visibility ตรงตามเงื่อนไขได้ไม่แน่นอน

พิสูจน์ด้วย:

- `src/lib/postureAnalysis.test.ts`
  - `returns null when the shoulder signal is missing`
  - `returns null when the head signal is missing even if shoulders and hips are visible`
  - `analyzes an ears-and-shoulders-only pose as upper body without a torso angle`
  - `computes torso angle in pixel space` มี assertion `quality === 'full_body'`

### 4. EMA exact arithmetic

manual smoke ดูได้เฉพาะผลทางสายตาว่า status เสถียรขึ้น ไม่สามารถพิสูจน์สมการ `0.3 * current + 0.7 * previous` แบบ exact ได้

พิสูจน์ด้วย:

- `src/lib/smoothing.test.ts`
  - `uses the current value when there is no previous value`
  - `blends the current value with the previous value using alpha`
  - `returns the current features unchanged for the first sample`
  - `smooths numeric features while preserving current null measurements and quality`

### 5. Classification ที่ควบคุม geometry ได้แน่นอน

ร่างกายจริง/MediaPipe มี noise จึงไม่ควรสรุปสูตร classify จากท่ามนุษย์หนึ่งเฟรม

พิสูจน์ด้วย:

- `src/lib/postureAnalysis.test.ts`
  - `classifies a neutral upper-body pose as good`
  - `classifies sufficiently tilted shoulders as leaning`

### 6. State-machine timing ที่เริ่มตรง `t = 0`

มนุษย์กด stopwatch ไม่สามารถสร้าง timestamp = 0 หรือพิสูจน์ null-vs-truthiness edge case ได้

พิสูจน์ด้วย:

- `src/lib/sustainedAlertMachine.test.ts`
  - `does not alert before the sustained duration elapses`
  - `alerts once when a bad posture starting at t=0 reaches the sustained duration`
  - `preserves zero-valued signal and recovery timestamps`

### 7. Fall positive path / raw-vs-smoothed emergency signal

**ห้ามบังคับผู้ทดสอบล้มจริง** เพื่อพิสูจน์ Ticket 12

สิ่งที่ automated test พิสูจน์ได้:

- `src/lib/fallDetection.test.ts`
  - `returns false when the torso angle is unavailable`
  - `returns true when the torso angle reaches the fall threshold`
- full `fallDetection.test.ts` ต้องยังเขียว

ส่วน wiring ว่า `CameraStage` ส่ง **raw `features.torsoAngleDeg`** เข้า fall check ไม่ใช่ `smoothed.torsoAngleDeg` ถูกพิสูจน์ใน code review/static inspection ของ Ticket 12; smoke นี้ทำเพียง **negative safety regression** ว่าการเอียงตัวช้า ๆ ตาม Scenario 3 ต้องไม่สร้าง fall alert

positive fall behavior จริงแบบ human-in-the-loop ให้เก็บไว้ Ticket 17 ไม่ทำซ้ำที่นี่

---

## เกณฑ์สรุป Ticket 12 manual smoke

**PASS ทั้ง Ticket** เมื่อ required Scenario 1–4 ผ่านทั้งหมด:

- pose overlay ยังต่อเนื่อง
- upper-body ยังตรวจได้และไม่ false slouch
- status มีความนิ่งทางสายตาเมื่อมี noise เล็กน้อย
- intentional leaning ยัง classify และ sustained alert ได้
- EventLog start/end ถูกต้องและไม่ duplicate
- missing-head quality gate ทำงานหลัง tracker timeout
- ไม่มี false fall จาก movement ช้า
- Console ไม่มี runtime/MediaPipe/canvas error ใหม่

Optional Scenario 5 ไม่บล็อก PASS หากไม่มี webcam ตัวที่ 2

**FAIL ทั้ง Ticket** ถ้า required scenario ใดพบ regression ที่ทำให้ pipeline ผิด requirement เช่น false alert ต่อเนื่อง, posture detection หาย, smoothing ทำให้ status รัว/ค้างผิด, upper-body ใช้ไม่ได้, EventLog lifecycle พัง, pose loop freeze หรือมี runtime error ใหม่

ถ้าความรู้สึกว่า “แม่น/ไม่แม่น” ยังตัดสินไม่ได้แต่ behavior เชิง integration ข้างต้นทำงานครบ ให้บันทึก observation ไว้และ **อย่า** เปลี่ยน smoke นี้เป็น accuracy study; validation เชิง HITL/threshold tuning เป็นงานของ Ticket 17

---

## ตารางสรุปผล

| Scenario | ผล | หมายเหตุ |
|---|---|---|
| 1 — Neutral + upper-body framing | ☐ PASS ☐ FAIL ☐ N/A | |
| 2 — Smoothing stability / micro-movement | ☐ PASS ☐ FAIL ☐ N/A | |
| 3 — Intentional leaning + alert/EventLog lifecycle | ☐ PASS ☐ FAIL ☐ N/A | |
| 4 — Missing-head quality gate regression | ☐ PASS ☐ FAIL ☐ N/A | |
| 5 — Optional source switch (2 webcams) | ☐ PASS ☐ FAIL ☐ N/A | |

### Test environment / evidence

| รายการ | บันทึก |
|---|---|
| วันที่ทดสอบ | |
| ผู้ทดสอบ | |
| URL ที่ใช้ | |
| Browser + version | |
| OS + version | |
| Webcam รุ่น/ชื่อ device | |
| Webcam ตัวที่ 2 (ถ้ามี) | |
| Camera resolution ที่ browser ใช้/สังเกตได้ | |
| Node | `v26.1.0` |
| npm | `12.0.2` |
| Backend | ไม่รัน / N/A |
| Console errors หลัง Clear | |
| EventLog ก่อน/หลัง | |
| Observation เรื่อง overlay/fps/ความลื่น | |
| สรุป Ticket 12 | ☐ PASS ☐ FAIL |
