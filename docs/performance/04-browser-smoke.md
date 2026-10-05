# 04: Manual browser smoke — โครงร่าง (skeleton) ไม่กระพริบ

เอกสารนี้ใช้ยืนยันเฉพาะ browser integration ของ Ticket 04 หลัง code review และ automated verification ผ่านแล้ว ไม่ใช่ HITL รอบใหญ่ของ Ticket 17

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Ticket 04 ต้องทำให้ skeleton overlay:

- แสดงต่อเนื่องระหว่าง rAF tick ที่ไม่มีเฟรมวิดีโอใหม่ แทนที่จะหายวูบเพราะส่ง `null` เข้า `drawOverlay`
- ใช้ pose result ล่าสุดซ้ำจนกว่าจะมี pose result ใหม่
- ไม่ค้างเป็นภาพจากแหล่งกล้องเดิมเมื่อเปลี่ยน camera source

Manual smoke นี้จึงตรวจเฉพาะสิ่งที่ automated test อย่างเดียวพิสูจน์ไม่ได้ครบ:

- ภาพ skeleton จริงบน `<canvas>` ต้องไม่กระพริบแบบโผล่-หายสลับกันขณะใช้ local webcam
- skeleton ต้องติดตามการขยับต่อเนื่องใน browser จริง
- เมื่อเปลี่ยน source ต้องไม่มี pixels ของ skeleton จาก source เก่าค้างบน canvas แม้ source ใหม่ยังไม่พร้อม
- เมื่อกลับมาใช้ local webcam อีกครั้ง skeleton ต้องกลับมาจากผล pose ใหม่ตามปกติ
- status line / UI รอบกล้องยังทำงานต่อ และ Console ไม่มี runtime error จากการ cache/reset overlay

Regression สำคัญจาก code review ของ Ticket 04:

> แค่ตั้ง `latestPoseResultRef.current = null` ตอนเปลี่ยน source ยังไม่พอ ถ้า source ใหม่ยังไม่ ready แล้ว `detectFrame()` return ก่อนถึง `drawOverlay()` pixels ของ skeleton เก่าอาจยังค้างอยู่บน canvas ได้ จึงมีการแก้ให้ clear canvas ทันทีใน camera-source-changed block

Scenario 2 ด้านล่างถูกออกแบบให้จับ regression นี้โดยตรง

สิ่งที่ **ไม่ใช่ scope ของ Ticket 04** และไม่ใช้ smoke นี้ตัดสิน:

- ความแม่นยำของ posture classification / threshold — tickets ด้าน quality/calibration
- break timer — Ticket 05
- fall-left-frame — Ticket 06
- shoulder orientation / upper-body quality — Tickets 07–08
- Detection Mode / จำนวนคน — Ticket 09
- จำกัด pose เป็น ~12 FPS / วัด inference ms / CPU — Tickets 10–11
- smoothing / calibration — Tickets 12–13
- หลายปัญหาพร้อมกัน / dataset — Tickets 15–16
- endurance test, เปรียบเทียบ performance หลายกล้องพร้อมกัน หรือ HITL ครบระบบ — Ticket 17

---

## Prerequisites / config

ใช้ root workspace `camWell` บน Windows โดยตรง ไม่ใช้ WSL

Environment ที่ตรวจพบตอนทำ Ticket นี้:

- Node: `v24.21.0`
- npm: `11.19.0`
- Browser: **Google Chrome desktop**
- Webcam: required smoke ใช้อย่างน้อย **1 ตัว**
- ไม่ต้องมี 2 webcam เพราะ Ticket 04 ไม่ได้ทดสอบ multi-camera simultaneous; การเปลี่ยน source ที่เป็น regression หลักทดสอบได้ด้วย local webcam → IP Camera ที่ยังไม่มี URL
- ถ้ามี webcam 2 ตัวขึ้นไป สามารถทำ Optional Scenario 4 เพื่อเพิ่มความมั่นใจเรื่อง local device A → B

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

**ไม่ต้องรัน `backend/` สำหรับ smoke Ticket 04**

ทุก required scenario ใช้เฉพาะ Pose Landmarker + canvas overlay และตั้งให้ face features ปิด จึงไม่ใช้ face recognition / identity

