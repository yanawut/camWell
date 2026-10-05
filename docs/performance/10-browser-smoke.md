# 10: Manual browser smoke — จำกัด Pose ~12 ครั้ง/วินาที

เอกสารนี้ใช้ยืนยัน browser integration ของ performance Ticket 10 หลัง code review และ automated verification ผ่านแล้ว โดยครอบเฉพาะ requirement ของ Ticket 10: Pose pipeline ต้องมี time throttle ประมาณ 12 ครั้ง/วินาทีสำหรับทั้งกล้องในเครื่องและ IP MJPEG, กล้องในเครื่องยังต้องเช็คเฟรมใหม่ด้วย `video.currentTime`, skipped rAF ticks ต้องยังวาดผล pose ล่าสุดจาก Ticket 04 โดยไม่ทำให้ skeleton กระพริบ และการเพิ่ม throttle ต้องไม่ทำให้ detection loop, status, alert หรือ EventLog พัง

smoke นี้ **ไม่ใช่** HITL/performance campaign ของ Ticket 17 จึงไม่ทำ long-run benchmark, ไม่เปรียบเทียบหลายเครื่อง/หลาย GPU, ไม่วัด precision/recall, ไม่บังคับทดสอบ 2 กล้อง, ไม่จูน threshold และไม่ใช้ inference-ms display ของ Ticket 11

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Browser smoke ของ Ticket 10 เน้นสิ่งที่ pure unit test มองไม่เห็น:

- local webcam ต้องยังแสดงภาพสดและ skeleton ต่อเนื่องหลังเพิ่ม throttle
- skeleton ต้องไม่กลับมากระพริบ/หายสลับใน rAF ticks ที่ไม่ได้รัน pose
- การเคลื่อนไหวจริงต้องยังถูกตามทันในระดับใช้งานได้ แม้ pose update จะไม่ถี่เท่า video frame
- status line / alert banner / EventLog ต้องยังทำงานตามเดิม และ throttle เองต้องไม่สร้าง event
- source switch ต้องไม่ทำให้ cached skeleton เก่าค้างหรือทำให้ loop หยุดหลังกลับมา local
- ถ้ามี IP MJPEG ที่ browser อ่านพิกเซลได้จริง ต้องยืนยันว่า stream ยังมี skeleton ต่อเนื่องและ UI ไม่ freeze หลังมี throttle
- Console ต้องไม่มี runtime/React/MediaPipe/canvas error ใหม่จากการทำงานของ Ticket 10

สิ่งที่ **ไม่ใช่ scope ของ Ticket 10**:

- แสดงตัวเลข inference ms — Ticket 11
- benchmark CPU/GPU แบบเทียบหลายเครื่อง, endurance, 1 vs 2 กล้อง หรือสรุป performance เชิงสถิติ — Ticket 17
- ทดสอบความแม่นยำของ posture/upper-body/fall detection — Tickets 06–08 / 17
- ทดสอบ Workstation/Multi แบบเต็ม — Ticket 09
- ทดสอบ skeleton cache/source switching แบบครบทุก edge case — Ticket 04; Ticket 10 ทำเฉพาะ regression ที่เกี่ยวกับ skipped ticks จาก throttle

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง **ไม่ใช้ WSL**

Environment ที่ตรวจจาก workspace ตอนเขียน smoke นี้:

| รายการ | ค่า |
|---|---|
| Node | `v26.1.0` |
| npm | `12.0.2` |
| Browser | Google Chrome desktop |
| Webcam | **1 ตัวก็เพียงพอ**; Ticket 10 ไม่ได้ require multi-camera |
| IP camera | ไม่จำเป็นสำหรับ required local smoke; Scenario 3 ใช้เมื่อมี MJPEG URL ที่ Chrome อ่านพิกเซลได้และผ่าน CORS |
| Backend | **ไม่ต้องรัน `backend/`** เพราะ smoke นี้ปิด face features และไม่ใช้ identity |

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

ทุก required scenario ของ Ticket 10 เป็น pose-only ให้ **ไม่ต้องรัน `backend/`**

เพื่อไม่ให้ request ของ face/identity รบกวน Console ให้ตั้ง **เปิดฟีเจอร์เกี่ยวกับใบหน้า = ปิด**

ถ้ามี startup error เก่าจาก request ที่เกิดก่อนเปลี่ยน setting ให้รอหน้าและ pose model พร้อม จากนั้นกด **Clear Console** ก่อนเริ่ม scenario และพิจารณาเฉพาะ error ที่เกิดหลัง Clear

