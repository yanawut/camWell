# 06: Manual browser smoke — แจ้งเตือนหกล้มแล้วหายไปจากเฟรม

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 06 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ bug `fall_suspected_left_frame` และ regression ของ fall flow ที่ Ticket นี้แตะ ไม่แทน HITL/endurance/ความแม่นยำรอบใหญ่ของ Ticket 17

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 06 แก้เวลาที่ใช้ตัดสินกรณี “ร่วงตัวเร็วแล้วหลุดเฟรม” จากเวลาที่ tracker ลบ track มาเป็น “เวลาที่เห็นคนครั้งสุดท้ายเทียบกับเวลาที่เกิด rapid drop” ดังนั้น manual smoke ต้องพิสูจน์ browser flow ที่ unit test อย่างเดียวมองไม่เห็นครบ:

- ด้วยค่า fall **default** คนที่ร่วงตัวเร็วแล้วหลุดออกด้านล่างของเฟรม ต้องเกิด `fall_suspected_left_frame` หลัง tracker ตัด track ประมาณ 4–5 วินาที
- ถ้าร่วงตัวเร็วแต่ยังถูกกล้องมองเห็นต่อเกิน `disappearGraceMs` แล้วค่อยออกจากเฟรม ต้อง **ไม่** เกิด left-frame false positive
- ถ้าเดินออกจากเฟรมตามปกติโดยไม่มี rapid drop ต้องไม่เกิด left-frame alert
- alert ต้องต่อถึง UI จริง: global fall banner, EventLog และ console reporter
- หลังกลับเข้ากล้อง pose overlay + status line ต้องกลับมาทำงาน ไม่ค้างหลัง track ถูกลบ
- regression path `fall_detected` ขณะยังเห็นคนในเฟรมต้องยังทำงาน และไม่ถูก Ticket 06 ทำพัง
- Console ต้องไม่มี runtime/React/pose/fall error จาก flow ที่กำลังทดสอบ

สิ่งที่ **ไม่ใช่ scope ของ Ticket 06** และไม่ใช้ smoke นี้ตัดสิน:

- ความแม่นยำเชิงสถิติของโมเดล fall detection กับคนหลายรูปร่าง/หลายมุมกล้อง
- การวัด false-positive/false-negative หลายสิบหรือหลายร้อยรอบ
- การวัด FPS, CPU, inference ms หรือความลื่นเชิงตัวเลข
- skeleton micro-flicker แบบละเอียด — Ticket 04
- การสลับ camera source แล้ว cached overlay ถูก reset ถูกต้องหรือไม่ — Ticket 04
- หลายกล้องพร้อมกัน — Ticket 06 ไม่ใช่ multi-camera ticket
- endurance หลายชั่วโมงหรือ acceptance หลายฟีเจอร์พร้อมกัน — Ticket 17
- identity/face recognition/fatigue/distance

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจได้ใน workspace ตอนเขียน smoke นี้:

- Node: `v26.1.0`
- npm: `12.0.2`
- Browser: **Google Chrome desktop**
- Webcam: **1 ตัว** ก็เพียงพอสำหรับ Ticket 06
- แนะนำ webcam ที่จัดตำแหน่งให้เห็นศีรษะ ไหล่ ลำตัว และสะโพกได้ เพื่อให้ทั้ง rapid-drop และ `fall_detected` path มีข้อมูลครบ
- ต้องมีพื้นที่ให้ผู้ทดสอบ “ย่อตัวเร็ว” ได้อย่างปลอดภัยโดยไม่ต้องล้มจริง

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

**ไม่ต้องรัน `backend/` สำหรับ smoke ของ Ticket 06**

ทุก required scenario ใช้ MediaPipe Pose และ fall logic ฝั่ง frontend เท่านั้น ไม่ใช้ fatigue/distance/identity ให้ปิด checkbox ฟีเจอร์ใบหน้าตลอดการทดสอบ