ถ้าเปิด face features เองระหว่าง smoke แล้วทำให้มี request ไป backend ให้เริ่ม scenario ใหม่โดยปิด face features; อย่าใช้ backend error มาตัดสิน Ticket 04

### SettingsPanel ที่ต้องตั้ง

ก่อน Scenario 1–3 ให้ตั้งดังนี้เพื่อแยกการทดสอบ skeleton ออกจาก alert อื่นให้มากที่สุด:

| Setting | ค่า |
|---|---:|
| เปิดเสียงแจ้งเตือน | **ปิด** |
| เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition) | **ปิด** |
| มุมคอที่ยอมรับได้ (forward head) | **45°** |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | **35°** |
| มุมเอียงไหล่ที่ยอมรับได้ | **30°** |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | **30s** |

ค่า break / fall อื่นใช้ค่าเดิมได้ เพราะ smoke นี้จะนั่งนิ่งและขยับช้า ไม่ทดสอบ alert เหล่านั้น

เหตุผลที่ตั้ง posture threshold สูงและ sustained 30s คือไม่ต้องการให้ alert banner หรือ EventLog มารบกวนการสังเกต skeleton ภายใน scenario สั้น ๆ ของ Ticket นี้

---

## การเตรียมร่วมก่อนแต่ละ scenario

1. ใช้ Chrome desktop และเปิด Camwell จาก URL ของ Vite
2. เปิด DevTools → **Console**
3. ตรวจสิทธิ์ Camera ของ origin Vite ให้เป็น **Allow**
4. ใน `แหล่งภาพกล้อง` เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
5. ถ้ามี dropdown รายชื่อกล้อง ให้เลือก webcam ที่ต้องการใช้
6. ตั้ง SettingsPanel ตามตารางด้านบน โดยเฉพาะ face features = ปิด และ sound = ปิด
7. วางกล้องไว้ด้านหน้าหรือเฉียงหน้าเล็กน้อย
8. นั่งห่างพอให้เห็นอย่างน้อยศีรษะ ไหล่ แขน และถ้าเป็นไปได้ให้เห็นสะโพกด้วย เพื่อให้ pose signal ปัจจุบันเสถียร
9. ใช้แสงด้านหน้าหรือด้านข้างให้หน้ากับลำตัวสว่างพอ หลีกเลี่ยงย้อนแสงแรง
10. รอข้อความ `กำลังโหลดโมเดล Pose Landmarker...` หาย
11. รอจนเห็น skeleton สีฟ้า/จุด landmark สีส้มบนตัวอย่างต่อเนื่องอย่างน้อย **3–5 วินาที**
12. Clear Console ก่อนเริ่ม scenario
13. ถ้ามี EventLog จากการทดสอบก่อนหน้า ให้จดจำนวน row ไว้ก่อนเริ่ม; ไม่จำเป็นต้องล้างข้อมูลเพื่อทำ Ticket 04
14. ระหว่าง scenario Console ต้องไม่มี red runtime error, uncaught exception หรือ React error ที่เกิดจาก action ของ scenario

> ถ้า skeleton ไม่ขึ้นเลยตั้งแต่ก่อนเริ่ม scenario เพราะกล้อง permission, model load หรือ pose มองไม่เห็นคน ให้แก้ setup ก่อน ยังไม่ถือว่า Ticket 04 FAIL เพราะยังไม่ได้เข้าสู่เงื่อนไขที่ต้องทดสอบ

---

## Scenario 1 — Skeleton ต้องไม่กระพริบระหว่าง rAF tick ที่ไม่มี video frame ใหม่

**เป้าหมาย:** พิสูจน์ behavior หลักของ Ticket 04 ใน browser จริง: local webcam มักส่งภาพประมาณ 30 fps ขณะที่ rAF ทำงานได้ราว 60 Hz ดังนั้นหลาย rAF tick จะไม่มี video frame ใหม่ แต่ overlay ต้องวาด pose ล่าสุดต่อ ไม่หายวูบสลับเฟรม

### เตรียมก่อนเริ่ม

1. ใช้ local webcam
2. นั่งกลางภาพให้ระบบตรวจพบ skeleton ชัด
3. ให้แขน/ไหล่อยู่ในภาพเพื่อมองเส้น skeleton ง่าย
4. ตั้ง face features = ปิด
5. ตั้ง sound = ปิด
6. ตั้ง posture sustained = 30s
7. Clear Console
8. จดจำนวน EventLog row ก่อนเริ่ม

### ขั้นตอนบน browser

1. นั่งนิ่งและมอง skeleton ต่อเนื่อง **5 วินาที**
2. ค่อย ๆ เอียงศีรษะไปซ้ายแล้วกลับกลาง ใช้เวลาประมาณ **4 วินาที**
3. ค่อย ๆ เอียงศีรษะไปขวาแล้วกลับกลาง ใช้เวลาประมาณ **4 วินาที**
4. ยกแขนซ้ายช้า ๆ จากข้างตัวขึ้นระดับไหล่ ค้าง **2 วินาที** แล้วลดลงช้า ๆ
5. ยกแขนขวาแบบเดียวกัน ค้าง **2 วินาที** แล้วลดลง
6. ขยับลำตัวซ้าย-ขวาช้า ๆ โดยยังอยู่ในเฟรมประมาณ **8–10 วินาที**
7. รวมเวลาสังเกต overlay อย่างน้อย **25–30 วินาที**
8. ดู status line ใต้กล้องระหว่างทดสอบ
9. ดู EventLog หลังจบ
10. ตรวจ Console

### Expected result

**Overlay**

- skeleton สีฟ้า/landmark ต้องยังอยู่บนภาพต่อเนื่องระหว่างที่ pose signal มีอยู่
- ห้ามเห็น pattern แบบชัดเจนว่า skeleton “โผล่หนึ่งเฟรม → หายหนึ่งเฟรม → โผล่ → หาย” ขณะภาพ webcam เองยังต่อเนื่อง
- ขณะขยับช้า skeleton ควรเคลื่อนตามตำแหน่งใหม่เมื่อมีผล pose ใหม่ และคงผลล่าสุดไว้ระหว่าง tick ที่ไม่มีผลใหม่
- การเคลื่อนไหวของ skeleton อาจมีความหน่วงหรือ jitter จากโมเดลได้บ้าง; Ticket นี้ไม่ได้แก้ smoothing จึง **ไม่ถือ jitter เล็กน้อยเป็น FAIL**

**Status line**

- status line เช่น `ตรวจพบในเฟรม: 1 คน ...` ควรยัง render และอัปเดตตาม pipeline ปกติ
- Ticket 04 ไม่เปลี่ยน people tracking ดังนั้นไม่ใช้ความแม่นยำของจำนวนคนเป็นเกณฑ์หลักของ scenario นี้

**Alert / EventLog**

- เมื่อใช้ settings ตามที่กำหนดและขยับช้า ๆ ไม่ควรมี alert ใหม่จาก skeleton caching เอง
- EventLog ไม่ควรเพิ่ม event เพียงเพราะ rAF tick ไม่มี video frame ใหม่
- ถ้ามี posture event จากท่าที่ผู้ทดสอบทำจริง ให้จดไว้ แต่ให้ตัดสิน Ticket 04 จาก overlay continuity ไม่ใช่ classification

**Console**

- ไม่มี red runtime error / uncaught exception / React error
- ไม่มี error ใหม่จาก `drawOverlay`, canvas หรือ pose result cache

### PASS

Scenario 1 ผ่านเมื่อ:

- skeleton แสดงต่อเนื่องตลอดช่วงที่ pose ตรวจพบคน
- ไม่เห็น alternating flicker แบบเดิม
- การขยับทำให้ skeleton เปลี่ยนตำแหน่งตามผลใหม่โดยไม่หายทุก tick ที่ไม่มี frame ใหม่
- UI ไม่ crash และ Console สะอาด

### FAIL

ถือว่า fail ถ้า:

- skeleton กระพริบเป็นจังหวะเร็ว ๆ ทั้งที่ webcam และคนยังอยู่ในเฟรม
- skeleton หายทุก ๆ ช่วงสั้นแล้วกลับมาเป็น pattern ต่อเนื่อง
- canvas ถูกล้างจน overlay หายระหว่าง tick ที่ไม่มี frame ใหม่
- มี runtime error จาก overlay/cache
- หน้าเว็บหรือ detection loop หยุดทำงานหลังขยับ

---

## Scenario 2 — Regression จาก code review: เปลี่ยน local → IP ที่ยังไม่มี URL ต้องล้าง skeleton เก่าทันที

**เป้าหมาย:** พิสูจน์ finding ที่ automated helper test อย่างเดียวไม่ครอบ: reset ref ต้องล้าง **pixels ที่วาดอยู่จริงบน canvas** ก่อน source ใหม่ ready

Scenario นี้ intentionally เลือก IP mode โดยยังไม่กรอก URL เพื่อทำให้ source ใหม่อยู่ในสถานะ “ยังไม่พร้อม” แบบ deterministic โดยไม่ต้องพึ่ง network หรือ CORS

### เตรียมก่อนเริ่ม

1. เริ่มที่ local webcam
2. ให้ตัวอยู่ในภาพและรอจน skeleton ชัดต่อเนื่อง **5 วินาที**
3. อย่าลุกออกจากเฟรมก่อนเปลี่ยน source เพราะต้องการให้มี skeleton เก่าวาดอยู่จริง
4. ในช่อง IP Camera ถ้าเคยกรอก URL ค้างจากการทดสอบก่อน ให้ reload หน้าใหม่เพื่อให้ draft ว่าง หรือเอา URL ออกก่อนเริ่ม
5. Clear Console
6. จดจำนวน EventLog row ก่อนเริ่ม

### ขั้นตอนบน browser

1. มองให้แน่ใจว่า skeleton จาก local webcam กำลังวาดอยู่บนตัว
2. ในการ์ด `แหล่งภาพกล้อง` คลิก radio:
   `กล้องเครือข่าย (IP Camera — สตรีม MJPEG ผ่าน HTTP)`
3. **อย่ากรอก URL และอย่ากด `เชื่อมต่อ`**
4. มองพื้นที่กล้องทันทีหลังคลิก โดยเฉพาะตำแหน่งที่ skeleton เก่าเคยอยู่
5. รอ **5 วินาที**
6. ตรวจ banner ของกล้อง
7. ดู status line ใต้กล้อง
8. ดู EventLog
9. ตรวจ Console

### Expected result

**Overlay**

- skeleton / landmark จาก local webcam เดิมต้องหายจาก canvas **ทันทีเมื่อ source เปลี่ยน**
- ระหว่าง 5 วินาทีที่ IP source ยังไม่มี URL ต้องไม่มีโครงร่างเดิมค้างเป็นภาพนิ่ง
- ต้องไม่มี ghost skeleton จากคนที่อยู่ใน local webcam ก่อนเปลี่ยน source

นี่คือจุดสำคัญที่สุดของ Scenario 2 เพราะเป็น regression ที่พบใน code review

**Camera UI**

- ควรเห็นข้อความประมาณ:
  `กรอก URL กล้อง IP แล้วกด "เชื่อมต่อ" ในช่อง "แหล่งภาพกล้อง"`
- ไม่มีภาพ IP เพราะยังไม่ได้ใส่ URL ซึ่งเป็น expected setup

**Status line**

- จำนวนคนอาจยังไม่กลายเป็น 0 ทันที เพราะ Ticket 04 ไม่ได้ reset pose tracker/person state และ tracker เดิมมี stale timeout
- status line อาจค้างค่าคนเดิมชั่วคราวได้ จึง **ไม่ใช้การเปลี่ยน count ทันทีเป็น PASS/FAIL ของ Ticket 04**
- สิ่งที่ต้องหายทันทีคือ **pixels ของ skeleton บน canvas**

**Alert / EventLog**

- การเปลี่ยน source อย่างเดียวไม่ควรสร้าง event ใหม่ประเภท skeleton/overlay
- ถ้ามี event ที่จบเพราะ tracker เก่าหมดอายุภายหลัง ให้จดไว้ แต่ไม่ใช่เกณฑ์หลักของ Ticket นี้

**Console**

- ไม่มี red runtime error / uncaught exception
- เนื่องจากไม่ได้ใส่ IP URL จึงไม่ควรมี CORS error จากการประมวลผล stream

### PASS

ผ่านเมื่อ skeleton จาก local source หายทันทีหลังเปลี่ยนเป็น IP mode และไม่ค้างระหว่างที่ IP source ยังไม่ ready พร้อมทั้งไม่มี runtime error

### FAIL

ถือว่า fail ถ้า:

- เส้น skeleton หรือ landmark จาก local webcam ยังค้างอยู่บน canvas หลังเปลี่ยนเป็น IP mode
- skeleton เก่ายังค้างจนกว่าจะกลับมามี source ใหม่
- canvas clear ทำให้ app crash
- Console มี runtime error จาก source-change handling

---

## Scenario 3 — กลับจาก source ที่ไม่พร้อม → local webcam ต้องได้ skeleton ใหม่ตามปกติ

**เป้าหมาย:** ตรวจ regression ฝั่งกลับกันหลัง reset cache/canvas ว่าการล้างผลเก่าไม่ได้ทำให้ pose overlay หยุดถาวร

### เตรียมก่อนเริ่ม

1. ทำต่อจาก Scenario 2 ซึ่งขณะนี้เลือก IP Camera และไม่มี URL
2. skeleton เก่าต้องหายอยู่แล้ว
3. Clear Console

### ขั้นตอนบน browser

1. คลิก radio `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
2. ถ้ามี dropdown ให้เลือก webcam เดิม
3. ถ้า Chrome ถาม permission ใหม่ให้กด **Allow**
4. นั่งกลางภาพ
5. รอ local webcam แสดงภาพ
6. รอ skeleton ปรากฏ โดยให้เวลาสูงสุดประมาณ **5 วินาทีหลังภาพกล้องพร้อม**
7. นั่งนิ่ง **3 วินาที**
8. ยกแขนหนึ่งข้างช้า ๆ และลดลง รวมประมาณ **5 วินาที**
9. ดู status line
10. ดู EventLog
11. ตรวจ Console

### Expected result

**Overlay**

- ตอนเริ่ม local source ใหม่ ห้ามมี skeleton จาก source ก่อนหน้าถูกนำกลับมาวาดก่อนมี inference ใหม่
- เมื่อ Pose Landmarker ได้ผลใหม่แล้ว skeleton ต้องปรากฏและติดตามตัวอีกครั้ง
- หลังกลับมา local แล้วต้องไม่เกิด flicker แบบ alternating null tick เช่นเดียวกับ Scenario 1

**Status line**

- เมื่อ pipeline กลับมาตรวจพบคน status line ควรกลับมาแสดงจำนวนคนตามปกติ
- การเปลี่ยน count อาจมี tracker timing เล็กน้อย; ไม่ต้องได้ค่าภายใน frame เดียวกับที่เปลี่ยน source

**Alert / EventLog**

- การ reset/reconnect source อย่างเดียวไม่ควรสร้าง alert ใหม่จาก Ticket 04
- EventLog เดิมต้องไม่หายเพราะการเปลี่ยน source

**Console**

- ไม่มี red runtime error
- ไม่มี exception จากการใช้ ref ที่ถูก reset แล้ว
- ไม่มี canvas error จากการ clear/re-draw

### PASS

ผ่านเมื่อ local webcam กลับมาทำงาน, skeleton ใหม่ปรากฏจาก inference ใหม่, overlay ต่อเนื่อง และไม่มี error

### FAIL

ถือว่า fail ถ้า:

- กลับ local แล้ว skeleton ไม่กลับทั้งที่ภาพพร้อมและเห็นคนชัด
- skeleton เก่าปรากฏก่อน result ใหม่แบบเห็นได้ชัด
- overlay เริ่มกระพริบอีกครั้ง
- source switch ทำให้ detection loop หยุดหรือ Console มี runtime error

---

## Optional Scenario 4 — สลับ local webcam A → B โดยตรง (ถ้ามี 2 webcam)

Scenario นี้ **ไม่บังคับ** สำหรับ PASS ของ Ticket 04 แต่มีประโยชน์ถ้าเครื่องมี built-in camera + USB webcam หรือ USB webcam 2 ตัว

### เตรียมก่อนเริ่ม

1. ต่อ webcam อย่างน้อย **2 ตัว**
2. กด `รีเฟรชรายชื่อกล้อง`
3. ระบุให้ได้ว่า dropdown ตัวไหนคือ Camera A และ Camera B
4. จัด Camera A ให้เห็นผู้ทดสอบชัด
5. ถ้าทำได้ จัด Camera B ให้มองฉากว่างหรือมุมที่ไม่มีผู้ทดสอบ เพื่อให้ ghost skeleton สังเกตง่าย
6. เลือก Camera A และรอ skeleton ชัด
7. Clear Console

### ขั้นตอน

1. อยู่หน้า Camera A ให้ skeleton วาดต่อเนื่อง **5 วินาที**
2. จาก dropdown เปลี่ยนไป Camera B
3. มอง canvas ทันทีขณะกล้อง B กำลังเริ่มทำงาน
4. รอ **3–5 วินาที**
5. ถ้า Camera B มองฉากว่าง ให้ยืนยันว่าไม่มี skeleton จาก Camera A ค้าง
6. เปลี่ยนกลับ Camera A
7. รอ skeleton ใหม่
8. ทำ A → B → A ซ้ำอีก **2 รอบ**
9. ตรวจ Console

### Expected result / PASS

- ทุกครั้งที่ deviceId เปลี่ยน skeleton ของอุปกรณ์ก่อนหน้าต้องถูกล้างทันที
- ไม่มี ghost skeleton ค้างระหว่างรอกล้องใหม่พร้อม
- เมื่อกล้องใหม่เห็นคน skeleton ใหม่จึงค่อยปรากฏ
- ไม่มี runtime error

ถ้าเครื่องมี webcam แค่ตัวเดียว ให้บันทึก Scenario 4 = `N/A — มี webcam 1 ตัว` ไม่ถือเป็น FAIL

---

## สิ่งที่ไม่ควรบังคับทำด้วยมือ และ Vitest ที่พิสูจน์แทน

### 1. บังคับให้เกิด “rAF tick ที่ไม่มี video frame ใหม่” ทีละ tick แบบ deterministic

ผู้ทดสอบมองด้วยตาได้ว่า overlay กระพริบหรือไม่ แต่ไม่ควรพยายามพิสูจน์ระดับ tick ว่า tick ไหนมี/ไม่มี `video.currentTime` ใหม่ด้วยการจับเวลาเอง เพราะ browser scheduling, refresh rate และ webcam fps ต่างกันตามเครื่อง

พฤติกรรม pure cache ถูกพิสูจน์ด้วย:

ไฟล์:

`src/lib/poseResultCache.test.ts`

test:

`keeps the latest pose result when an animation tick has no new pose result`

พิสูจน์ว่าเมื่อ cache มี pose ล่าสุดและ tick ปัจจุบันไม่มี result ใหม่ (`null`) ค่าที่ใช้ต่อยังเป็น object เดิม ไม่กลายเป็น `null`

### 2. การ replace cache เมื่อ inference ใหม่สำเร็จ

ไม่จำเป็นต้อง inspect ref ผ่าน DevTools หรือแก้ source เพื่อดูค่าภายใน React component

Vitest:

`src/lib/poseResultCache.test.ts`

test:

`replaces the cached pose result when a new result arrives`

พิสูจน์ว่า result ใหม่แทน cached result เดิม

Browser smoke Scenario 1/3 มีหน้าที่พิสูจน์ wiring จริงว่า behavior นี้ไปถึง canvas overlay

### 3. การ reset cached value ตอน source เปลี่ยน

Vitest:

`src/lib/poseResultCache.test.ts`

test:

`starts empty after the camera source changes`

พิสูจน์ pure cache reset เป็น `null`

แต่ test นี้ **พิสูจน์ไม่ได้ว่า pixels ที่วาดอยู่บน canvas ถูกลบแล้ว** จึงยังต้องทำ Scenario 2 ซึ่งเกิดจาก regression finding ของ code review โดยตรง

### 4. Timing edge case `t=0` / sustained state machine

ไม่ต้องทำใน Ticket 04 เพราะเป็น requirement ของ Ticket 01 ไม่ใช่ skeleton cache

อย่าพยายาม reload ให้ `performance.now() === 0` หรือจับ timing exact ด้วยมือใน smoke นี้

Ticket 01 มี automated regression tests ของ sustained alert state machine อยู่แล้ว; Ticket 04 ไม่ควรเพิ่ม manual state-machine verification ซ้ำ

---

## เกณฑ์ PASS รวมของ Ticket 04 manual smoke

Required smoke ถือว่า **PASS** เมื่อ Scenario 1, 2 และ 3 ผ่านทั้งหมด:

1. local webcam มี skeleton ต่อเนื่อง ไม่เกิด alternating flicker จาก rAF tick ที่ไม่มี video frame ใหม่
2. เปลี่ยน local → IP mode ที่ source ใหม่ยังไม่พร้อมแล้ว skeleton เก่าหายทันที ไม่มี ghost pixels ค้าง
3. กลับ local แล้วได้ skeleton ใหม่ตามปกติและยังไม่กระพริบ
4. ไม่มี runtime/React/canvas error ใน Console จาก action ของทั้งสาม scenario
5. status line และ UI รอบกล้องยังทำงาน ไม่ crash
6. การเปลี่ยน source / cache overlay ไม่สร้าง alert หรือ EventLog event ใหม่โดยตัวมันเอง

### FAIL รวม

ถือ Ticket 04 manual smoke = **FAIL** ถ้า required scenario ใด scenario หนึ่งมี:

- skeleton flicker ชัดเจนแบบโผล่-หายสลับกัน
- stale/ghost skeleton จาก source เก่าค้างหลังเปลี่ยน source
- กลับ local แล้ว overlay ไม่ฟื้นทั้งที่ video + pose model พร้อม
- runtime exception / React error / canvas error
- detection loop หยุดหลัง source switch

ถ้า failure มาจาก camera permission, hardware ถูกโปรแกรมอื่นจับใช้อยู่, Pose model asset โหลดไม่ได้ หรือ setup ไม่ครบ ให้แก้ environment และ rerun ก่อนตัดสิน product FAIL

---

## สิ่งที่ต้องจดเมื่อ FAIL

ถ้า scenario fail ให้จดอย่างน้อย:

- scenario หมายเลขใด
- เวลาโดยประมาณที่อาการเกิด
- กล้อง/อุปกรณ์ที่เลือกก่อนและหลัง
- skeleton หายแบบกระพริบ หรือค้างเป็น ghost แบบใด
- status line ตอนเกิดปัญหา
- alert/banner/EventLog มีอะไรเปลี่ยนหรือไม่
- Console error แบบเต็ม
- ถ้าเป็น source switch ให้ระบุ local → IP(empty), IP(empty) → local หรือ local A → local B
- ถ้าอาการเกิดเฉพาะบางรอบ ให้จดจำนวนครั้ง เช่น “เกิด 2 จาก 5 รอบ”

ไม่ต้องทำ performance profiling, inference benchmark หรือ CPU comparison ใน Ticket นี้ เพราะจะซ้ำ Ticket 10–11 และ Ticket 17

---

## ตารางสรุปผล

กรอกหลังทดสอบจริง:

| Scenario | วันที่ทดสอบ | Browser / Version | OS | กล้องที่ใช้ | Dev URL | ผล | หมายเหตุ |
|---|---|---|---|---|---|---|---|
| 1 — Skeleton ไม่กระพริบระหว่าง local webcam |  |  |  |  |  | ☐ PASS / ☐ FAIL |  |
| 2 — local → IP(empty), skeleton เก่าต้องหายทันที |  |  |  |  |  | ☐ PASS / ☐ FAIL |  |
| 3 — IP(empty) → local, skeleton ใหม่ต้องกลับมา |  |  |  |  |  | ☐ PASS / ☐ FAIL |  |
| 4 — Optional local A → B |  |  |  |  |  | ☐ PASS / ☐ FAIL / ☐ N/A |  |

### สรุปรวม Ticket 04

- วันที่ทดสอบ: ____________________
- ผู้ทดสอบ: ____________________
- Chrome version: ____________________
- OS: ____________________
- Webcam / รุ่นกล้อง: ____________________
- Vite URL: ____________________
- Required scenarios 1–3: ☐ PASS / ☐ FAIL
- Optional scenario 4: ☐ PASS / ☐ FAIL / ☐ N/A
- Console สะอาดใน required scenarios: ☐ Yes / ☐ No
- **Manual browser smoke Ticket 04:** ☐ PASS / ☐ FAIL
- หมายเหตุเพิ่มเติม: ________________________________________________
