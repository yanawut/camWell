# 02: Manual browser smoke — ลบ dead stubs โดย UI ต้องไม่เปลี่ยน

เอกสารนี้ใช้ยืนยันเฉพาะ browser regression ของ performance Ticket 02 หลัง code review และ automated verification ผ่านแล้ว เป้าหมายของ Ticket คือเอาไฟล์ stub `alertStateMachine.ts` และ `PostureMonitor.tsx` ที่ไม่มี importer ออก โดย **พฤติกรรมและหน้าตา UI ต้องเหมือนเดิม** และ CSS ที่ CameraStage ใช้ต้องยังอยู่ครบ

นี่ไม่ใช่ HITL รอบใหญ่ของ Ticket 17 และไม่ใช้ตัดสินความแม่นของ posture model, คุณภาพการตรวจหลายกล้อง, FPS, calibration, identity หรือ fall detection จากกล้องจริง

## ขอบเขตที่ต้องพิสูจน์ด้วยมือ

Automated gate พิสูจน์แล้วว่า build/lint/Vitest ผ่านและไม่มี import ที่หัก แต่ automated test ไม่เห็นสิ่งต่อไปนี้:

- แอป Vite เปิดใน Chrome แล้ว render ได้จริงหลังลบไฟล์ stub
- `CameraStage` ยังใช้ CSS เดิมได้: camera frame, overlay, status/banner และข้อความด้านล่างไม่เสีย layout
- video + pose overlay ยังแสดงและอัปเดตต่อเนื่อง
- status line และ alert/EventLog wiring ยัง render ได้เมื่อ runtime มี posture signal
- reload แล้ว browser ไม่พยายามโหลด module `PostureMonitor` หรือ `alertStateMachine` ที่ถูกลบ
- Console ไม่มี runtime/module/CSS-related error ใหม่ที่เกิดจาก Ticket 02

สิ่งที่ **ไม่ใช้ smoke นี้ตัดสิน** คือ “ระบบวิเคราะห์ท่านั่งถูกต้องแค่ไหน” เพราะ Ticket 02 ไม่แก้ posture algorithm และเคยพบแล้วว่าการตีความท่าจากกล้องจริงอาจไม่ตรงกับที่คนคาดได้ ถ้าระบบเรียกชื่อ posture ต่างจากท่าที่ตั้งใจ แต่ UI/overlay/status ยังทำงาน ให้บันทึกไว้ ไม่ถือเป็น Ticket 02 fail โดยตัวมันเอง

## Prerequisites / config

ใช้ root workspace `camWell` เท่านั้น ไม่เข้า WSL

Environment ที่ตรวจจาก workspace ตอนเขียนเอกสาร:

- Node: `v24.21.0`
- npm: `11.19.0`
- Browser: Google Chrome desktop
- Webcam: อย่างน้อย **1 ตัว** (กล้องในตัวหรือ USB webcam)
- Ticket 02 ไม่เกี่ยวกับหลายกล้อง จึง **ไม่ต้องมี 2 ตัวขึ้นไป**

จาก root repo:

```bash
npm install
npm run dev
```

เปิด URL:

```text
http://localhost:5173/
```

ถ้า Vite เลือก port อื่นเพราะ 5173 ถูกใช้อยู่ ให้ใช้ URL ที่ terminal แสดงจริง และบันทึก URL นั้นในตารางผลท้ายไฟล์

### Backend

**ไม่ต้องรัน `backend/` สำหรับ smoke Ticket 02** เพราะ scenario ด้านล่างไม่ใช้ face recognition / identity

โค้ด ณ Ticket 02 ยังเป็นก่อน Ticket 03: `faceFeaturesEnabled` ค่าเริ่มต้นยังเป็นเปิด และ `App` อาจพยายามโหลดรายชื่อ identity ตอน mount แม้ smoke นี้ไม่ใช้ identity ดังนั้นให้ทำดังนี้:

1. เปิดหน้าเว็บ
2. ใน SettingsPanel ปิด `เปิดฟีเจอร์เกี่ยวกับใบหน้า (ความเหนื่อยล้า/ระยะห่างจอ/face recognition)`
3. รอ request ตอน initial mount จบ
4. เปิด DevTools Console แล้วกด Clear
5. เริ่มตัดสิน Console จากจุดนี้เป็นต้นไป

ถ้า backend ไม่ได้รัน อาจเห็น network/ข้อความเชื่อมต่อ backend จาก initial mount ก่อน Clear ได้ ซึ่งเป็น behavior เดิมนอก scope Ticket 02; แต่หลัง Clear แล้ว **ต้องไม่มี uncaught/runtime error ใหม่จาก scenario ที่กำลังทดสอบ**

### SettingsPanel ที่ใช้

ใช้ค่าต่อไปนี้ตลอด smoke เพื่อลดตัวแปรที่ไม่เกี่ยวข้อง:

| Setting | ค่า |
|---|---:|
| เปิดฟีเจอร์เกี่ยวกับใบหน้า | ปิด |
| เปิดเสียงแจ้งเตือน | ปิด |
| มุมคอที่ยอมรับได้ (forward head) | 45° |
| มุมลำตัวที่ยอมรับได้ (หลังค่อม) | 15° |
| มุมเอียงไหล่ที่ยอมรับได้ | 30° |
| นั่งท่าไม่ดีต่อเนื่องนานเท่าไหร่ก่อนแจ้งเตือน | 2s |

ค่าคอ/ไหล่ตั้งสูงเพื่อลดโอกาสเกิดหลาย issue พร้อมกัน ส่วน sustained = 2s ทำให้ตรวจ alert wiring ได้โดยไม่ต้องค้างท่านาน

## การเตรียมร่วมก่อนแต่ละ scenario

1. ใช้ Chrome desktop และเปิด DevTools → **Console**
2. ให้สิทธิ์ Camera กับ origin ที่ Vite ใช้
3. เลือก `กล้องในเครื่อง (USB หรือกล้องในตัวเครื่อง)`
4. เลือก webcam ที่ต้องการ หรือ `ค่าเริ่มต้นของเบราว์เซอร์`
5. จัดกล้องให้อยู่ **ด้านหน้า/เฉียงหน้าเล็กน้อย** ไม่ใช่ด้านข้างเต็มตัว เพราะ posture pipeline ปัจจุบันต้องเห็นหัว ไหล่ และสะโพกเพื่อให้ได้ signal สม่ำเสมอ
6. นั่งห่างพอให้เห็นศีรษะ ไหล่ทั้งสอง และสะโพกในเฟรม หลีกเลี่ยงการครอปช่วงลำตัว
7. ใช้แสงด้านหน้าหรือด้านข้างที่สม่ำเสมอ หลีกเลี่ยงย้อนแสงแรง
8. รอข้อความโหลด Pose Landmarker หาย และภาพกล้องนิ่งก่อนเริ่มจับเวลา
9. ปิด face features และเสียงตามตาราง แล้ว Clear Console
10. ระหว่าง scenario ถ้ามี red error / uncaught exception ใหม่ ให้จดข้อความ error และ scenario ที่เกิดทันที

---

## Scenario 1 — Cold load / reload หลังลบ stub

**เป้าหมาย:** ยืนยันว่า browser bundle/runtime ไม่ยังอ้างถึงไฟล์ `PostureMonitor.tsx` หรือ `alertStateMachine.ts` ที่ถูกลบ

### เตรียมก่อนเริ่ม

- ปิด tab Camwell เดิมทั้งหมด
- เปิด DevTools Console
- ถ้า Chrome จำ permission ไว้แล้วใช้ต่อได้; ถ้าถามใหม่ให้กด Allow
- backend ไม่ต้องรัน

### ขั้นตอน

1. เปิด URL ของ Vite
2. รอหน้า Camwell render จนครบ
3. ปิด face features ตาม prerequisites แล้ว Clear Console
4. เลือก local webcam
5. รอ Pose model พร้อมและภาพกล้องขึ้น
6. กด Chrome Reload 1 ครั้ง
7. หลัง reload ให้ปิด face features อีกครั้งถ้าค่ากลับเป็น default แล้ว Clear Console หลัง initial mount
8. เลือก/ยืนยันกล้องเดิม
9. รออย่างน้อย **10 วินาที**
10. ตรวจ Console และ Network/หน้าเว็บด้วยสายตา

### Expected result

- หน้าไม่ blank และไม่มี React/Vite error overlay
- ไม่มี error เช่น module not found / failed to resolve import ที่อ้าง `PostureMonitor` หรือ `alertStateMachine`
- SettingsPanel, camera source card, CameraStage, EventLog และ footer render ครบ
- หลัง reload กล้องสามารถเริ่มใหม่ได้
- Console หลัง Clear ไม่มี red runtime error / uncaught exception ใหม่
- ไม่มีข้อความชื่อไฟล์ stub ที่ถูกลบปรากฏใน runtime error

### PASS

ผ่านเมื่อ cold load + reload render ได้ครบทั้งสองรอบ, camera เริ่มทำงานได้ และไม่มี runtime/module error ที่เกี่ยวกับไฟล์ที่ลบ

### FAIL

ถือว่า fail ถ้า app blank/crash, Vite/React แจ้ง module ที่หาไม่เจอ, CameraStage หายทั้ง block, reload แล้วพัง หรือ Console มี uncaught error ใหม่ที่สืบกลับมาที่การลบ stub

---

## Scenario 2 — CameraStage layout + CSS ที่ต้องคงไว้

**เป้าหมาย:** จับ regression ที่ build/test มองไม่เห็น: ตอนลบ `PostureMonitor.tsx` ห้ามเผลอลบ CSS ใต้ comment เดิม `/* --- PostureMonitor --- */` เพราะ class เหล่านั้นถูกใช้โดย `CameraStage.tsx`

### เตรียมก่อนเริ่ม

- เริ่มจากหน้าใหม่หรือ reload
- local webcam พร้อม
- face features = ปิด
- เสียง = ปิด
- Clear Console
- นั่งนิ่งตรงกลางภาพให้หัว–ไหล่–สะโพกเห็นครบ

### ขั้นตอน

1. รอภาพ webcam แสดง
2. ดูกรอบกล้องประมาณ **5 วินาที** โดยยังไม่ขยับ
3. ขยับศีรษะและไหล่ช้า ๆ ซ้าย–ขวา **5 วินาที**
4. สังเกต canvas overlay ที่วาดทับวิดีโอ
5. ตรวจข้อความใต้กล้อง `ตรวจพบในเฟรม: ... คน (รองรับสูงสุด ... คนพร้อมกัน)`
6. เลื่อนหน้าไปที่ SettingsPanel แล้วกลับมาที่กล้อง เพื่อดูว่า layout ไม่กระโดด/ซ้อนผิด
7. ปรับความกว้างหน้าต่าง Chrome ให้แคบลงจน layout เปลี่ยนเป็นคอลัมน์เดียว แล้วขยายกลับ
8. ดู camera frame, overlay, status line และ privacy note หลัง resize
9. ปล่อยให้ภาพทำงานต่อเนื่องรวมอย่างน้อย **15 วินาที**
10. ตรวจ Console

### Expected result

- CameraStage อยู่ใน container ปกติ ไม่แตกออกจากหน้า
- camera frame มีสัดส่วนคงที่และไม่ยุบเหลือ 0 สูง
- video และ overlay ซ้อนตำแหน่งเดียวกัน ไม่เห็น canvas หลุดไปด้านข้าง/ด้านล่าง
- overlay ขยับตามคนเมื่อผู้ใช้ขยับ
- status line `ตรวจพบในเฟรม: ...` ยังอยู่ใต้กล้องและอัปเดต
- privacy note ยังอยู่ใต้ CameraStage
- resize แคบ/กว้างแล้วกล้องไม่ทับ SettingsPanel และกลับ layout ได้
- ไม่มี red runtime error / uncaught exception หลัง Clear Console

### PASS

ผ่านเมื่อ visual container, overlay, status line และ responsive layout ยังใช้งานได้ต่อเนื่อง 15 วินาทีโดยไม่เสียตำแหน่ง/หาย

### FAIL

ถือว่า fail ถ้า camera frame ไม่มี style, overlay หลุดตำแหน่ง, status/banner วางผิดที่อย่างชัดเจน, layout ซ้อนกันจาก CSS ที่หาย, CameraStage หาย หรือมี runtime error ใหม่

> **ไม่ใช้ scenario นี้ตัดสิน skeleton flicker ระดับเฟรมต่อเฟรม** เพราะ Ticket 04 เป็นเจ้าของ regression นั้น Ticket 02 ตรวจเพียงว่า overlay ยัง render/เคลื่อนไหวและไม่พังจากการลบ stub/CSS

---

## Scenario 3 — Posture signal → alert banner → EventLog ยังต่อสายครบ

**เป้าหมาย:** smoke การเชื่อม UI ที่ `PostureMonitor` stub ไม่ได้เป็นเจ้าของจริง เพื่อยืนยันว่าหลังลบ stub ระบบ runtime ยังใช้ `CameraStage` + current alert pipeline ตามเดิม

**ข้อจำกัด:** อย่าใช้ scenario นี้ตัดสินว่า posture classification “ถูกทางกายภาพ” หรือไม่ ให้ใช้ issue ใดก็ตามที่ detector ปัจจุบันสามารถทำให้แสดงซ้ำได้ใน setup ของเครื่องนั้น

### เตรียมก่อนเริ่ม

- ใช้ SettingsPanel ตามตาราง โดย sustained = **2s**
- กล้องเห็นหัว ไหล่ และสะโพกครบ
- Clear Console
- Reload ถ้าต้องการ EventLog เริ่มจาก 0
- หลัง reload ปิด face features และ Clear Console อีกครั้ง

### ขั้นตอน

1. นั่งตรงกลางภาพ **5 วินาที** ให้ระบบสร้าง track ที่เสถียร
2. สังเกต status/overlay ว่ามีคนถูกตรวจพบ
3. ค่อย ๆ เปลี่ยนเป็นท่าที่ detector ของเครื่องนี้เคยแสดงเป็น issue ได้ง่าย เช่น โน้มลำตัว/ก้มตัว โดย **ห้ามล้มลงกับพื้นหรือทำท่ารุนแรง**
4. รอจน runtime มี posture issue ที่สม่ำเสมอ
5. จากจุดที่ issue เริ่มสม่ำเสมอ ค้างท่า **อย่างน้อย 3 วินาที**
6. ดู camera alert banner/กรอบ alert
7. ดู EventLog ว่ามี row ใหม่ของหมวดท่านั่งหรือไม่
8. กลับมานั่งตรงและค้างอย่างน้อย **2 วินาที**
9. ดูว่า active banner/event สามารถจบได้
10. ตรวจ Console

### Expected result

เมื่อ detector ให้ bad-posture signal ต่อเนื่องเกิน 2s:

- CameraStage ยังแสดง alert banner ในตำแหน่งบน camera frame
- EventLog เพิ่ม event เดียวตาม signal ที่เกิดขึ้น
- ขณะ event active ระยะเวลาแสดง `กำลังดำเนินอยู่...`
- เมื่อ signal กลับดีต่อเนื่อง ระบบสามารถปิด alert และ EventLog row เดิมเปลี่ยนเป็นระยะเวลาที่จบแล้ว
- video/overlay/status ไม่หายระหว่าง alert
- Console อาจมี `[alertReporter] เริ่มแจ้งเตือน...` / `จบการแจ้งเตือน...` ระดับ info
- ไม่มี red runtime error / uncaught exception ใหม่

### PASS

ผ่านเมื่อ **ถ้า detector สร้าง bad-posture signal ได้** alert banner + EventLog + camera UI ยังทำงานร่วมกันโดยไม่ crash และ event เดิมไม่ทำให้ CameraStage layout พัง

### FAIL

ถือว่า fail ถ้า detector มี bad-posture signal ต่อเนื่องชัดเจนเกิน 2s แต่ alert UI/EventLog ไม่ render, alert ทำให้ camera container/overlay หาย, หรือ Console มี runtime error ใหม่

ถ้าทำท่าหลายแบบแล้ว detector ไม่ให้ bad-posture signal ที่สม่ำเสมอ ให้บันทึก Scenario 3 เป็น `N/A — ไม่ได้ signal ที่ reproducible` **ไม่ใช่ FAIL ของ Ticket 02** เพราะความแม่น/threshold ของ posture ไม่ได้เปลี่ยนใน Ticket นี้และเคยเป็นข้อจำกัดที่พบจากกล้องจริงอยู่แล้ว

---

## Scenario 4 — Reload หลังใช้งาน เพื่อจับ stale browser/module regression

**เป้าหมาย:** ตรวจว่าหลัง CameraStage เคยทำงานจริงแล้ว การ reload ยังไม่อ้าง module stub เก่าจาก HMR/cache และ UI กลับมาได้ตามเดิม

### เตรียมก่อนเริ่ม

- ทำ Scenario 2 อย่างน้อยหนึ่งรอบ
- local webcam ยังต่ออยู่
- Clear Console ก่อน reload

### ขั้นตอน

1. กด Reload
2. ถ้า Chrome ถาม permission ให้ Allow
3. ปิด face features แล้ว Clear Console หลัง initial mount
4. เลือกกล้องเดิม
5. รอ Pose model พร้อม
6. นั่งอยู่ในเฟรม **10 วินาที**
7. ขยับตัวเบา ๆ ให้ overlay อัปเดต
8. ตรวจ camera frame, status line, EventLog panel และ Console

### Expected result

- reload หลังใช้งานจริงยังกลับมา render ได้
- ไม่เกิด 404/module error ของสองไฟล์ stub
- CameraStage + overlay เริ่มใหม่ได้
- layout เหมือน Scenario 2
- Console หลัง Clear ไม่มี uncaught/runtime error ใหม่

### PASS

ผ่านเมื่อ reload แล้วกลับสู่ runtime ปกติได้ครบ

### FAIL

fail เมื่อ reload เท่านั้นที่ทำให้ module error, blank page, CameraStage ไม่ mount หรือ CSS/layout หาย

---

## Regression ที่ automated test อย่างเดียวไม่พอ แต่ต้องจำกัด scope

### ต้องดูด้วยมือใน Ticket 02

- CameraStage container ยังใช้ `.posture-monitor` / `.camera-frame` CSS จริง
- video กับ overlay ซ้อนกันถูกตำแหน่ง
- status/banner/EventLog render ใน browser จริง
- responsive layout ไม่แตกหลังเปลี่ยน comment โดยคง rules
- reload ไม่เจอ stale import/module error

### ไม่บังคับใน Ticket 02

รายการต่อไปนี้มี manual value แต่เป็นเจ้าของโดย ticket อื่นหรือ Ticket 17 จึง **ไม่ควรขยาย smoke Ticket 02 ไปทดสอบ**:

- skeleton flicker ระดับเฟรมต่อเฟรม → Ticket 04
- สลับกล้อง / หลายกล้องพร้อมกัน → ไม่ได้ถูกแก้ใน Ticket 02; Ticket นี้ใช้ 1 webcam พอ
- FPS, CPU, inference cadence, ความลื่นเชิง performance → Ticket 10–11 / Ticket 17
- IP/MJPEG camera → ไม่ใช่ scope
- posture orientation/quality gate → Ticket 07–08
- fall จากการล้มจริง/หลุดเฟรม → Ticket 06 และ Ticket 17; **ไม่ควรให้คนล้มจริงเพื่อ smoke**
- face recognition / identity / backend → ไม่ใช่ scope Ticket 02
- dataset/calibration → ticket ภายหลัง

ถ้าระหว่าง smoke เห็นปัญหาเหล่านี้ให้จดไว้เป็น observation แต่ไม่ควรเปลี่ยนผล Ticket 02 เป็น FAIL เว้นแต่มีหลักฐานว่าปัญหาเกิดใหม่จาก diff ของ Ticket 02

## Edge case ที่ไม่ควรบังคับทำด้วยมือ

Ticket 02 เองไม่มี pure timing logic ใหม่ จึงไม่มี edge case ใหม่ที่ควรสร้าง manual timing test เพิ่ม แต่ blocker Ticket 01 มี regression สำคัญที่ manual browser ไม่สามารถสร้างเวลา `t=0` ได้อย่าง deterministic และไม่ควรใช้ stopwatch แทน unit test

Vitest ที่พิสูจน์แทน:

### `src/lib/sustainedAlertMachine.test.ts`

- `does not alert before the sustained duration elapses`
- `alerts once when a bad posture starting at t=0 reaches the sustained duration`
- `preserves zero-valued signal and recovery timestamps`

โดยเฉพาะ 2 test หลังพิสูจน์ timestamp ค่า `0` ซึ่ง manual smoke ไม่ควรพยายามจำลอง

### `src/lib/fallDetection.test.ts`

- `returns null when there is only one torso reading`
- `reports a 0.30 downward drop from y=0.40 to y=0.70`
- `does not count upward movement as a drop`
- `removes readings older than the configured time window`

pure geometry/history cases เหล่านี้พิสูจน์ด้วยค่าตัวเลข deterministic ดีกว่าให้คนทำท่าล้มจริง และ Ticket 02 ไม่ได้แก้ logic นี้

## เกณฑ์สรุป Ticket 02

ให้ถือ manual smoke ของ Ticket 02 เป็น **PASS** เมื่อ:

1. Scenario 1 = PASS
2. Scenario 2 = PASS
3. Scenario 4 = PASS
4. Scenario 3 = PASS หรือ N/A เพราะ detector ไม่ให้ reproducible posture issue
5. หลัง Clear Console ตามขั้นตอน ไม่มี runtime/module error ใหม่ที่เกี่ยวกับ Ticket 02
6. ไม่มี regression ของ CameraStage layout/CSS จากการลบ `PostureMonitor` stub

ให้ถือเป็น **FAIL** ถ้าพบอย่างใดอย่างหนึ่ง:

- browser หา module ที่ถูกลบไม่เจอ
- CameraStage ไม่ render / app crash
- CSS camera container/overlay/status พังจาก rules หาย
- reload ทำให้ runtime แตก
- alert/EventLog wiring พังทั้งที่ detector มี signal ชัดและปัญหาสืบกลับมาที่ diff Ticket 02
- มี uncaught exception ใหม่หลัง Clear Console ที่สืบกลับมาที่ Ticket 02

## ตารางสรุปผล

| Scenario | ผล (PASS / FAIL / N/A) | หลักฐาน/หมายเหตุ |
|---|---|---|
| 1 — Cold load / reload |  |  |
| 2 — CameraStage layout + CSS |  |  |
| 3 — Alert/EventLog wiring |  |  |
| 4 — Reload หลังใช้งาน |  |  |

| ข้อมูลการทดสอบ | ค่า |
|---|---|
| วันที่ทดสอบ |  |
| ผู้ทดสอบ |  |
| URL ที่ใช้ |  |
| Browser + version |  |
| OS + version |  |
| Node / npm | `v24.21.0` / `11.19.0` |
| Webcam ที่ใช้ (ยี่ห้อ/รุ่น/ชื่อใน Chrome) |  |
| จำนวน webcam | 1 |
| Backend รันหรือไม่ | ไม่รัน |
| Face features | ปิด |
| DevTools Console หลัง Clear |  |
| ผลรวม Ticket 02 |  |
| หมายเหตุเพิ่มเติม |  |