### SettingsPanel ที่ใช้

ตั้งค่าก่อนเริ่มทุก scenario ดังนี้:

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | **ปิด** |
| โหมดการตรวจจับ | **ใช้คนเดียว (Personal Workstation)** |
| มุมคอที่ยอมรับได้ | **45°** |
| มุมลำตัวที่ยอมรับได้ | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **30°** |
| นั่งท่าไม่ดีต่อเนื่องก่อนแจ้งเตือน | **30 s** |
| break reminder | คงค่าเดิม; required scenario สั้นกว่าช่วงเตือนพัก |
| fall thresholds | คงค่าเดิม และหลีกเลี่ยงการย่อตัว/ร่วงตัวเร็ว |

เหตุผลที่ตั้ง posture threshold สูงและ sustained 30 s คือให้สามารถขยับศีรษะ/ไหล่เพื่อดู overlay โดยไม่ให้ alert จากท่าทางมารบกวนผลของ throttle

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. เปิด Chrome desktop ที่ Vite URL
2. ตรวจ Site settings ของ origin ให้ **Camera = Allow**
3. เลือก **กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)** เว้นแต่ scenario ระบุให้ใช้ IP
4. ถ้ารายชื่อกล้องไม่ครบ ให้กด **รีเฟรชรายชื่อกล้อง**
5. ปิดโปรแกรมอื่นที่อาจจับ webcam อยู่ เช่น Zoom / Teams / OBS
6. จัดกล้องด้านหน้าหรือเฉียงหน้าเล็กน้อย ให้เห็นศีรษะ ไหล่ และช่วงตัวชัด; ระยะประมาณ **0.7–1.5 เมตร**
7. ใช้แสงสม่ำเสมอจากด้านหน้าหรือด้านข้าง หลีกเลี่ยงย้อนแสงแรง
8. เปิด DevTools → **Console**
9. รอ banner `กำลังโหลดโมเดล Pose Landmarker...` หาย และ skeleton เริ่มติดตาม
10. หลัง startup/model load เสร็จ กด **Clear Console**
11. จดจำนวน row ใน EventLog ก่อนเริ่ม scenario
12. ก่อนตัดสิน overlay ให้รอ tracking settle ประมาณ **3–5 วินาที**
13. ระหว่าง scenario อย่าสลับ tab ไป background เพราะ browser อาจลดความถี่ rAF และทำให้สังเกต performance ผิด
14. ถ้าเกิด alert จากท่าทางโดยไม่ได้ตั้งใจ ให้กลับมานั่งตรง รอ alert จบ แล้ว Clear Console/จด EventLog ใหม่ก่อน rerun scenario

---

## Scenario 1 — Local webcam: throttle ต้องไม่ทำให้ skeleton กระพริบหรือ UI สะดุด

**เป้าหมาย:** พิสูจน์ browser integration หลักของ Ticket 10 สำหรับ local `<video>`: เมื่อ pose ถูกจำกัดประมาณ 12 ครั้ง/วินาทีแล้ว skipped rAF ticks ยังวาด cached pose ล่าสุด ทำให้ overlay ต่อเนื่องและระบบใช้งานได้จริง

### เตรียมก่อนเริ่ม

1. ใช้ camera slot เดียว
2. เลือก local webcam
3. Settings ตามตารางด้านบน
4. นั่งกลางเฟรมให้เห็นศีรษะและไหล่ชัด
5. รอ skeleton ชัดต่อเนื่อง **5 วินาที**
6. Clear Console
7. จด EventLog row count และข้อความ status line ก่อนเริ่ม

### ขั้นตอนบน browser

1. นั่งนิ่งในท่าปกติ **5 วินาที**
2. มอง skeleton ตรงไหล่ แขน และศีรษะตลอดช่วง; สังเกตว่ามีการ “หายทั้งโครงแล้วกลับมา” เป็นจังหวะหรือไม่
3. ยกแขนข้างหนึ่งขึ้นช้า ๆ จนประมาณระดับไหล่ ใช้เวลา **2 วินาที**
4. ค้างแขนไว้ **2 วินาที**
5. ลดแขนลงช้า ๆ ใช้เวลา **2 วินาที**
6. หันศีรษะซ้าย → กลาง → ขวาอย่างช้า ๆ รวม **4 วินาที**
7. ขยับไหล่/ลำตัวซ้าย-ขวาเล็กน้อยต่ออีก **5 วินาที** โดยไม่ย่อตัวเร็ว
8. กลับมานั่งนิ่ง **5 วินาที**
9. ดู status line ใต้กล้อง
10. ดู alert banner และ EventLog
11. ตรวจ Console หลังจบ

