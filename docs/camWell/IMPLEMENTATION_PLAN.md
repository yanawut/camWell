# แผนสร้าง Camwell Dev Console (design ฉบับ 2026-10-05, `project/Camwell Dev Console.dc.html`)

> สถานะ: **อนุมัติแล้ว — รอคำสั่งเริ่ม**
> หลักการ: หน้าเดิมต้องทำงานเหมือนเดิมทุกอย่าง · ไม่แก้ `src/lib/*` · การแก้ไฟล์เดิมเป็นแบบ **เพิ่ม optional prop / ค่า return** ที่ไม่ส่ง = พฤติกรรมเดิม · logic ที่ต้องแก้จริงมีจุดเดียว (`datasetRecorder` ข้อ 3.4) และมี test คุม

---

## 1. สิ่งที่เปลี่ยนจาก design เดิม

| เดิม | ใหม่ |
|---|---|
| 5 แท็บ (มี Dataset) | **4 แท็บ**: ภาพรวมระบบ · เกณฑ์การตรวจจับ · เหตุการณ์ · ข้อมูลใบหน้า |
| Dataset เป็นแท็บแยก มีภาพกล้องของตัวเอง | **toggle "Dataset Recorder [DEV]" บน header** → แผงอยู่คอลัมน์ขวาของหน้าภาพรวม, บันทึกจาก **การ์ดกล้องเดิม** (ไม่เปิดสตรีมที่สอง) |
| ภาพสด + feature 4 ช่องอยู่ในแท็บ Dataset | ป้าย `● REC {label} · {count}` + แถบ feature 4 ช่อง **ซ้อนบนการ์ดกล้องที่กำลังบันทึก** |
| สถานะโมเดล/บริการเป็นการ์ดในหน้าภาพรวม | ย้ายไป **ท้าย sidebar** |
| schema แสดงตลอด | ซ่อนไว้ กด "ดู schema" |

→ ปัญหา "ภาพกล้องสดในแท็บ Dataset ต้องเปิดสตรีมที่สอง" ใน plan เดิม **หายไป** เพราะ design ใหม่ใช้การ์ดกล้องเดิม

## 2. โครงรวม

- หน้าเดิม (`Camwell Current`) คงไว้ 100%
- เปิด console ด้วย `/?console` **ได้ทุก build** (ยังอยู่ช่วง dev — จะกำหนดสิทธิ์/เงื่อนไขใหม่เมื่อทุกอย่างลงตัว)
  - หมายเหตุ: การบันทึก dataset ใน CameraStage ยังผูก `import.meta.env.DEV` อยู่เดิม — ไม่แตะ (production build จะไม่เก็บ sample)
- `App.tsx`: state + handler เดิมไม่แตะ — เพิ่มแค่ `if (isConsole) return <DevConsole … />` ก่อน JSX เดิม
- **ห้าม unmount `CameraStage` ตอนสลับแท็บ** → render การ์ดกล้องไว้ตลอด ซ่อนด้วย `hidden` เมื่อไม่ได้อยู่แท็บภาพรวม
- CSS ธรรมดาใน `src/console/console.css` (สี/ระยะตาม design: `#f4f5f7`, `#e2e4e9`, `#2563eb`, sidebar 232px, radius 12px, keyframe `fall-alert-pulse`) — ไม่เพิ่ม dependency, ไม่ใช้ router

## 3. การแก้ไฟล์เดิม