หมายเหตุ: โค้ด `App.tsx` ปัจจุบันยังเรียก `/api/employees` ตอน mount เพื่อโหลดรายชื่อ identity แม้ face features จะปิดอยู่ ถ้า Chrome แสดง network error ไป `http://localhost:4000/api/employees` เพราะ backend ไม่ได้รัน ให้บันทึกข้อความจริงแยกไว้เป็นพฤติกรรมนอก scope ของ Ticket 06 และ **อย่าเปิด backend เพียงเพื่อกลบ error นี้** สำหรับ smoke นี้

เกณฑ์ Console ของ Ticket 06 คือ ต้องไม่มี **runtime error ใหม่** จาก `CameraStage`, MediaPipe/pose loop, fall detection, React หรือ uncaught exception ระหว่าง scenario

### SettingsPanel — ค่า required สำหรับ Scenario 1–3

เพื่อพิสูจน์ bug จริงของ Ticket ต้องใช้ค่า fall เริ่มต้น ไม่ปรับให้ “ง่ายขึ้น” ในสาม scenario แรก

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| เปิดเสียงแจ้งเตือน | **ปิด** เพื่อไม่ให้เสียงรบกวนการสังเกต banner; เสียงไม่ใช่ acceptance criterion ของ Ticket 06 |
| สัดส่วนร่วงตัวต่อหน้าต่างเวลาที่ถือว่าเร็วผิดปกติ | **0.20** |
| หน้าต่างเวลาที่ใช้ดูว่าร่วงตัวเร็วแค่ไหน | **700 ms** |
| มุมลำตัวที่ถือว่าล้มราบ/ใกล้แนวนอน | **55°** |
| ห้ามแจ้งเตือนซ้ำสำหรับคนเดิมถี่กว่านี้ (cooldown) | **15 s** |
| ทนรอหลังหายไปจากเฟรม ก่อนสรุปว่าตกจากเก้าอี้จนหลุดมุมกล้อง | **2.5 s** |

วิธีง่ายที่สุดในการกลับค่า fall เป็น default คือ reload หน้าเว็บก่อนเริ่ม Scenario 1–3 เพราะ fall thresholds ไม่ได้ persist ลง localStorage

### SettingsPanel — ค่า Scenario 4

Scenario 4 มีไว้เช็ก regression ของ `fall_detected` เดิมโดย **ไม่บังคับให้ล้มจริง** จึงอนุญาตให้ลด threshold ชั่วคราวเพื่อสร้างสัญญาณอย่างปลอดภัย:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| เปิดเสียงแจ้งเตือน | **ปิด** |
| สัดส่วนร่วงตัวต่อหน้าต่างเวลาที่ถือว่าเร็วผิดปกติ | **0.10** |
| หน้าต่างเวลาที่ใช้ดูว่าร่วงตัวเร็วแค่ไหน | **1500 ms** |
| มุมลำตัวที่ถือว่าล้มราบ/ใกล้แนวนอน | **30°** |
| cooldown | **15 s** |
| disappear grace | **2.5 s** |

การลด threshold ใน Scenario 4 ไม่ใช้เป็นหลักฐานว่าค่า default แม่นยำ แค่ใช้ยืนยันว่าเส้นทาง event `fall_detected` ยังถูก wire อยู่หลังแก้ Ticket 06

## การเตรียมร่วมก่อนแต่ละ scenario