### Expected result

**Video / overlay**

- วิดีโอยังเคลื่อนไหวลื่นตาม webcam; Ticket 10 ไม่ควรลด FPS ของ video element
- skeleton อาจอัปเดตเป็นจังหวะละเอียดน้อยกว่าวิดีโอ เพราะ pose ถูก throttle แต่ต้องยังตามแขน/ศีรษะ/ไหล่ได้ต่อเนื่องในระดับใช้งาน
- ระหว่างช่วงนิ่งและช่วงเคลื่อนไหว ต้องไม่มีอาการ skeleton **หายทั้งโครงแล้วกลับมาเป็นจังหวะซ้ำ ๆ**
- ต้องไม่มี blank overlay ทุก ๆ rAF tick ระหว่าง pose inference
- หลังหยุดขยับ skeleton ต้อง settle กลับมาตรงตำแหน่งปัจจุบัน ไม่ freeze อยู่ที่ท่าก่อนหน้า

**Status line**

- ควรอยู่ในรูป `ตรวจพบในเฟรม: 1 คน (รองรับสูงสุด 1 คน)` เมื่อ tracking settle
- count อาจเปลี่ยนชั่วคราวถ้า pose หลุดจากแสง/การบังตัว แต่ต้องกลับมาตรวจพบโดยไม่ต้อง reload หน้า
- Ticket 10 ยัง **ไม่มี** FPS หรือ inference-ms counter ใน status line; อย่าถือว่าไม่มีตัวเลขเหล่านี้เป็น FAIL

**Alert / EventLog**

- throttle หรือการขยับเบา ๆ ตามขั้นตอนต้องไม่สร้าง alert/EventLog ใหม่ด้วยตัวมันเอง
- ถ้า posture จริงเข้า threshold จนครบ sustained time ให้ถือว่าเป็น alert ของฟีเจอร์ posture ไม่ใช่หลักฐานว่า throttle fail; แนะนำ rerun ด้วย threshold ตามที่กำหนด

**Console**

- ไม่มี red uncaught exception
- ไม่มี React error
- ไม่มี MediaPipe error จาก `detectForVideo`
- ไม่มี canvas error
- ไม่มี error loop ซ้ำ ๆ หลังเริ่ม throttle

### PASS

ผ่านเมื่อ local webcam ทำงานต่อเนื่องครบ scenario, skeleton ไม่เกิด visible flicker แบบหาย-กลับซ้ำ ๆ, การเคลื่อนไหวถูกตามได้, status ไม่ค้างถาวร, ไม่มี alert/event ที่เกิดจาก throttle และ Console สะอาด

### FAIL

ถือว่า fail ถ้าเกิดอย่างใดอย่างหนึ่ง:

- skeleton กระพริบชัดเจนแบบทั้งโครงหาย/กลับเป็นจังหวะระหว่างที่คนยังอยู่ในเฟรม
- overlay freeze หลายวินาทีทั้งที่ video ยังสดและคนขยับ
- status count ค้างผิดและไม่ฟื้นหลังรอ 5 วินาที
- throttle ทำให้ UI หน่วงจนกด Settings/เลื่อนหน้าไม่ได้ตามปกติ
- detection loop หยุดจนต้อง reload
- Console มี runtime/MediaPipe/canvas error ใหม่ที่สัมพันธ์กับขั้นตอนนี้

---

## Scenario 2 — Regression: สลับ local → IP ที่ยังไม่พร้อม → local แล้ว cache ต้องไม่กลายเป็น ghost/freeze

**เป้าหมาย:** Ticket 10 เพิ่ม skipped ticks จำนวนมากกว่าก่อน จึงต้องยืนยัน regression จาก Ticket 04 ว่า cached pose ที่ใช้วาดระหว่าง skipped ticks ไม่ทำให้ skeleton เก่าค้างตอน source เปลี่ยน และกลับ local แล้ว loop ยังเริ่ม inference ใหม่ได้

Scenario นี้ตั้งใจใช้ IP mode **โดยไม่กรอก URL** เพื่อสร้าง source ที่ไม่พร้อมแบบ deterministic จึงไม่ต้องมี IP camera จริงและไม่เจอ CORS

### เตรียมก่อนเริ่ม

1. เริ่มจาก local webcam
2. ให้ skeleton ติดตามชัด **5 วินาที**
3. ถ้า draft IP URL มีค่าค้าง ให้ล้างช่องก่อนเริ่ม
4. Clear Console
5. จด EventLog row count

### ขั้นตอนบน browser

1. ขยับแขนเบา ๆ ให้เห็นแน่ชัดว่า local skeleton เป็นผลสด
2. ในส่วนแหล่งภาพกล้อง เลือก radio **กล้องเครือข่าย (IP Camera — สตรีม MJPEG ผ่าน HTTP)**
3. **อย่ากรอก URL และอย่ากดเชื่อมต่อ**
4. มอง canvas ทันทีบริเวณที่ skeleton เก่าเคยอยู่
5. รอ **5 วินาที**
6. ยืนยันข้อความ UI ที่บอกให้กรอก URL IP
7. กลับไปเลือก **กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)**
8. ถ้าต้องเลือก device ให้เลือก webcam เดิม
9. รอภาพ local กลับมา แล้วรอ pose อีกสูงสุด **5 วินาที**
10. ยกแขนขึ้น-ลงหนึ่งรอบช้า ๆ ประมาณ **4 วินาที**
11. รออีก **5 วินาที**
12. ดู status line, alert/EventLog และ Console

### Expected result

**ตอน local → IP(empty)**

- skeleton local เก่าต้องถูกล้างจาก canvas เมื่อ source เปลี่ยน
- ใน 5 วินาทีที่ IP source ไม่มีภาพ ต้องไม่มี ghost skeleton ค้างจาก local
- ควรเห็นข้อความประมาณ `กรอก URL กล้อง IP แล้วกด "เชื่อมต่อ"...`
- people count อาจยังค้างชั่วคราวจาก tracker stale timeout; ไม่ใช้ count ที่ต้องเป็น 0 ทันทีเป็น acceptance criterion

**ตอน IP(empty) → local**

- local video ต้องกลับมา
- skeleton ใหม่ต้องปรากฏจาก inference ใหม่และตามแขนที่ขยับ
- ต้องไม่ใช้ ghost pose จาก source ก่อนหน้าเป็นเวลาหลายวินาที
- หลังกลับมาแล้ว skeleton ต้องยังไม่กระพริบ แม้ pose มี throttle
- status line ต้องฟื้นตาม tracking โดยไม่ reload หน้า
- source switch อย่างเดียวไม่ควรสร้าง EventLog ใหม่
- Console ไม่มี runtime/React/MediaPipe/canvas error

### PASS

ผ่านเมื่อ source switch ล้าง overlay เก่า, กลับ local แล้ว pose pipeline ฟื้นเอง, cached result ไม่กลายเป็น ghost/freeze และไม่มี error

### FAIL

ถือว่า fail ถ้า:

- skeleton local ค้างอยู่บน IP(empty)
- กลับ local แล้ว skeleton ไม่กลับทั้งที่ภาพพร้อมและเห็นคนชัด
- skeleton กลับมาแต่กระพริบเป็นจังหวะ
- detection loop หยุดหลัง source switch
- Console มี error จาก source/throttle/cache integration

---

## Scenario 3 — IP MJPEG end-to-end: throttle ต้องไม่ทำให้ stream/overlay freeze

**สถานะ:** Conditional — ทำเมื่อมี IP camera/MJPEG URL ที่ Chrome แสดงภาพได้ **และ canvas/MediaPipe อ่านพิกเซลได้จริงโดยไม่ติด CORS**

ถ้าไม่มีอุปกรณ์/URL ดังกล่าว ให้บันทึก `N/A — ไม่มี CORS-compatible MJPEG source` ไม่ถือเป็น product FAIL และให้ใช้ automated tests ด้านล่างเป็นหลักฐานของ IP rate-limit logic

**เป้าหมาย:** พิสูจน์ browser path ที่เป็นเหตุผลหลักของ Ticket 10: `<img>` MJPEG ไม่มี `currentTime` จึงต้องพึ่ง time throttle แต่ overlay ต้องยังต่อเนื่อง

### เตรียมก่อนเริ่ม

1. เตรียม MJPEG URL ที่ใช้งานได้จาก Chrome เครื่องเดียวกัน
2. ทดสอบว่า stream ไม่ติด authentication popup ที่จะรบกวน scenario
3. ใน Settings ปิด face features และ sound
4. เปิด DevTools Console
5. ในแหล่งภาพ เลือก IP Camera, กรอก URL แล้วกด **เชื่อมต่อ**
6. รอภาพ MJPEG แสดง
7. ถ้าเกิด CORS/SecurityError จน pose ใช้งานไม่ได้ ให้หยุด Scenario 3 และบันทึก `N/A — stream แสดงภาพได้แต่ browser ไม่อนุญาต AI อ่านพิกเซล`; นี่เป็น environment limitation ที่มีอยู่เดิม ไม่ใช่ FAIL ของ throttle
8. ถ้า skeleton ขึ้นปกติ ให้ Clear Console และจด EventLog count

### ขั้นตอนบน browser

1. นั่งนิ่งกลางภาพ **5 วินาที**
2. ยกแขนช้า ๆ ขึ้นและลงรวม **5 วินาที**
3. หันตัวหรือไหล่ซ้าย-ขวาเบา ๆ **5 วินาที**
4. นั่งนิ่งอีก **10 วินาที**
5. ระหว่างทั้งหมดสังเกต video/image stream และ skeleton
6. เปิด Chrome Task Manager ได้เพื่อจด CPU ของ tab เป็นข้อมูลประกอบ แต่ **ไม่ตั้งเลข CPU เป็น PASS/FAIL** เพราะขึ้นกับเครื่อง/กล้อง/codec
7. กลับมาดู status line, EventLog และ Console

### Expected result

- MJPEG image ยัง refresh ต่อเนื่องตามกล้อง
- skeleton ยังตามการเคลื่อนไหวและไม่หาย-กลับทุก rAF tick
- ไม่มี freeze ยาวหลายวินาทีจากการเพิ่ม throttle
- status line ยังอัปเดตตามคนในเฟรม
- ไม่มี alert/EventLog ใหม่เพียงเพราะใช้ IP source/throttle
- Console ไม่มี repeated error จาก pose loop
- CPU สามารถจดเป็น observational data ได้ แต่ไม่ควรสรุป PASS/FAIL จากตัวเลขครั้งเดียว
- ไม่ต้องเห็น “12 FPS” บน UI เพราะ Ticket 10 ไม่มี FPS counter

### PASS

ถ้ามี compatible IP source ให้ผ่านเมื่อ stream + overlay ทำงานต่อเนื่องอย่างน้อย 25 วินาทีตามขั้นตอน ไม่มี visible flicker/freeze และไม่มี runtime error

### FAIL

ถือว่า fail เมื่อ stream เองยังสด แต่:

- skeleton หาย/กลับเป็นจังหวะอย่างต่อเนื่อง
- pose overlay freeze ถาวรหรือหลายวินาทีซ้ำ ๆ
- UI freeze อย่างเห็นได้ชัด
- status ไม่ฟื้น
- Console มี runtime/MediaPipe error ใหม่จาก pose loop

ถ้า browser ปฏิเสธพิกเซลเพราะ CORS ให้บันทึก N/A ไม่ใช่ FAIL

---

## Scenario 4 — UI responsiveness ระหว่าง pose ทำงานต่อเนื่อง

**เป้าหมาย:** ตรวจ regression เชิง performance แบบ smoke โดยไม่ทำ benchmark: throttle ใหม่ต้องไม่ทำให้หน้าเว็บติดขัดหรือ control ใช้งานไม่ได้ขณะ pose loop ทำงาน

### เตรียมก่อนเริ่ม

1. ใช้ local webcam
2. skeleton พร้อมและตรวจพบ 1 คน
3. Settings ตามค่าที่กำหนด
4. Clear Console

### ขั้นตอนบน browser

1. ปล่อยกล้องทำงานต่อเนื่อง **20 วินาที**
2. ระหว่างนั้นเลื่อนหน้า Settings ขึ้น/ลงช้า ๆ 2–3 รอบ
3. เปิด/ปิดส่วน Settings ที่กดได้ตาม UI ปัจจุบัน โดย **อย่าเปลี่ยน Detection Mode หรือ face features**
4. ขยับศีรษะหรือแขนเป็นช่วง ๆ เพื่อให้ pose มีงานจริง
5. กลับมาดู overlay ทุก 5 วินาที
6. หลังครบ 20 วินาที ตรวจ status, EventLog และ Console

### Expected result

- scrolling/clicking ยังตอบสนองตามปกติ ไม่มี UI ค้างยาว
- video ไม่หยุด
- skeleton ยังอัปเดตและไม่ flicker
- status line ยังมีค่าปัจจุบัน
- ไม่มี alert/EventLog จาก throttle
- Console ไม่มี error

### PASS / FAIL

PASS เมื่อ UI ยัง responsive และ pose pipeline ทำงานต่อเนื่องตลอด 20 วินาที

FAIL ถ้า UI freeze, video/overlay หยุดถาวร, detection loop ไม่ฟื้น หรือมี runtime error

---

## สิ่งที่ทำด้วยมือไม่ได้หรือไม่ควรบังคับทำ — ใช้ Vitest พิสูจน์แทน

### Exact timing `1000 / 12` และ boundary ของ `>=`

ไม่ควรให้คนใช้ stopwatch หรือนับ skeleton frame เพื่อพิสูจน์ช่วงประมาณ 83.33 ms เพราะ rAF cadence, webcam FPS, browser scheduling และเวลาของ MediaPipe แตกต่างตามเครื่อง การมองด้วยตาไม่สามารถยืนยัน exact boundary ได้

พิสูจน์ด้วยไฟล์ `src/lib/poseThrottle.test.ts`:

- `throttles IP camera ticks until the pose interval elapses` — ยืนยันว่า IP tick ก่อนครบ `POSE_INTERVAL_MS` ถูกข้าม และเมื่อครบ interval จึงอนุญาตให้รัน
- `throttles local video even when a new frame is available` — regression test จาก code review ยืนยันว่า local video ที่มีเฟรมใหม่ก็ยังต้องผ่าน 12-FPS throttle

### New-frame guard ของ `<video>`

ไม่ควรพยายามหยุด webcam ให้อยู่ `currentTime` เดิมแบบ deterministic ผ่าน UI หรือ breakpoint เพราะการ pause debugger จะเปลี่ยน timing ของ rAF เอง

พิสูจน์ด้วย `src/lib/poseThrottle.test.ts`:

- `keeps the video new-frame check in addition to the throttle` — เมื่อ `videoCurrentTime === lastVideoTime` ต้องไม่รัน แม้ interval ครบแล้ว และเมื่อ currentTime เปลี่ยนจึงรันได้

### ไม่มี landmarker / sticky source error

การบังคับให้ MediaPipe อยู่ใน intermediate state หรือสร้าง CORS SecurityError ซ้ำเพื่อพิสูจน์ boolean guard ไม่ควรเป็น required manual smoke เพราะ environment-dependent และทำให้ Console ตั้งใจแดง

พิสูจน์ด้วย `src/lib/poseThrottle.test.ts`:

- `does not process without a landmarker or after a sticky source error`

### Skipped tick ต้องเก็บ pose ล่าสุด

ผู้ทดสอบต้องดูด้วยตาว่า overlay ไม่กระพริบใน Scenario 1 แต่ไม่ต้องพยายามพิสูจน์ว่า rAF tick ไหนไม่มี inference

pure cache behavior พิสูจน์ด้วย `src/lib/poseResultCache.test.ts`:

- `keeps the latest pose result when an animation tick has no new pose result`
- `replaces the cached pose result when a new result arrives`
- `starts empty after the camera source changes`

Scenario 1–2 มีหน้าที่พิสูจน์ว่า pure behavior นี้ถูก wire เข้ากับ canvas จริงและไม่เกิด regression ที่มองเห็นได้

### `performance.now()` ใกล้ `t=0`

ไม่ควรพยายาม reload แล้วบังคับให้ inference เกิดที่ `performance.now() === 0` หรือจับค่า millisecond แรกด้วยมือ เพราะไม่ deterministic

test ของ throttle ใช้ `lastPoseRunAt: 0` และ interval boundary โดยตรงอยู่แล้ว จึงครอบกรณีค่าศูนย์ใน pure timing logic ได้ดีกว่า manual test

### State-machine timing / alert edge cases

อย่าบังคับทดสอบ `candidateSince = 0`, `goodSince = 0` หรือ sustained-alert edge cases ใน Ticket 10 เพราะเป็น scope Ticket 01 และมี Vitest ของ `src/lib/sustainedAlertMachine.test.ts` อยู่แล้ว การทดสอบซ้ำจะไม่ช่วยยืนยัน pose throttle

---

## เกณฑ์ PASS รวมของ Ticket 10 manual smoke

Required smoke ถือว่า **PASS** เมื่อ Scenario 1, 2 และ 4 ผ่านทั้งหมด:

1. local webcam ยังมี overlay ต่อเนื่องหลัง throttle และไม่มี visible skeleton flicker
2. skipped pose ticks ไม่ทำให้ canvas ว่างสลับไปมา
3. source switch ไม่ทิ้ง ghost skeleton และกลับ local แล้ว pose loop ฟื้นเอง
4. UI/status ยัง responsive ระหว่าง pose loop
5. throttle/source-switch ไม่สร้าง alert หรือ EventLog ใหม่ด้วยตัวมันเอง
6. Console สะอาดจาก runtime/React/MediaPipe/canvas errors ที่เกิดหลัง Clear

Scenario 3:

- ถ้ามี CORS-compatible MJPEG source → ควรทำและต้อง PASS
- ถ้าไม่มี → บันทึก N/A พร้อมเหตุผล ไม่ถือว่า required smoke FAIL เพราะ IP throttle predicate และ exact interval มี Vitest โดยตรง

### FAIL รวม

Ticket 10 manual smoke ถือว่า FAIL ถ้า required scenario ใด scenario หนึ่งพบ:

- skeleton flicker แบบทั้งโครงหาย-กลับซ้ำ ๆ
- overlay freeze ขณะ video ยังสด
- source switch แล้ว ghost skeleton ค้างหรือ pipeline ไม่ฟื้น
- UI freeze/ไม่ตอบสนองอย่างผิดปกติ
- runtime/React/MediaPipe/canvas error ใหม่
- alert/EventLog เกิดจาก throttle/source-switch โดยไม่มีเงื่อนไข feature อื่นจริง

ถ้า failure มาจาก camera permission, webcam ถูกโปรแกรมอื่นจับใช้อยู่, model assets ไม่ครบ, IP camera offline หรือ CORS ของ MJPEG source ให้แก้ environment หรือบันทึก N/A ตาม scenario ก่อนตัดสิน product FAIL

---

## สิ่งที่ต้องจดเมื่อ FAIL

เมื่อ scenario fail ให้จด scenario, เวลาที่เกิด, source ที่ใช้ (local/IP), webcam/IP camera รุ่นหรือ URL แบบไม่ต้องใส่ credential, ท่าที่กำลังทำ, overlay มีอาการ flicker/freeze/ghost แบบใด, status line ตอนเกิด, EventLog เปลี่ยนหรือไม่, Console error แบบเต็ม และถ้าอาการเกิดไม่ทุกครั้งให้จดจำนวนครั้ง เช่น “เกิด 2 จาก 5 รอบ”

ไม่ต้องทำ profiling campaign หรือเทียบ CPU หลาย configuration ใน Ticket นี้; การวัดเชิงลึกเป็น Ticket 17

---

## ตารางสรุปผล

กรอกหลังทดสอบจริง:

| Scenario | วันที่ทดสอบ | Browser / Version | OS | กล้องที่ใช้ | Dev URL | ผล | หมายเหตุ |
|---|---|---|---|---|---|---|---|
| 1 — Local throttle + skeleton ต่อเนื่อง |  |  |  |  |  | ☐ PASS / ☐ FAIL |  |
| 2 — local → IP(empty) → local cache regression |  |  |  |  |  | ☐ PASS / ☐ FAIL |  |
| 3 — IP MJPEG end-to-end |  |  |  |  |  | ☐ PASS / ☐ FAIL / ☐ N/A |  |
| 4 — UI responsiveness ระหว่าง pose loop |  |  |  |  |  | ☐ PASS / ☐ FAIL |  |

### สรุปรวม Ticket 10

- วันที่ทดสอบ: ____________________
- ผู้ทดสอบ: ____________________
- Chrome version: ____________________
- OS: ____________________
- Webcam / รุ่นกล้อง: ____________________
- IP MJPEG source (ถ้ามี): ____________________
- Vite URL: ____________________
- Required scenarios 1, 2, 4: ☐ PASS / ☐ FAIL
- Scenario 3 IP: ☐ PASS / ☐ FAIL / ☐ N/A
- Console สะอาดใน required scenarios: ☐ Yes / ☐ No
- **Manual browser smoke Ticket 10:** ☐ PASS / ☐ FAIL
- หมายเหตุเพิ่มเติม: ________________________________________________