| # | ไฟล์ | สิ่งที่เพิ่ม/แก้ | ผลต่อหน้าเดิม |
|---|---|---|---|
| 3.1 | `src/App.tsx` | branch ไป `DevConsole` เมื่อ `?console` | ไม่มี |
| 3.2 | `src/components/CameraStage.tsx` | optional `onStats?(s)` เรียกทุก 500ms: `{ inferenceMs, poseStatus, faceStatus, delegate, cameraError, rawFeatures \| null }` (อ่านจาก `poseInferenceMsRef` และ `engineResult` ที่มีอยู่แล้ว) | ไม่ส่ง prop = เหมือนเดิม |
| 3.3 | `src/components/CameraStage.tsx` | optional `overlay?: ReactNode` render ภายในกรอบวิดีโอ (ใช้วางชิป GPU/ms/คน/REC + แถบ feature) | ไม่ส่ง = เหมือนเดิม |
| 3.4 | `src/services/datasetRecorder.ts` | `start(label, cameraId?)` — ถ้าระบุ `cameraId` จะรับ sample เฉพาะกล้องนั้น (`add` เช็ค `sample.cameraId`) | หน้าเดิมเรียก `start(label)` = รับทุกกล้องเหมือนเดิม · เพิ่ม test ใน `datasetRecorder.test.ts` |
| 3.5 | `src/hooks/usePoseLandmarker.ts` | return `delegate: 'GPU' \| 'CPU'` เพิ่ม | ไม่มี |

ถ้าระหว่างทำพบว่าต้องแก้มากกว่านี้ → หยุดแล้วถามก่อน

## 4. ไฟล์ใหม่

| ไฟล์ | หน้าที่ |
|---|---|
| `src/console/DevConsole.tsx` | shell: sidebar (4 เมนู + badge, สถานะบริการ, footer), header (โหมด, เสียง, ใบหน้า, toggle Recorder, ป้าย backend), fall banner, state แท็บ |
| `src/console/MonitorTab.tsx` | แถบสถิติ 4 ช่อง, การ์ดกล้อง (ห่อ `CameraSourceSelector` + `CameraStage` เดิม), + เพิ่มกล้อง, แผง Recorder, แจ้งเตือนล่าสุด 4 รายการ |
| `src/console/RecorderPanel.tsx` | เลือกกล้อง/label, ตัวนับ, เริ่ม/หยุด, Export JSON, ล้าง, ดู schema — ใช้ `datasetRecorder` + `buildDatasetJson` เดิม |
| `src/console/ThresholdsTab.tsx` | slider 5 กลุ่ม (ช่วง min/max/step ตรงกับ `SettingsPanel` แล้ว), จุดฟ้าเมื่อเปลี่ยน, นับจำนวนที่แก้, คืนค่าเริ่มต้น |
| `src/console/EventsTab.tsx` | ตัวกรองหมวด + จำนวน, "เฉพาะที่ยัง active", ตาราง, Export JSON |
| `src/console/PeopleTab.tsx` | คำเตือน PDPA, ตารางพนักงาน + ลบ (handler เดิม) |
| `src/console/useBackendHealth.ts` | fetch `${API_BASE_URL}/health` ทุก 10 วิ |
| `src/console/console.css` | สไตล์ทั้งหมด |

`DatasetRecorderPanel.tsx` เดิมไม่แตะ (หน้าเดิมยังใช้)

## 5. Map ข้อมูล design → ของจริง

| ใน design (mock) | ของจริง |
|---|---|
| Pose inference (EMA) | เฉลี่ย `inferenceMs` จาก `onStats` ทุกกล้อง |
| "จำกัด 12 fps · 83 ms/รอบ" | ค่าจาก `poseThrottle.ts` |
| Face detection 400 ms / 3 วิ | ค่าคงที่เดิมใน CameraStage (ถ้าไม่ได้ export → แสดงตาม `faceFeaturesEnabled` เท่านั้น) |
| คนที่กำลังติดตาม | `sum(peopleBySlot)` / (`maxPeople` × จำนวนกล้อง) |
| แจ้งเตือน active / ทั้งหมด | `events` ที่ยังไม่จบ / `events.length` |
| ชิป GPU/CPU, `~18 ms`, `1 / 4 คน` | `onStats` + `peopleBySlot` |
| กรอบแดงรอบกล้อง + แบนเนอร์ ⚠ | แบนเนอร์เดิมใน CameraStage (ไม่ทำซ้ำ) |
| error CORS บนกล้อง / ใน sidebar | `cameraError` จาก `onStats` |
| Posture baseline + storage key | `loadPostureBaseline(slot.id)` |
| ปุ่ม Calibrate ท่านั่ง/ระยะนั่ง | ปุ่มเดิมใน CameraStage (จัดสไตล์ด้วย CSS ของ console ไม่ย้าย logic) |
| ปุ่ม "เปลี่ยนแหล่งภาพ" | toggle แสดง `CameraSourceSelector` เดิม |
| สถานะ Pose / face-api / backend / reporter | `onStats` + `useBackendHealth` + ข้อความคงที่ `consoleAlertReporter · Phase 1` |
| feature 4 ช่องบนกล้องที่ REC | `rawFeatures` จาก `onStats` ของกล้องนั้น |
| ปุ่มกล้องใน Recorder ปิดเมื่อกล้อง error / ระหว่างบันทึก | `cameraError` + state `recording` |
| toggle Recorder ปิดไม่ได้ระหว่างบันทึก | ตาม design |
| ข้อมูลสุ่ม/รายชื่อ/เหตุการณ์ตัวอย่าง | ไม่ใช้ — state จริงทั้งหมด |

## 6. ลำดับการทำ (ตรวจทุกขั้น)

1. **Shell** — `DevConsole` + CSS + branch ใน `App.tsx` · sidebar/header/สลับแท็บ/toggle ผูก state เดิม
2. **Monitor (กล้อง)** — การ์ดกล้องห่อ CameraStage (ซ่อนด้วย `hidden`), เพิ่ม/ลบกล้อง, fall banner, แจ้งเตือนล่าสุด
3. **Stats** — 3.2, 3.3, 3.5 → แถบสถิติ, ชิปบนกล้อง, สถานะบริการใน sidebar, `useBackendHealth`
4. **Recorder** — 3.4 + test → `RecorderPanel`, ป้าย REC + แถบ feature บนการ์ดกล้อง, badge `● REC` ที่เมนู
5. **Thresholds**
6. **Events** — รวม Export JSON (Blob download)
7. **People**

## 7. การตรวจสอบ

- ทุกขั้น: `npm run lint`, `npm test`, `npm run build` ผ่าน · test เดิมห้ามแก้ (เพิ่มได้)
- `git diff -- src/lib` ต้องว่าง
- `git diff -- src/components src/hooks src/App.tsx` เป็นบรรทัดเพิ่มตามข้อ 3 เท่านั้น
- HITL:
  - `/` → หน้าเดิมเหมือนเดิม, Dataset Recorder เดิมยังบันทึกได้ทุกกล้อง
  - `/?console` → สลับ 4 แท็บแล้วกลับมา กล้องไม่โหลดใหม่
  - ต่อ 2 กล้อง เลือกบันทึก cam-2 → JSON ที่ export มีแต่ `cameraId: cam-2`
  - กล้อง IP ติด CORS → ปุ่มกล้องนั้นใน Recorder ถูก disable
  - ปรับ slider → การตรวจจับเปลี่ยนตาม · ลบพนักงานได้ · ปิด backend → ป้าย offline

## 8. ไม่ทำ / ต่างจาก design

- **Branch ใน sidebar footer** — ไม่มีใน runtime → ตัดออก (ถ้าต้องการ: inject ผ่าน `define` ใน `vite.config.ts` ตอน build)
- **Responsive มือถือ** — ทำแค่ไม่ให้ layout พังเมื่อจอแคบ

## 9. ตัดออก: หยุดกล้องอื่น/ข้าม face-api ระหว่างบันทึก dataset

ไม่ทำ — ได้ประโยชน์น้อย และเสี่ยงเกิดปัญหาตามมา (fall alert ปลอมตอน resume, ตัวจับเวลานั่งเพี้ยน)

## 10. คำตอบที่ยืนยันแล้ว (2026-10-05)

1. Console เปิดได้ทุก build ผ่าน `/?console` — กำหนดใหม่ภายหลัง
2. อนุมัติการแก้ข้อ 3 ทั้ง 5 จุด
3. ไม่ทำข้อ 9

**สถานะ: แผนพร้อม — รอคำสั่ง "เริ่ม"**