1. ใช้ Chrome desktop เปิด Camwell จาก Vite URL
2. ตรวจ Site settings ของ origin นี้ให้ **Camera = Allow**
3. ใน “แหล่งภาพกล้อง” เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)` และเลือก webcam ที่ต้องการ
4. ใช้กล้อง **เพียง 1 slot** ถ้ามี slot กล้อง 2 ค้างจาก localStorage ให้กด `ลบกล้องนี้` จนเหลือกล้องเดียว
5. ปิด `เปิดฟีเจอร์เกี่ยวกับใบหน้า...`
6. ปิดเสียงแจ้งเตือน
7. ตั้ง fall settings ตาม scenario
8. จัดกล้องด้านหน้าหรือเฉียงหน้าเล็กน้อย ให้เห็นผู้ทดสอบตั้งแต่ศีรษะถึงสะโพก และมีพื้นที่ด้านล่างเฟรมให้ย่อตัวจนไหล่หลุดเฟรมได้
9. ใช้แสงด้านหน้าหรือด้านข้างสม่ำเสมอ หลีกเลี่ยงย้อนแสงแรง
10. **ห้ามล้มจริง** ให้ใช้การย่อเข่า/ก้มตัวแบบควบคุมเท่านั้น และเอาเก้าอี้/ของแข็งที่เสี่ยงชนออกจากบริเวณทดสอบ
11. รอข้อความ `กำลังโหลดโมเดล Pose Landmarker...` หาย
12. ยืนหรือนั่งนิ่งตรงกลางเฟรมประมาณ **5 วินาที**
13. ต้องเห็น:
    - skeleton/pose overlay ตามตัว
    - status line `ตรวจพบในเฟรม: 1 คน ...`
    - ถ้าเปิด people list ต้องเห็นคนที่ตรวจได้
14. เปิด DevTools → **Console**
15. กด Clear Console หลัง pose พร้อมแล้ว
16. จดจำนวนรายการใน `ประวัติการแจ้งเตือนวันนี้ (...)` ก่อนเริ่ม scenario
17. ถ้ามี fall banner ค้างจาก scenario ก่อน ให้กด `รับทราบ` แล้ว reload ก่อนเริ่ม scenario ใหม่
18. ระหว่างทดสอบให้ tab Camwell อยู่ foreground และอย่าปล่อยเครื่อง sleep/lock

---

## Scenario 1 — Rapid drop แล้วหลุดเฟรม ต้องเกิด `fall_suspected_left_frame` ด้วยค่า default

**เป้าหมาย:** พิสูจน์ bug หลักของ Ticket 06 ว่า default `disappearGraceMs = 2.5 s` ใช้งานได้แม้ tracker จะรอประมาณ 4 วินาทีก่อนลบคน

### เตรียมก่อนเริ่ม

1. reload หน้าเพื่อกลับ fall thresholds เป็น default
2. ตรวจค่าตามตาราง Scenario 1–3
3. ยืนตรงกลางเฟรมให้เห็นศีรษะ ไหล่ ลำตัว และสะโพก
4. พยายามจัดระยะให้ไหล่อยู่ประมาณช่วงบน-กลางของภาพตอนยืน และเมื่อย่อตัวเร็วไหล่สามารถเคลื่อนลงอย่างชัดเจนก่อนหลุดด้านล่าง
5. รอ status = 1 คนต่อเนื่องอย่างน้อย 5 วินาที
6. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ยืน/นั่งตัวตรงคงที่ประมาณ **2 วินาที**
2. จากนั้น **ย่อตัวลงเร็วแบบควบคุม** โดยใช้เข่า ไม่ทิ้งตัว ไม่ล้มจริง
3. ให้การเคลื่อนลงเกิดภายในประมาณ **0.5–0.7 วินาที** และต่อเนื่องจนศีรษะ/ไหล่หลุดออกด้านล่างของเฟรม
4. เมื่อหลุดเฟรมแล้ว ให้อยู่นอกเฟรมต่อเนื่องอย่างน้อย **5 วินาที**
5. ระหว่างนั้นดู status line:
   - ตอนเพิ่งหลุดอาจยังค้าง 1 คนชั่วคราวเพราะ tracker grace
   - หลังประมาณ 4 วินาทีควรลงเป็น 0 คนเมื่อ track ถูกลบ
6. จับตาบริเวณบนสุดของแอปประมาณช่วง **4–5 วินาทีหลังเห็นคนครั้งสุดท้าย**
7. ต้องมี global fall banner สีแดงพร้อมปุ่ม `รับทราบ` และข้อความใจความ:
   `สงสัยว่า คนที่ 1 หกล้ม/ตกจากเก้าอี้ แล้วหายไปจากมุมกล้องกะทันหัน — กรุณาตรวจสอบด่วน!`
   - หมายเลขคนอาจต่างจาก 1 ถ้าไม่ได้ reload ก่อนเริ่ม แต่ข้อความต้องเป็นชนิด “สงสัยว่า ... แล้วหายไปจากมุมกล้อง”
8. ตรวจ EventLog ต้องเพิ่ม **1 row**:
   - หมวด: `การหกล้ม`
   - ประเภท: `สงสัยหกล้ม — หายไปจากเฟรมกะทันหันหลังร่วงตัวเร็ว`
   - ระยะเวลาโดยทั่วไปเป็น `0 วิ` เพราะ event นี้เป็น edge-triggered และถูกสร้างเป็น event ที่จบแล้ว
9. ตรวจ Console:
   - อนุญาต `console.info` จาก `[alertReporter] เริ่มแจ้งเตือน...`
   - ต้องไม่มี uncaught/runtime/React/pose/fall error ใหม่
10. ยังอยู่นอกเฟรมต่ออีก **5 วินาที**
11. ต้องไม่มี left-frame row ที่สองจาก track เดิม และไม่มี banner ใหม่ซ้ำจากเหตุการณ์เดิม
12. กด `รับทราบ`
13. กลับเข้ากล้องและยืนตรงกลางเฟรม
14. รอไม่เกินประมาณ 2–3 วินาที:
   - skeleton ต้องกลับมา
   - status line ต้องกลับเป็น 1 คน
   - UI ต้องไม่ freeze
15. ตรวจ Console อีกครั้ง

### Expected result

- rapid shoulder drop ถูกจับก่อนหลุดเฟรม
- แม้ alert ถูกประเมินตอน track ถูกลบหลังประมาณ 4 วินาที แต่ default grace 2.5 วินาทียังทำให้ left-frame alert เกิดได้
- เกิด global fall banner ถูกชนิด
- EventLog เพิ่ม exactly 1 left-frame event
- ไม่ spam event ซ้ำจาก track เดิมเมื่ออยู่นอกเฟรมต่อ
- กลับเข้ากล้องแล้ว overlay/status recover
- Console ไม่มี error จาก Ticket 06 flow

### PASS

ผ่านเมื่อเกิด left-frame banner + EventLog 1 รายการด้วยค่า default หลัง rapid drop → หลุดเฟรม และระบบกลับมาจับ pose ได้หลังเข้ากล้องใหม่โดยไม่มี runtime error

### FAIL

ถือว่า fail ถ้าเกิดข้อใดข้อหนึ่ง:

- ทำ rapid drop ชัดเจนแล้วหลุดเฟรม แต่รอเกิน 5–6 วินาทียังไม่มี left-frame alert
- EventLog ไม่มี `fall_suspected_left_frame`
- alert เกิดซ้ำหลายรายการจาก track เดียวทั้งที่ยังอยู่นอกเฟรม
- status ลง 0 แล้วกลับเข้ากล้องแต่ skeleton/status ไม่ฟื้น
- Console มี exception/error จาก tracker/fall/pose flow

> ถ้าไม่เกิด alert เพราะ pose หลุดก่อนที่จะเห็น rapid drop อย่างชัดเจน ให้ถือว่ารอบนั้น **INVALID RUN** ไม่ใช่ FAIL แล้วปรับตำแหน่งกล้อง/ระยะให้กล้องเห็นช่วงการย่อลงก่อนหลุดเฟรมมากขึ้น จากนั้นเริ่ม scenario ใหม่

---

## Scenario 2 — Rapid drop แต่ยังอยู่ในเฟรมเกิน grace ต้องไม่กลายเป็น left-frame false positive

**เป้าหมาย:** พิสูจน์ requirement สำคัญของ `lastSeenAt`: ถ้าคนร่วงตัวเร็ว แต่กล้องยังเห็นคนต่อเกิน 2.5 วินาที แล้วค่อยออกจากเฟรม จะต้องไม่สรุปว่า “ร่วงแล้วหายทันที”

### เตรียมก่อนเริ่ม

1. reload หน้า
2. ใช้ fall default
3. จัดกล้องให้เห็นคนเต็มพอที่จะ **ย่อตัวเร็วแต่ยังอยู่ในเฟรม**
4. ยืนตรง status = 1 คนอย่างน้อย 5 วินาที
5. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ย่อตัวลงเร็วภายในประมาณ **0.5–0.7 วินาที** แต่หยุดที่ท่าต่ำซึ่งศีรษะ/ไหล่ยังอยู่ในเฟรม
2. รักษาลำตัวค่อนข้างตั้งตรง เพื่อหลีกเลี่ยงการกระตุ้น `fall_detected`
3. อยู่ในท่าต่ำหรือกลับยืนตรง แต่ **ต้องให้ pose ยังเห็นคนต่ออย่างน้อย 3.5 วินาที**
4. ตรวจ status line ต้องยังเป็น 1 คนในช่วงนี้
5. หลังผ่าน 3.5 วินาทีแล้ว ให้เดินออกด้านข้าง **ช้า ๆ** โดยไม่ย่อตัวซ้ำ
6. อยู่นอกเฟรมอย่างน้อย **5 วินาที** จน tracker ถูกลบและ status ลง 0
7. ตรวจ global fall banner
8. ตรวจ EventLog
9. ตรวจ Console
10. กลับเข้ากล้องและยืนยัน overlay/status recover

### Expected result

- แม้มี rapid drop ก่อนหน้า แต่เพราะคนยังถูกเห็นต่อเกิน `disappearGraceMs = 2.5 s`, เมื่อ track ถูกลบภายหลังต้อง **ไม่มี** `fall_suspected_left_frame`
- ไม่มี global banner ชนิด “สงสัยว่า ... แล้วหายไปจากมุมกล้อง”
- EventLog ต้องไม่มี row ประเภท `สงสัยหกล้ม — หายไปจากเฟรมกะทันหันหลังร่วงตัวเร็ว` จาก scenario นี้
- overlay/status recover หลังกลับมา
- Console ไม่มี runtime error

### PASS

ผ่านเมื่อไม่มี left-frame alert หลัง “rapid drop → ยังเห็นต่อ > 2.5 s → ค่อยออกจากเฟรม”

### FAIL

ถือว่า fail ถ้า:

- tracker ลบแล้วเกิด left-frame alert ทั้งที่ pose ยังเห็นคนต่อเกิน grace หลัง rapid drop
- EventLog เพิ่ม left-frame row
- UI/pose loop ค้างหรือ Console มี runtime error

> ถ้าเกิด `fall_detected` เพราะท่าที่ใช้ทำให้ลำตัวราบเกิน 55° ให้รอบนั้นเป็น **INVALID RUN** สำหรับ Scenario 2 แล้วเริ่มใหม่โดยย่อตัวแบบลำตัวตั้งตรงกว่าเดิม เพราะ Scenario 2 ต้องแยก left-frame timing ออกจาก in-frame fall path

---

## Scenario 3 — เดินออกจากเฟรมตามปกติต้องไม่แจ้ง left-frame fall

**เป้าหมาย:** กัน false positive ว่า track ที่ออกจากภาพตามปกติจะไม่ถูกตีความเป็นหกล้มเมื่อไม่มี rapid-drop signal

### เตรียมก่อนเริ่ม

1. reload หน้าและใช้ fall default
2. ยืนตรงกลางเฟรม status = 1 คนต่อเนื่อง 5 วินาที
3. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. ยืนตัวตรง 2 วินาที
2. เดินออกจากเฟรมทางซ้ายหรือขวาแบบปกติ ใช้เวลาประมาณ **2–3 วินาที**
3. ระหว่างออก พยายามรักษาระดับไหล่ ไม่ย่อเข่าหรือก้มลงเร็ว
4. อยู่นอกเฟรมอย่างน้อย **5 วินาที**
5. รอ status ลงเป็น 0 คน
6. ตรวจว่าด้านบนแอปไม่มี left-frame fall banner
7. ตรวจ EventLog ว่าไม่มี left-frame row ใหม่
8. ตรวจ Console
9. กลับเข้ากล้องและยืนยัน skeleton/status กลับมา

### Expected result

- การออกจากเฟรมปกติไม่สร้าง `fall_suspected_left_frame`
- ไม่มี left-frame banner
- ไม่มี left-frame EventLog row
- กลับเข้ากล้องแล้ว pose ทำงานต่อ
- Console ไม่มี runtime error

### PASS

ผ่านเมื่อเดินออกปกติแล้วไม่มี fall-left-frame event

### FAIL

ถือว่า fail ถ้ามี left-frame banner/EventLog ทั้งที่ไม่ได้เกิด rapid downward movement

---

## Scenario 4 — Regression: `fall_detected` ขณะยังอยู่ในเฟรมต้องยังทำงาน

**เป้าหมาย:** Ticket 06 เปลี่ยน state ของ fall tracking จึงต้องเช็กว่าเส้นทางเดิม “ร่วงตัวเร็ว + ลำตัวเอียงใกล้แนวนอนขณะยังเห็นตัว” ยังยิง `fall_detected` ได้

Scenario นี้ **ห้ามล้มจริง** และไม่ใช้ตัดสินความแม่นยำของค่า default จึงลด threshold ชั่วคราวตามตาราง Scenario 4

### เตรียมก่อนเริ่ม

1. reload หน้า
2. ตั้ง fall thresholds สำหรับ Scenario 4:
   - drop ratio = 0.10
   - drop window = 1500 ms
   - torso angle = 30°
   - cooldown = 15 s
   - disappear grace = 2.5 s
3. จัดกล้องให้เห็นศีรษะ ไหล่ และสะโพกตลอดการเคลื่อนไหว
4. ถ้ามีเก้าอี้ ใช้เก้าอี้มั่นคงและไม่มีล้อ หรือยืนบนพื้นโล่ง; ห้ามทิ้งตัว
5. status = 1 คนต่อเนื่อง 5 วินาที
6. Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. เริ่มจากยืน/นั่งตัวตรง
2. ทำ movement แบบควบคุม: **ย่อตัวลงพร้อมโน้มลำตัวประมาณ 30–45° อย่างรวดเร็ว** ภายในประมาณ 1 วินาที แต่ยังอยู่ในเฟรมครบทั้งไหล่และสะโพก
3. ค้างท่านั้น 1–2 วินาที
4. ต้องมี global fall banner ใจความ:
   `ตรวจพบว่า คนที่ ... อาจหกล้มหรือตกจากเก้าอี้ — กรุณาตรวจสอบด่วน!`
5. ตรวจ EventLog ต้องเพิ่ม row:
   - หมวด `การหกล้ม`
   - ประเภท `ตรวจพบการหกล้ม/ตกจากเก้าอี้`
   - metrics ควรมี `dropRatio` และ `torsoAngleDeg`
6. กด `รับทราบ`
7. กลับท่าตรง
8. ภายใน **15 วินาที** ให้ทำ movement แบบเดิมซ้ำอีกหนึ่งครั้งโดยยังเป็น track เดิม
9. ต้องไม่เกิด `fall_detected` ซ้ำก่อน cooldown หมด
10. ตรวจว่าไม่มี left-frame alert เพราะผู้ทดสอบไม่เคยหลุดเฟรม
11. ตรวจ Console
12. เมื่อจบ scenario ให้ reload เพื่อคืน fall thresholds เป็น default

### Expected result

- `fall_detected` เดิมยังเกิดได้
- event type ใน EventLog ถูกต้องและมี metrics
- ไม่เกิด left-frame alert เพราะคนยังอยู่ในเฟรม
- cooldown ป้องกันการยิง in-frame fall ซ้ำถี่จากคนเดิม
- Console ไม่มี runtime error

### PASS

ผ่านเมื่อ in-frame `fall_detected` ยังทำงานและไม่ถูกสับสนกับ `fall_suspected_left_frame`

### FAIL

ถือว่า fail ถ้า:

- movement ที่สร้าง rapid drop + torso angle ตาม threshold แล้วไม่มี `fall_detected`
- เกิด left-frame eventทั้งที่ไม่เคยออกจากเฟรม
- alert spam ซ้ำภายใน cooldown จาก track เดิม
- Console มี runtime error

> ถ้าทำ movement แบบปลอดภัยแล้วยังไม่สามารถสร้าง `fall_detected` ได้ ให้บันทึก **BLOCKED — safe manual stimulus could not reliably trigger detector** แทนการทำท่าที่เสี่ยงล้มจริง ห้ามเพิ่มความเสี่ยงเพื่อให้ scenario ผ่าน

---

## Regression scenarios ที่ automated test อย่างเดียวไม่พอ

| Regression | วิธีที่ smoke นี้จับ |
|---|---|
| แก้ predicate ถูกแต่ไม่ได้ update `PersonState.lastSeenAt` ใน rAF loop จริง | Scenario 2 rapid drop แล้วอยู่ในเฟรมต่อ > grace ต้องไม่ false-positive |
| predicate ถูกแต่ browser flow ตอน tracker ลบ track ไม่ยิง callback | Scenario 1 ต้องเห็น global fall banner + EventLog |
| event ถูกสร้างแต่ UI wiring ไป `handleFallDetected` พัง | Scenario 1/4 ตรวจข้อความ banner จริงและปุ่ม `รับทราบ` |
| event ถูกส่งเข้า log ผิด type/category | Scenario 1/4 ตรวจ EventLog หมวด/ประเภท |
| track cleanup ทำ pose loop ค้างหลังคนหาย | Scenario 1–3 กลับเข้ากล้องแล้ว skeleton + status ต้อง recover |
| left-frame event ถูกยิงซ้ำจาก track เดียว | Scenario 1 อยู่นอกเฟรมเพิ่ม 5 วินาทีแล้ว EventLog ต้องยังเพิ่มเพียง 1 row |
| `fall_detected` เดิมพังหลังเพิ่ม `lastSeenAt` | Scenario 4 สร้าง in-frame fall stimulus แบบปลอดภัย |
| normal exit ถูกตีความเป็น fall | Scenario 3 เดินออกด้านข้างช้า ๆ ต้องไม่มี event |
| rAF/pose UI เกิด freeze ระหว่าง track remove/recreate | ทุก scenario ตรวจ overlay/status/Console หลังกลับเข้ากล้อง |

### Regression ที่ **ไม่** บังคับใน Ticket 06

- ไม่ต้องสลับกล้อง/สลับ source เพื่อหา stale skeleton — Ticket 04
- ไม่ต้องใช้ webcam 2 ตัว — Ticket 06 ไม่มี per-camera requirement
- ไม่ต้องวัด FPS หรือ inference ms — Tickets 10/11 และ Ticket 17
- ไม่ต้องทดสอบ identity/face backend
- ไม่ต้องทำ repeated fall trials จำนวนมากเพื่อวัด accuracy — Ticket 17/HITL

## กรณีที่ไม่ควรบังคับพิสูจน์ด้วยมือ

บาง boundary เป็นระดับ millisecond หรือ pure logic จึงให้ Vitest เป็นหลักฐานแทน ไม่ควรให้ผู้ทดสอบพยายามจับเวลาให้ตรงเฟรม

### 1. exact boundary `lastSeenAt - lastRapidDropAt === 2500 ms`

พิสูจน์ด้วย:

- ไฟล์: `src/lib/fallDetection.test.ts`
- test: **`alerts when the last sighting is exactly at the disappear grace boundary after a rapid drop`**

เหตุผล: คนทดสอบและ browser scheduling ไม่สามารถยืนยัน exact 2500 ms ได้อย่างเชื่อถือได้

### 2. เกิน grace เพียง 1 ms ต้องไม่ alert

พิสูจน์ด้วย:

- ไฟล์: `src/lib/fallDetection.test.ts`
- test: **`does not alert when the person remained visible beyond the disappear grace window`**

Manual Scenario 2 พิสูจน์ wiring ด้วย margin หลายร้อย millisecond/วินาที ไม่ต้องพยายามสร้าง 2501 ms จริง

### 3. ไม่มี rapid drop ต้องไม่ alert

พิสูจน์ระดับ predicate ด้วย:

- ไฟล์: `src/lib/fallDetection.test.ts`
- test: **`does not alert when no rapid drop was recorded before the person left frame`**

Manual Scenario 3 ยืนยัน integration กับ tracker เพิ่มเติม

### 4. คณิตศาสตร์ของ drop ratio

พิสูจน์ด้วย:

- ไฟล์: `src/lib/fallDetection.test.ts`
- test: **`reports a 0.30 downward drop from y=0.40 to y=0.70`**
- test: **`does not count upward movement as a drop`**
- test: **`returns null when there is only one torso reading`**

ไม่ควรพยายามวัด normalized Y ด้วยสายตาจากกล้องจริง

### 5. pruning history exact time window

พิสูจน์ด้วย:

- ไฟล์: `src/lib/fallDetection.test.ts`
- test: **`removes readings older than the configured time window`**

browser smoke มีไว้พิสูจน์ integration ไม่ใช่ timestamp boundary ภายใน array

### 6. timing ที่ `t = 0`

ไม่ต้องทำ manual สำหรับ Ticket 06 เพราะ fall flow ใน `CameraStage` ใช้ `Date.now()` เป็น timestamp ของ `lastRapidDropAt` / `lastSeenAt`; regression เรื่องเวลาศูนย์ของ state machine เป็น scope Ticket 01 และถูกพิสูจน์ด้วย `src/lib/sustainedAlertMachine.test.ts` แล้ว

## เกณฑ์สรุปรวมของ Ticket 06

Ticket 06 manual browser smoke = **PASS** เมื่อ:

- Scenario 1, 2 และ 3 ผ่านทั้งหมด
- Scenario 4 ผ่าน หรือถูกบันทึกเป็น BLOCKED เพราะไม่สามารถสร้าง stimulus ได้อย่างปลอดภัย โดยไม่มีหลักฐานว่าโค้ด runtime พัง
- ไม่มี runtime/React/pose/fall error ใหม่ใน Console จาก flow ของ Ticket 06
- ไม่ใช้ backend/identity เป็นเงื่อนไขในการทำ smoke นี้

ถ้า Scenario 1 ทำไม่ได้เพราะ framing ไม่สามารถเห็น rapid drop ก่อนคนหลุดเฟรม ให้บันทึก **BLOCKED — camera framing cannot capture rapid drop before exit** ไม่ให้นับเป็น PASS และอย่าใช้การล้มจริงเพื่อบังคับให้ detector ทำงาน

## ตารางสรุปผล

| Scenario | ผล (PASS / FAIL / BLOCKED / INVALID / NOT RUN) | วันที่ทดสอบ | Browser / OS | กล้องที่ใช้ | Vite URL | EventLog / Console / หมายเหตุ |
|---|---|---|---|---|---|---|
| 1 — rapid drop → หลุดเฟรม → left-frame alert ด้วย default | NOT RUN |  |  |  |  |  |
| 2 — rapid drop แต่ยังเห็น > 2.5 s → ไม่ false-positive | NOT RUN |  |  |  |  |  |
| 3 — เดินออกปกติ → ไม่ left-frame alert | NOT RUN |  |  |  |  |  |
| 4 — regression `fall_detected` ยังทำงาน | NOT RUN |  |  |  |  |  |
| **สรุป Ticket 06** | **NOT RUN** |  |  |  |  |  |

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
- Face features: ปิด
- Sound: ปิด
- Scenario 1–3 fall settings: drop ratio 0.20, window 700 ms, torso angle 55°, cooldown 15 s, disappear grace 2.5 s
- Scenario 4 fall settings: drop ratio 0.10, window 1500 ms, torso angle 30°, cooldown 15 s, disappear grace 2.5 s
- Console error ที่พบ (ถ้ามี):
- มี `localhost:4000/api/employees` network error จาก backend ที่ไม่ได้รันหรือไม่:
- หมายเหตุเพิ่มเติม:
