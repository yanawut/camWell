# Camwell — คู่มือแก้ไขและพัฒนาทีละขั้น (สำหรับมือใหม่)

> เอกสารนี้เขียนให้คนที่เพิ่งเริ่มต้น อ่านแล้วลงมือทำตามได้ทีละขั้น และ **เข้าใจว่าทำไปเพื่ออะไร** ไม่ใช่แค่ก๊อปโค้ดไปวาง
>
> โค้ดตัวอย่างทุกขั้นในเอกสารนี้ **ทดสอบแล้ว** บน copy ของโปรเจกต์ (commit `1be4407`):
> `tsc` ผ่าน, `oxlint` ผ่าน, `vite build` ผ่าน, และ unit test 17 ข้อผ่านทั้งหมด

---

## 🆕 อัปเดตตามโค้ดล่าสุด (commit `1be4407`)

เอกสารนี้ปรับให้ตรงกับโค้ดที่มีการเพิ่มฟีเจอร์ใหม่ 5 commit:

| ฟีเจอร์ใหม่ | ผลต่อแผนนี้ |
|---|---|
| เลือกแหล่งภาพ: กล้องในเครื่อง / กล้อง IP (MJPEG) | กล้อง IP เดิม **รัน AI ทุกรอบ rAF (~60 ครั้ง/วินาที)** เพราะไม่มีสัญญาณ "เฟรมใหม่" → ขั้น 3.2 (จำกัด FPS) สำคัญขึ้นมาก |
| ตรวจจับหกล้ม / ตกจากเก้าอี้ | ใช้ `torsoAngleDeg` ซึ่งต้องเห็นสะโพก → ขั้น 2.3 ต้องแก้ส่วนนี้ด้วย และ **เจอบั๊กใหม่**: การแจ้งเตือน "หายไปจากเฟรมหลังร่วงตัว" ไม่มีวันทำงานด้วยค่าเริ่มต้น (ขั้นใหม่ **1.5**) |
| ต่อหลายกล้องพร้อมกัน (สูงสุด 2) | แต่ละกล้องโหลดโมเดล AI แยกชุด → เครื่องหนักขึ้น 2 เท่า (Phase 3 สำคัญขึ้น) และ **baseline ท่านั่งต้องเก็บแยกต่อกล้อง** เพราะแต่ละกล้องคนละมุม (Phase 4 ปรับแล้ว) |
| Backend ระบุตัวตน (Node/Express + SQLite) | ฟีเจอร์ใบหน้าเปิดอยู่เป็นค่าเริ่มต้น แต่ถ้าไม่ได้รัน backend จะขึ้น error → อีกเหตุผลที่ควรปิดเป็นค่าเริ่มต้น (ขั้น 1.2) |

สิ่งที่ **ยังไม่ถูกแก้** ในโค้ดล่าสุด (แผนเดิมยังใช้ได้ทั้งหมด): ไฟล์ stub, skeleton กระพริบ, break timer, ต้องเห็นสะโพก, สูตรไหล่เอียง, ไม่มี smoothing/calibration, ไม่มี test

---

## สารบัญ

- [0. อ่านก่อนเริ่ม](#0-อ่านก่อนเริ่ม)
  - [0.1 วิธีใช้เอกสารนี้](#01-วิธีใช้เอกสารนี้)
  - [0.2 เตรียมเครื่องมือ](#02-เตรียมเครื่องมือ)
  - [0.3 Git: ตาข่ายนิรภัยของคุณ](#03-git-ตาข่ายนิรภัยของคุณ)
  - [0.4 ความรู้พื้นฐานที่ควรมีก่อน](#04-ความรู้พื้นฐานที่ควรมีก่อน)
  - [0.5 แผนที่โค้ด: อะไรอยู่ตรงไหน](#05-แผนที่โค้ด-อะไรอยู่ตรงไหน)
  - [0.6 คำศัพท์ที่จะเจอบ่อย](#06-คำศัพท์ที่จะเจอบ่อย)
- [Phase 1 — แก้บั๊กเล็ก ๆ (อุ่นเครื่อง)](#phase-1--แก้บั๊กเล็ก-ๆ-อุ่นเครื่อง)
- [Phase 2 — ทดลองวัดจริง + Quality Gate (ให้ทำงานได้แม้มองไม่เห็นสะโพก)](#phase-2--ทดลองวัดจริง--quality-gate)
- [Phase 3 — โหมดคนเดียว (Workstation) + จำกัด FPS](#phase-3--โหมดคนเดียว-workstation--จำกัด-fps)
- [Phase 4 — Calibration + Smoothing + วัดมุมให้ถูก](#phase-4--calibration--smoothing--วัดมุมให้ถูก)
- [Phase 5 — Automated Tests ด้วย Vitest](#phase-5--automated-tests-ด้วย-vitest)
- [Phase 6 — รองรับหลายปัญหาพร้อมกัน + Dataset Recorder](#phase-6--รองรับหลายปัญหาพร้อมกัน--dataset-recorder)
- [7. แผนการเรียนรู้รวม (Study Roadmap)](#7-แผนการเรียนรู้รวม-study-roadmap)
- [8. เจอปัญหาแล้วทำยังไง (Troubleshooting)](#8-เจอปัญหาแล้วทำยังไง-troubleshooting)
- [9. Checklist สรุป](#9-checklist-สรุป)

---

## ภาพรวม: ทำไมต้องเรียงลำดับนี้

```
Phase 1  แก้บั๊กเล็ก          ← ง่าย ได้ฝึกมือ ได้รู้จักโค้ด ผลเห็นทันที
   ↓
Phase 2  ทดลองวัด + Quality Gate ← "ดูข้อมูลจริงก่อนแก้" + แก้ปัญหาใหญ่สุด (มองไม่เห็นสะโพก = ระบบไม่ทำงาน)
   ↓
Phase 3  Workstation + FPS       ← ทำให้ระบบเบาและเรียบง่ายขึ้น ก่อนจะเพิ่มของใหม่
   ↓
Phase 4  Calibration + Smoothing ← หัวใจของความแม่นยำ (ปรับเข้ากับแต่ละคน)
   ↓
Phase 5  Tests                   ← ล็อกพฤติกรรมที่ถูกต้องไว้ ไม่ให้พังตอนแก้ต่อ
   ↓
Phase 6  issues[] + Dataset      ← เตรียมทางไปสู่การ Train โมเดลเอง
```

หลักคิดสำคัญ: **"วัดให้ถูกก่อน แล้วค่อยฉลาด"** ถ้าตัวเลขที่ระบบวัดได้ยังผิด ต่อให้ใช้ AI ที่เก่งแค่ไหนก็จะได้ผลผิดอยู่ดี

---

# 0. อ่านก่อนเริ่ม

## 0.1 วิธีใช้เอกสารนี้

ทุกขั้นตอนจะมีหัวข้อย่อยเหมือนกันหมด:

| สัญลักษณ์ | ความหมาย |
|---|---|
| 🎯 **เป้าหมาย** | ทำเสร็จแล้วจะได้อะไร |
| 🤔 **ทำไม** | ปัญหาคืออะไร เกิดจากอะไร (ส่วนนี้สำคัญที่สุด อย่าข้าม) |
| 📚 **ศึกษาก่อน** | หัวข้อที่ควรอ่าน/ดูก่อนลงมือ พร้อมลิงก์ |
| 🛠 **ลงมือ** | ขั้นตอนแก้โค้ดทีละจุด |
| ✅ **ตรวจสอบ** | วิธีเช็คว่าทำถูกแล้ว |
| 💾 **บันทึก** | คำสั่ง git commit |
| 🧠 **คำถามทบทวน** | ถามตัวเองหลังทำเสร็จ ถ้าตอบได้ = เข้าใจจริง |

**กฎทอง 5 ข้อ**

1. **ทำทีละขั้น** อย่าข้าม อย่าทำหลายขั้นพร้อมกัน
2. **รันแอปดูผลทุกครั้ง** หลังแก้แต่ละจุด (`npm run dev`)
3. **commit ทุกครั้งที่ขั้นหนึ่งเสร็จและทำงานได้** ถ้าพังจะย้อนกลับได้
4. **อ่านคอมเมนต์ในโค้ด** ทุกบรรทัดที่ขึ้นต้นด้วย `//` คือคำอธิบาย
5. **ติดตรงไหนให้ถาม** (ถาม Claude ได้เลย โดยแปะ error message ทั้งหมดมาด้วย)

**วิธีอ่านโค้ดตัวอย่างแบบ "ก่อน → หลัง"**

เมื่อเห็นแบบนี้:

> **หา** (ในไฟล์ `xxx.ts`):
> ```ts
> โค้ดเดิม
> ```
> **แทนที่ด้วย**:
> ```ts
> โค้ดใหม่
> ```

ให้เปิดไฟล์นั้นใน VS Code กด `Ctrl+F` ค้นหาโค้ดเดิม แล้วแก้ให้เป็นโค้ดใหม่
ถ้าหาไม่เจอ ลองค้นแค่บางคำ (เช่น ชื่อตัวแปร) เพราะช่องว่างอาจไม่ตรงกันเป๊ะ

---

## 0.2 เตรียมเครื่องมือ

### โปรแกรมที่ต้องมี

| โปรแกรม | ใช้ทำอะไร | ตรวจว่ามีแล้ว |
|---|---|---|
| **Node.js** (v20 ขึ้นไป) | รันโปรเจกต์ JavaScript | เปิด terminal พิมพ์ `node -v` |
| **Git** | เก็บประวัติการแก้โค้ด | `git --version` |
| **VS Code** | แก้โค้ด | — |
| **Google Chrome** | รันแอป + ใช้ DevTools ดูค่าต่าง ๆ | — |

### ส่วนขยาย (Extension) ของ VS Code ที่แนะนำ

- **ESLint** หรือ **oxc** — ขีดเส้นใต้โค้ดที่น่าจะผิด
- **Error Lens** — แสดง error ท้ายบรรทัดเลย ไม่ต้องเอาเมาส์ไปชี้
- **GitLens** — ดูว่าบรรทัดไหนแก้เมื่อไหร่

### คำสั่งที่จะใช้บ่อย (พิมพ์ใน terminal ที่โฟลเดอร์โปรเจกต์)

| คำสั่ง | ทำอะไร | ใช้เมื่อไหร่ |
|---|---|---|
| `npm run dev` | เปิดแอปที่ http://localhost:5173 (แก้โค้ดแล้วหน้าเว็บอัปเดตเอง) | ระหว่างแก้โค้ด |
| `npm run build` | ตรวจ type ทั้งโปรเจกต์ + สร้างไฟล์สำหรับใช้งานจริง | **ก่อน commit ทุกครั้ง** |
| `npm run lint` | ตรวจหาโค้ดที่น่าจะผิด | ก่อน commit |
| `npm test` | รัน unit test (มีหลัง Phase 5) | ก่อน commit |
| `Ctrl+C` | หยุดคำสั่งที่กำลังรัน (เช่น หยุด dev server) | — |

### เปิด Chrome DevTools

กด `F12` (หรือคลิกขวา → Inspect) แล้วดูแท็บ:

- **Console** — ดู `console.log` ที่เราใส่ไว้ และ error สีแดง
- **Application → Local Storage** — ดูข้อมูลที่แอปเก็บไว้ในเบราว์เซอร์
- **Performance** — ดูว่าแอปใช้ CPU หนักแค่ไหน (ใช้ใน Phase 3)

---

## 0.3 Git: ตาข่ายนิรภัยของคุณ

Git เปรียบเหมือน **"save game"** ทุกครั้งที่ commit คือการเซฟ ถ้าทำพังก็โหลดเซฟเก่ากลับมาได้

### ก่อนเริ่มแต่ละ Phase: สร้าง branch ใหม่

```bash
git checkout main            # กลับไปที่ branch หลัก
git checkout -b phase-1-bugfix   # สร้าง branch ใหม่ชื่อ phase-1-bugfix และย้ายไปอยู่ที่นั่น
```

> **ทำไมต้องสร้าง branch?** ถ้าทำ Phase ไหนพังทั้ง Phase ก็แค่ทิ้ง branch นั้น `main` ยังสะอาดเหมือนเดิม

### ระหว่างทำ: ดูว่าแก้อะไรไปบ้าง

```bash
git status      # ไฟล์ไหนถูกแก้/เพิ่ม/ลบ
git diff        # ดูรายละเอียดทุกบรรทัดที่แก้ (กด q เพื่อออก)
```

### ทำแต่ละขั้นเสร็จ: commit

```bash
git add -A
git commit -m "แก้ skeleton กระพริบ: เก็บผล pose ล่าสุดไว้วาดซ้ำ"
```

### ทำพัง อยากย้อนกลับ

```bash
git restore src/components/CameraStage.tsx   # ทิ้งการแก้ไฟล์นี้ กลับไปเหมือน commit ล่าสุด
git restore .                                # ทิ้งการแก้ทุกไฟล์ (ระวัง! ย้อนไม่ได้)
```

### ทำ Phase เสร็จ: รวมกลับเข้า main

```bash
git checkout main
git merge phase-1-bugfix
```

📚 **ศึกษาเพิ่ม:** เล่นเกมฝึก git ที่ https://learngitbranching.js.org/ (มีภาษาไทยบางส่วน เลือกภาษาได้มุมขวาล่าง) ทำ "Introduction Sequence" ให้จบก่อนเริ่ม Phase 1

---

## 0.4 ความรู้พื้นฐานที่ควรมีก่อน

ไม่ต้องรู้ทุกอย่างก่อนเริ่ม แต่ควรมี **พื้นฐานขั้นต่ำ** ต่อไปนี้ เรียงตามลำดับที่ควรเรียน:

### ขั้น A — JavaScript พื้นฐาน (จำเป็นมาก)

อ่านที่ https://javascript.info/ ส่วน **Part 1** บทเหล่านี้:

- Variables (`let`, `const`)
- Data types, Comparisons (`===`, `!==`)
- **Logical operators** (`&&`, `||`, `??`) ← จะเจอบ่อยมาก และมีบั๊กจริงในโปรเจกต์ที่เกี่ยวกับเรื่องนี้ (Phase 5)
- Functions, Arrow functions (`(x) => x * 2`)
- Objects, Arrays และ array methods (`map`, `filter`, `includes`, `sort`)
- Destructuring (`const { a, b } = obj`)
- Spread syntax (`{ ...obj }`, `[...arr]`)

### ขั้น B — TypeScript พื้นฐาน

TypeScript = JavaScript + "ระบุชนิดข้อมูล" เพื่อให้ editor เตือนก่อนรันว่าใช้ผิดชนิด

อ่าน https://www.typescriptlang.org/docs/handbook/2/everyday-types.html ให้เข้าใจ:

- `type` กับ `interface` ต่างกันยังไง (ในโปรเจกต์นี้ใช้ทั้งคู่)
- Union types: `'good' | 'bad'`, `number | null`
- `import type { ... }` (โปรเจกต์นี้บังคับใช้ `import type` เวลา import แค่ชนิดข้อมูล)
- Generics เบื้องต้น: `Record<string, number>`, `useRef<number>(0)`

### ขั้น C — React Hooks (จำเป็นมาก)

อ่าน https://react.dev/learn ส่วนเหล่านี้ **ตามลำดับ**:

1. **Describing the UI** → Your First Component, Passing Props
2. **Adding Interactivity** → "State: A Component's Memory"
3. **Escape Hatches** → "Referencing Values with Refs" ← **สำคัญที่สุดสำหรับโปรเจกต์นี้**
4. **Escape Hatches** → "Synchronizing with Effects"

> 💡 **ทำไม `useRef` สำคัญมากในโปรเจกต์นี้?**
> `CameraStage.tsx` ทำงาน ~60 ครั้งต่อวินาที ถ้าเก็บข้อมูลด้วย `useState` ทุกครั้งที่ค่าเปลี่ยน React จะวาดหน้าจอใหม่ 60 ครั้ง/วินาที → ช้ามาก
> จึงเก็บข้อมูลที่เปลี่ยนบ่อยไว้ใน `useRef` (เปลี่ยนค่าแล้ว **ไม่** วาดหน้าจอใหม่) และใช้ `useState` เฉพาะสิ่งที่ต้องแสดงบนจอเท่านั้น

### ขั้น D — Browser APIs ที่โปรเจกต์ใช้

- `requestAnimationFrame` — https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- `localStorage` — https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- Canvas 2D เบื้องต้น — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial

### ขั้น E — คณิตศาสตร์ที่ใช้ (ไม่ยาก)

- **ตรีโกณมิติพื้นฐาน**: `tan`, `atan2` (หามุมจากระยะ x, y) — Khan Academy: https://www.khanacademy.org/math/trigonometry
- **ระยะห่างระหว่าง 2 จุด** (ทฤษฎีบทพีทาโกรัส): `Math.hypot(dx, dy)`
- **ค่ากลาง (median) vs ค่าเฉลี่ย (average)** ต่างกันยังไง

---

## 0.5 แผนที่โค้ด: อะไรอยู่ตรงไหน

```
src/
├── main.tsx                 จุดเริ่มต้น โหลด App
├── App.tsx                  หน้าหลัก: เก็บ settings ทั้งหมด + รายการกล้อง (cameraSlots) สร้าง CameraStage ต่อกล้อง
├── components/
│   ├── CameraStage.tsx      ⭐ หัวใจของระบบ: กล้อง 1 ตัว + AI + วาด skeleton + ตัดสินแจ้งเตือน (ไฟล์ใหญ่สุด ~830 บรรทัด)
│   ├── CameraSourceSelector.tsx  เลือกแหล่งภาพ: กล้องในเครื่อง (USB/built-in) หรือกล้อง IP (MJPEG)
│   ├── SettingsPanel.tsx    แผงปรับค่าความไว (slider) ใช้ร่วมกันทุกกล้อง
│   ├── EventLog.tsx         ตารางประวัติการแจ้งเตือน (รวมทุกกล้อง)
│   └── EnrollmentPanel.tsx  รายชื่อใบหน้าที่ลงทะเบียน (ดึงจาก backend)
├── hooks/
│   ├── usePoseLandmarker.ts โหลดโมเดล AI ท่าทาง (MediaPipe) — กล้องละ 1 ชุด
│   ├── useFaceApiModels.ts  โหลดโมเดล AI ใบหน้า (face-api)
│   └── useCameraDevices.ts  รายชื่อกล้องที่ต่อกับเครื่อง
├── lib/                     ⭐ "สมอง" — ฟังก์ชันคำนวณล้วน ๆ ไม่ยุ่งกับหน้าจอ (ทดสอบง่าย)
│   ├── postureAnalysis.ts   คำนวณมุมคอ/ลำตัว/ไหล่ → ตัดสินท่านั่ง
│   ├── sustainedAlertMachine.ts  ตัดสินว่า "ควรแจ้งเตือนจริงหรือยัง" (ต้องผิดต่อเนื่องนานพอ)
│   ├── breakReminder.ts     จับเวลานั่งต่อเนื่อง
│   ├── fallDetection.ts     คำนวณ "ร่วงตัวเร็ว" สำหรับตรวจหกล้ม
│   ├── fatigueAnalysis.ts   ตาหลับ/หาว
│   ├── distanceAnalysis.ts  ระยะห่างจากจอ
│   └── tracker.ts           จับคู่ "คนในเฟรมนี้" กับ "คนในเฟรมก่อน"
├── services/                ติดต่อโลกภายนอก (localStorage, เสียง, backend ผ่าน apiConfig.ts)
└── types/                   นิยามชนิดข้อมูล (ไม่มี logic)

backend/                     (แยกโปรเจกต์) Node/Express + SQLite เก็บใบหน้าพนักงาน + จับคู่ใบหน้า
                             แผนนี้ "ไม่แตะ" backend เลย — ท่านั่ง/หกล้ม/เตือนพักทำงานได้โดยไม่ต้องรัน backend
```

### ข้อมูลไหลยังไงในแต่ละเฟรม (ต่อกล้อง 1 ตัว)

```
กล้องในเครื่อง (30 เฟรม/วินาที) หรือ กล้อง IP (MJPEG ผ่าน <img>)
   │
   ▼
requestAnimationFrame  ← เรียก detectFrame() ประมาณ 60 ครั้ง/วินาที
   │
   ├─▶ MediaPipe Pose ──▶ 33 จุดบนร่างกาย (landmarks)
   │        │
   │        ▼
   │   postureAnalysis ──▶ มุมคอ, มุมลำตัว, มุมไหล่ ──▶ "good" / "slouching" / ...
   │        │                     │
   │        │                     └──▶ fallDetection: ไหล่ร่วงเร็ว + ลำตัวราบ? ──▶ แจ้งเตือนฉุกเฉินทันที
   │        ▼
   │   sustainedAlertMachine ──▶ ผิดต่อเนื่องครบ 8 วิ? ──▶ แจ้งเตือน (banner + เสียง + ประวัติ)
   │
   └─▶ (ทุก 400ms ถ้าเปิดฟีเจอร์ใบหน้า) face-api ──▶ ตาหลับ? หาว? ใกล้จอ?
                                                  └──▶ ใครนั่งอยู่? (ถาม backend ทุก 3 วิ)
```

> 💡 **หลายกล้อง:** App สร้าง `<CameraStage>` 1 ตัวต่อกล้อง แต่ละตัวมีโมเดล AI, tracker และ state ของตัวเองแยกกันหมด แผนนี้จึงแก้ที่ `CameraStage` ครั้งเดียว แล้วได้ผลกับทุกกล้อง

> 📌 **ทำความรู้จักโค้ดก่อน**: ก่อนเริ่ม Phase 1 ลองเปิดอ่าน `src/lib/postureAnalysis.ts` กับ `src/lib/sustainedAlertMachine.ts` ให้จบ ทั้งสองไฟล์สั้นและมีคอมเมนต์ภาษาไทยอธิบายไว้

---

## 0.6 คำศัพท์ที่จะเจอบ่อย

| คำ | ความหมายแบบง่าย |
|---|---|
| **Landmark** | จุดสำคัญบนร่างกายที่ AI หาเจอ เช่น จมูก หู ไหล่ สะโพก (MediaPipe ให้ 33 จุด) |
| **Normalized coordinates** | พิกัดแบบสัดส่วน 0–1 (0 = ขอบซ้าย/บน, 1 = ขอบขวา/ล่าง) ไม่ใช่หน่วยพิกเซล |
| **Visibility** | AI มั่นใจแค่ไหนว่าเห็นจุดนั้น (0–1) ถ้าต่ำแปลว่าน่าจะถูกบังหรืออยู่นอกเฟรม |
| **Frame / FPS** | ภาพนิ่ง 1 ภาพจากกล้อง / จำนวนภาพต่อวินาที |
| **Inference** | การให้โมเดล AI ประมวลผลภาพ 1 ครั้ง |
| **Threshold** | เส้นแบ่ง เช่น "มุมคอเกิน 25° = ผิด" |
| **Baseline** | ค่าอ้างอิง "ท่าปกติของคนนี้" ไว้เทียบ |
| **Calibration** | การวัดค่า baseline (ให้ผู้ใช้นั่งท่าดีแล้วระบบจำไว้) |
| **Smoothing** | การทำให้ตัวเลขที่สั่นไปมา "เรียบ" ขึ้น |
| **EMA** | Exponential Moving Average วิธี smoothing แบบง่ายที่สุด |
| **State machine** | ตัวจำสถานะ เช่น "ปกติ → เริ่มผิด → แจ้งเตือน → กลับปกติ" |
| **Hysteresis** | ต้องกลับมาปกติสักพักก่อนถึงจะเคลียร์การแจ้งเตือน กันไฟกระพริบติด ๆ ดับ ๆ |
| **Track / trackId** | การติดตามว่า "คนนี้ในเฟรมนี้ = คนเดิมในเฟรมก่อน" |
| **Quality Gate** | ด่านตรวจว่าข้อมูลดีพอที่จะวิเคราะห์ไหม |
| **Pure function** | ฟังก์ชันที่ใส่ input เดิมได้ output เดิมเสมอ ไม่แตะอะไรภายนอก (ทดสอบง่ายมาก) |
| **Unit test** | โค้ดที่เขียนไว้ตรวจว่าฟังก์ชันทำงานถูกต้องโดยอัตโนมัติ |

---

# Phase 1 — แก้บั๊กเล็ก ๆ (อุ่นเครื่อง)

```bash
git checkout -b phase-1-bugfix
```

## ขั้น 1.1 — ลบไฟล์ที่ไม่ได้ใช้แล้ว

🎯 **เป้าหมาย:** ลบไฟล์ "stub" 2 ไฟล์ที่ไม่มีใครใช้ ลดความสับสน

🤔 **ทำไม:** ไฟล์ `src/lib/alertStateMachine.ts` และ `src/components/PostureMonitor.tsx` ข้างในมีแค่ `export {}` และคอมเมนต์บอกเองว่า "ลบทิ้งได้อย่างปลอดภัย" แต่ถ้าปล่อยไว้ คนที่มาอ่านโค้ดทีหลังอาจคิดว่ามันสำคัญ

📚 **ศึกษาก่อน:** การใช้ VS Code ค้นหาทั้งโปรเจกต์ (`Ctrl+Shift+F`)

🛠 **ลงมือ:**

1. **ตรวจก่อนลบเสมอ** — กด `Ctrl+Shift+F` ค้นหาคำว่า `alertStateMachine` แล้วค้นหา `PostureMonitor`
   - ถ้าเจอเฉพาะในไฟล์ตัวเอง กับใน `App.css` (เป็นแค่คอมเมนต์) = ลบได้
   - ถ้าเจอ `import ... from './PostureMonitor'` ที่ไฟล์อื่น = **ห้ามลบ** (แต่จากที่ตรวจแล้ว ไม่มี)
2. ลบไฟล์:
   ```bash
   git rm src/lib/alertStateMachine.ts src/components/PostureMonitor.tsx
   ```
3. เปิด `src/App.css` หาบรรทัด:
   ```css
   /* --- PostureMonitor --- */
   ```
   แก้เป็น:
   ```css
   /* --- CameraStage (กล้อง + overlay) --- */
   ```
   > ⚠️ **ห้ามลบ CSS ข้างใต้** เพราะ class `.posture-monitor`, `.camera-frame` ยังถูกใช้อยู่ใน `CameraStage.tsx` เราแก้แค่คอมเมนต์ให้ชื่อถูก

✅ **ตรวจสอบ:**
```bash
npm run build
```
ต้องไม่มี error สีแดง แล้ว `npm run dev` เปิดแอปดูว่ายังทำงานเหมือนเดิม

💾 **บันทึก:**
```bash
git add -A
git commit -m "ลบไฟล์ stub ที่ไม่ได้ใช้: alertStateMachine.ts, PostureMonitor.tsx"
```

🧠 **คำถามทบทวน:** ทำไมต้องค้นหาก่อนลบ? ถ้าลบไฟล์ที่ยังถูก import อยู่จะเกิดอะไรขึ้นตอน `npm run build`?

---

## ขั้น 1.2 — ปิดฟีเจอร์ใบหน้าเป็นค่าเริ่มต้น + แก้ UI ที่ผูกกันผิด

🎯 **เป้าหมาย:**
- ฟีเจอร์ใบหน้า (face recognition/ความเหนื่อยล้า) **ปิด** เป็นค่าเริ่มต้น
- รายชื่อสถานะท่านั่งของแต่ละคน **แสดงเสมอ** ไม่ว่าจะเปิดฟีเจอร์ใบหน้าหรือไม่
- ตั้งค่า "เตือนพัก" ได้เสมอ และเพิ่ม slider "ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว"

🤔 **ทำไม:**
1. Face recognition เก็บ **ข้อมูลชีวภาพ** (ตาม PDPA เป็นข้อมูลอ่อนไหว) และกินเครื่อง ควรเป็นสิ่งที่ผู้ใช้ "เลือกเปิด" ไม่ใช่เปิดไว้ก่อน (หลักการ *privacy by default*) และตอนนี้ฟีเจอร์ใบหน้าต้องมี **backend รันอยู่** ด้วย ถ้าเปิดไว้แต่ไม่ได้รัน backend จะขึ้น error "เชื่อมต่อ backend ไม่สำเร็จ" ทันทีที่เปิดแอป
2. ใน `App.tsx` รายชื่อ "คนที่ 1 — นั่งท่าดี" (ใต้กล้องแต่ละตัว) ถูกห่อด้วย `faceFeaturesEnabled && ...` ทั้งที่ข้อมูลท่านั่งมาจาก Pose ไม่เกี่ยวกับใบหน้าเลย → ปิดใบหน้าแล้วข้อมูลท่านั่งหายไปด้วย (ผิด)
3. ใน `SettingsPanel.tsx` slider "เตือนพัก" อยู่ในกลุ่มเดียวกับฟีเจอร์ใบหน้า → ปิดใบหน้าแล้วตั้งเวลาพักไม่ได้ (ผิดเช่นกัน)
4. ค่า `breakResetMs` (ลุกไปนานแค่ไหนถึงถือว่าพัก) มีอยู่ใน type แต่ไม่มี slider ให้ปรับ

📚 **ศึกษาก่อน:**
- React: Conditional Rendering — https://react.dev/learn/conditional-rendering (เข้าใจ `{เงื่อนไข && <JSX />}`)
- React: Fragment `<>...</>` คืออะไร

🛠 **ลงมือ:**

**(1) เปลี่ยนค่าเริ่มต้น** — ไฟล์ `src/App.tsx`

**หา:**
```ts
  const [faceFeaturesEnabled, setFaceFeaturesEnabled] = useState(true)
```
**แทนที่ด้วย:**
```ts
  const [faceFeaturesEnabled, setFaceFeaturesEnabled] = useState(false)
```

**(2) แสดงรายชื่อเสมอ** — ไฟล์ `src/App.tsx` (อยู่ใน `cameraSlots.map(...)` ใต้ `<CameraStage ... />`)

**หา:**
```tsx
                  {faceFeaturesEnabled && people.length > 0 && (
```
**แทนที่ด้วย:**
```tsx
                  {people.length > 0 && (
```

**หา:**
```tsx
                  {faceFeaturesEnabled && people.length === 0 && <p className="identity-line">ยังไม่พบคนในเฟรม</p>}
```
**แทนที่ด้วย:**
```tsx
                  {people.length === 0 && <p className="identity-line">ยังไม่พบคนในเฟรม</p>}
```

**(3) ย้ายส่วน "เตือนพัก" ออกมานอกกลุ่มใบหน้า** — ไฟล์ `src/components/SettingsPanel.tsx`

เลื่อนลงไปท้ายไฟล์ **หา:**
```tsx
            onChange={(v) => setDistance('tooCloseRatio', v)}
          />

          <h3>เตือนพัก</h3>
          <Slider
            label="นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก"
            unit=" นาที"
            min={15}
            max={90}
            step={5}
            value={breakThresholds.continuousSittingMs / 60000}
            onChange={(v) => setBreak('continuousSittingMs', v * 60000)}
          />
        </>
      )}
    </div>
```
**แทนที่ด้วย:**
```tsx
            onChange={(v) => setDistance('tooCloseRatio', v)}
          />
        </>
      )}

      <h3>เตือนพัก</h3>
      <Slider
        label="นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก"
        unit=" นาที"
        min={15}
        max={90}
        step={5}
        value={breakThresholds.continuousSittingMs / 60000}
        onChange={(v) => setBreak('continuousSittingMs', v * 60000)}
      />
      <Slider
        label="ลุกไปนานกี่นาทีถึงถือว่าพักแล้ว"
        unit=" นาที"
        min={1}
        max={15}
        step={1}
        value={breakThresholds.breakResetMs / 60000}
        onChange={(v) => setBreak('breakResetMs', v * 60000)}
      />
    </div>
```

> 💡 **สังเกต:** ค่าในโค้ดเก็บเป็น **มิลลิวินาที** (ms) แต่แสดงบนจอเป็น **นาที** จึงต้องหาร 60000 ตอนแสดง และคูณ 60000 ตอนบันทึก (1 นาที = 60 วิ × 1000 ms)

✅ **ตรวจสอบ:**
1. `npm run dev` → เปิดแอปมาครั้งแรก checkbox "เปิดฟีเจอร์เกี่ยวกับใบหน้า" ต้อง **ไม่ถูกติ๊ก**
2. นั่งหน้ากล้อง → ต้องเห็นรายการ "คนที่ 1 — นั่งท่าดี" ใต้วิดีโอ (แม้ใบหน้าจะปิดอยู่)
3. ในแผงตั้งค่า ต้องเห็นหัวข้อ "เตือนพัก" มี 2 slider (แม้ใบหน้าจะปิดอยู่)
4. `npm run build` ผ่าน

> ⚠️ ถ้าข้อ 2 ไม่เห็นรายชื่อ อาจเป็นเพราะกล้องมองไม่เห็นสะโพก ปัญหานี้จะแก้ใน Phase 2 ลองถอยห่างจากกล้องให้เห็นถึงเอวดูก่อน

💾 **บันทึก:**
```bash
git add -A
git commit -m "ปิดฟีเจอร์ใบหน้าเป็นค่าเริ่มต้น, แสดงสถานะท่านั่งเสมอ, ย้าย settings เตือนพักออกจากกลุ่มใบหน้า"
```

🧠 **คำถามทบทวน:** `{a && <X />}` ทำงานยังไง? ถ้า `a` เป็น `false` React จะแสดงอะไร?

---

## ขั้น 1.3 — แก้ Skeleton (โครงร่าง) กระพริบ

🎯 **เป้าหมาย:** เส้นโครงร่างสีฟ้าที่วาดทับตัวเรา ไม่กระพริบ

🤔 **ทำไม — ทำความเข้าใจปัญหา:**

`requestAnimationFrame` (rAF) เรียก `detectFrame()` ตามรอบการวาดจอ ปกติ **60 ครั้ง/วินาที** แต่กล้องส่งภาพมาแค่ **30 ภาพ/วินาที**

ในโค้ดเดิม (`CameraStage.tsx` ใน `detectFrame`):
```ts
let poseResult: PoseLandmarkerResult | null = null     // ← เริ่มเป็น null ทุกรอบ

const shouldProcessPose = ... (!isVideoSource || source.currentTime !== lastVideoTimeRef.current)
if (shouldProcessPose && landmarker) {
  // มีภาพใหม่ → ให้ AI วิเคราะห์
  poseResult = landmarker.detectForVideo(...)
}
// ...
drawOverlay(ctx, poseResult, ...)   // ← ล้างจอ แล้ววาด poseResult
```

> 💡 ปัญหานี้เกิดกับ **กล้องในเครื่อง** (video) เท่านั้น ส่วนกล้อง IP ตอนนี้รัน AI ทุกรอบอยู่แล้วจึงไม่กระพริบ (แต่หนักเครื่องมาก ซึ่งจะแก้ใน Phase 3 และพอแก้แล้ว กล้อง IP ก็จะกระพริบเหมือนกันถ้าไม่ได้แก้ขั้นนี้ก่อน)

ไล่ดูทีละรอบ:

| รอบ rAF | มีภาพกล้องใหม่? | poseResult | ผลบนจอ |
|---|---|---|---|
| 1 | ✅ | มีข้อมูล | วาด skeleton |
| 2 | ❌ (ภาพเดิม) | **null** | **ล้างจอ ไม่วาดอะไร** |
| 3 | ✅ | มีข้อมูล | วาด skeleton |
| 4 | ❌ | **null** | **ล้างจอ** |

→ skeleton โผล่-หาย-โผล่-หาย = **กระพริบ**

**วิธีแก้:** จำผลล่าสุดไว้ใน `useRef` แล้ววาดผลล่าสุดเสมอ (ถึงรอบนี้จะไม่มีผลใหม่ก็วาดของเดิม)

📚 **ศึกษาก่อน:**
- https://react.dev/learn/referencing-values-with-refs — ทำไมใช้ `useRef` ไม่ใช้ `useState`
- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame

🛠 **ลงมือ:** ไฟล์ `src/components/CameraStage.tsx`

**(1) เพิ่ม ref เก็บผลล่าสุด** — **หา:**
```ts
  const lastVideoTimeRef = useRef(-1)
```
**แทนที่ด้วย:**
```ts
  const lastVideoTimeRef = useRef(-1)
  // ผล pose ล่าสุด เก็บค้างไว้วาดซ้ำในรอบ rAF ที่ยังไม่มีเฟรมวิดีโอใหม่ (กัน skeleton กระพริบ)
  const latestPoseResultRef = useRef<PoseLandmarkerResult | null>(null)
```

**(2) บันทึกผลทุกครั้งที่ได้ผลใหม่** — (อยู่ใน `try { ... }`) **หา:**
```ts
        poseResult = landmarker.detectForVideo(source, performance.now())
```
**แทนที่ด้วย:**
```ts
        poseResult = landmarker.detectForVideo(source, performance.now())
        latestPoseResultRef.current = poseResult
```

**(3) ล้างผลเก่าตอนเปลี่ยนกล้อง** — ไม่งั้น skeleton ของกล้องตัวก่อนจะค้างอยู่บนจอจนกว่ากล้องใหม่จะได้ผลแรก **หา:**
```ts
      sourceErrorStickyRef.current = false
      setCameraError(null)
```
**แทนที่ด้วย:**
```ts
      sourceErrorStickyRef.current = false
      latestPoseResultRef.current = null // ไม่วาด skeleton ค้างจากกล้องตัวก่อน
      setCameraError(null)
```

**(4) วาดจากผลล่าสุด** — **หา:**
```ts
    if (ctx) drawOverlay(ctx, poseResult, canvas.width, canvas.height)
```
**แทนที่ด้วย:**
```ts
    if (ctx) drawOverlay(ctx, latestPoseResultRef.current, canvas.width, canvas.height)
```

✅ **ตรวจสอบ:** `npm run dev` → ขยับตัวช้า ๆ เส้นสีฟ้าต้องนิ่ง ไม่กระพริบ (ถ้าเดิมไม่เห็นกระพริบชัด ลองดูตอนเครื่องทำงานหนัก ๆ หรือเปิดหลายแท็บ)

💾 **บันทึก:**
```bash
git add -A
git commit -m "แก้ skeleton กระพริบ: เก็บผล pose ล่าสุดไว้วาดซ้ำ"
```

🧠 **คำถามทบทวน:**
1. ถ้าเราใช้ `useState` แทน `useRef` เก็บ `latestPoseResult` จะเกิดอะไรขึ้นกับความเร็วของแอป?
2. ทำไมต้องตั้ง `latestPoseResultRef.current = null` ตอนเปลี่ยนกล้อง?

---

## ขั้น 1.4 — แก้ตัวจับเวลาเตือนพัก (Break Timer)

🎯 **เป้าหมาย:** ลุกไปแป๊บเดียว (เช่น 10 วินาที) แล้วกลับมา → ระบบยังนับเวลานั่งต่อจากเดิม ต้องลุกไปนานเกิน "เวลาที่ตั้งไว้" (ค่าเริ่มต้น 3 นาที) ถึงจะเริ่มนับใหม่

🤔 **ทำไม — บั๊กนี้มี 2 ชั้น:**

**ชั้นที่ 1:** ตัวจับเวลาเตือนพักถูกเก็บไว้ "ในตัวคน" (`PersonState.breakState`) แต่ระบบ tracking จะ **ลบคนทิ้ง** ถ้าหายจากเฟรมเกิน 4 วินาที (`POSE_TRACK_STALE_MS = 4000`) → ตัวจับเวลาหายไปด้วย

```
นั่ง 40 นาที → ก้มเก็บของ 5 วินาที → track ถูกลบ → กลับมา = คนใหม่ → นับ 0 ใหม่ 😱
```

**ชั้นที่ 2:** ค่า `breakResetMs` (3 นาที) **ไม่มีโค้ดไหนใช้เลย** และในไฟล์ `breakReminder.ts` เมื่อ `isPresent = false` ฟังก์ชันแค่ return ออกไป มีคอมเมนต์อ้างถึงไฟล์ `useBreakTracking.ts` ซึ่ง **ไม่มีอยู่จริง** (น่าจะวางแผนไว้แต่ไม่ได้ทำ)

**วิธีแก้:**
1. ให้ `breakReminder.ts` จำ "เห็นคนครั้งล่าสุดเมื่อไหร่" (`lastPresentAtMs`) แล้วรีเซ็ตเมื่อหายไปนานเกิน `breakResetMs`
2. ย้ายตัวจับเวลาออกจาก "ตัวคน" ไปเป็นระดับ "กล้อง" (ถามแค่ว่า "ตอนนี้มีใครนั่งหน้ากล้องนี้ไหม") ไม่ผูกกับ track ถ้าต่อ 2 กล้อง แต่ละกล้องจะมีตัวจับเวลาของตัวเอง เพราะแต่ละ `CameraStage` แยกกัน

📚 **ศึกษาก่อน:**
- อ่าน `src/lib/breakReminder.ts` เดิมให้เข้าใจก่อน
- แนวคิด **pure function** + **immutable update** (`const state = { ...prev }` คือการก๊อปของเดิมมาแก้ ไม่แก้ของเดิมโดยตรง) — https://react.dev/learn/updating-objects-in-state

🛠 **ลงมือ:**

**(1) เพิ่มช่องเก็บ "เห็นครั้งล่าสุด"** — ไฟล์ `src/types/wellbeing.ts`

**หา:**
```ts
  continuousSinceMs: number | null
  /** แจ้งเตือน
```
**แทนที่ด้วย:**
```ts
  continuousSinceMs: number | null
  /** เวลาล่าสุดที่ยังเห็นคนอยู่หน้าจอ (epoch ms) — ใช้คำนวณว่าหายไปนานแค่ไหนแล้ว */
  lastPresentAtMs: number | null
  /** แจ้งเตือน
```

**(2) เขียน `src/lib/breakReminder.ts` ใหม่ทั้งไฟล์** (ลบของเดิมทั้งหมด วางอันนี้แทน):

```ts
// ตัวจับเวลา "นั่งต่อเนื่องนานแค่ไหน" ไม่เกี่ยวกับท่านั่งถูก/ผิด — แค่เตือนให้ลุกพักเป็นระยะ
// ทำงานอิสระจากโมดูลอื่น ใช้แค่สัญญาณ "ตอนนี้มีคนอยู่หน้าจอไหม" (reuse จาก pose detection ที่มีอยู่แล้ว)
//
// กติกา:
//   - มีคนอยู่หน้าจอ → นับเวลานั่งต่อเนื่อง
//   - หายไป "ไม่นาน" (น้อยกว่า breakResetMs) → ยังถือว่านั่งรอบเดิม (เช่น ก้มเก็บของ, หันไปคุยแป๊บเดียว)
//   - หายไป "นานพอ" (ตั้งแต่ breakResetMs ขึ้นไป) → ถือว่าลุกไปพักแล้ว รีเซ็ตตัวนับ

import type { BreakReminderState, BreakThresholds } from '../types/wellbeing'

export const initialBreakState: BreakReminderState = {
  continuousSinceMs: null,
  lastPresentAtMs: null,
  reminderFiredForCurrentSession: false,
}

export interface BreakStepResult {
  state: BreakReminderState
  /** true เฉพาะเฟรมที่เพิ่งครบเวลาและควรแสดงการแจ้งเตือน (edge-triggered ไม่ซ้ำทุกเฟรม) */
  shouldRemind: boolean
  /** นาทีที่นั่งต่อเนื่องมา ใช้แสดงผลในหน้าเว็บ */
  continuousMinutes: number
}

export function stepBreakReminder(
  prev: BreakReminderState,
  isPresent: boolean,
  now: number,
  thresholds: BreakThresholds,
): BreakStepResult {
  const state: BreakReminderState = { ...prev }

  if (!isPresent) {
    // ไม่เห็นใครเลย — ถ้าหายไปนานเกิน breakResetMs ถือว่าพักแล้ว รีเซ็ตทั้งหมด
    if (state.lastPresentAtMs !== null && now - state.lastPresentAtMs >= thresholds.breakResetMs) {
      return { state: resetBreakTimer(), shouldRemind: false, continuousMinutes: 0 }
    }
    // ยังหายไปไม่นาน — เก็บ state เดิมไว้ ไม่รีเซ็ต
    return { state, shouldRemind: false, continuousMinutes: minutesSince(state.continuousSinceMs, now) }
  }

  state.lastPresentAtMs = now

  if (state.continuousSinceMs === null) {
    state.continuousSinceMs = now
    state.reminderFiredForCurrentSession = false
  }

  const elapsedMs = now - state.continuousSinceMs

  let shouldRemind = false
  if (elapsedMs >= thresholds.continuousSittingMs && !state.reminderFiredForCurrentSession) {
    state.reminderFiredForCurrentSession = true
    shouldRemind = true
  }

  return { state, shouldRemind, continuousMinutes: minutesSince(state.continuousSinceMs, now) }
}

function minutesSince(sinceMs: number | null, now: number): number {
  return sinceMs === null ? 0 : Math.floor((now - sinceMs) / 60000)
}

/** รีเซ็ตตัวนับ เรียกเมื่อผู้ใช้หายไปจากกล้องนานเกิน breakResetMs (ถือว่าลุกไปพักแล้ว) */
export function resetBreakTimer(): BreakReminderState {
  return { ...initialBreakState }
}
```

> 💡 **อ่านโค้ดให้เข้าใจ:** สังเกตว่าเราใช้ `!== null` ไม่ใช่ `if (state.lastPresentAtMs)` เฉย ๆ เพราะถ้าค่าเป็น `0` JavaScript จะถือว่าเป็น "เท็จ" (falsy) ทั้งที่จริงคือ "มีค่า = เวลา 0" (เรื่องนี้จะเจออีกครั้งใน Phase 5)

**(3) ย้ายตัวจับเวลาไประดับกล้อง** — ไฟล์ `src/components/CameraStage.tsx`

**(3a)** ลบช่อง `breakState` ออกจาก `PersonState` — **หา** แล้ว **ลบบรรทัดนี้ทิ้ง:**
```ts
  breakState: BreakReminderState
```

**(3b)** ลบค่าเริ่มต้นตอนสร้างคนใหม่ — **หา** แล้ว **ลบบรรทัดนี้ทิ้ง:**
```ts
            breakState: initialBreakState,
```

**(3c)** เพิ่ม ref ตัวจับเวลาระดับกล้อง — **หา** (ที่เพิ่งเพิ่มในขั้น 1.3):
```ts
  const latestPoseResultRef = useRef<PoseLandmarkerResult | null>(null)
```
**แทนที่ด้วย:**
```ts
  const latestPoseResultRef = useRef<PoseLandmarkerResult | null>(null)
  // ตัวจับเวลาเตือนพักระดับ "กล้องตัวนี้" — แยกจาก track ของแต่ละคน เพราะ track ถูกลบภายใน 4 วิเมื่อหายจากเฟรม
  const deskBreakStateRef = useRef<BreakReminderState>(initialBreakState)
```

**(3d)** เปลี่ยนจุดเรียกตัวจับเวลา — **หา** (อยู่ท้ายสุดของ loop `for (const match of matches)` ต่อจาก `if (step.endedEvent) p.onAlertEnd(step.endedEvent)`):
```ts

        // เตือนพัก: ถือว่า "อยู่หน้าจอ" ตราบเท่าที่ track นี้ยังถูกตรวจพบอยู่ในเฟรม — ถ้าหายไปนานพอ
        // track จะถูกลบไปเองข้างบนแล้ว รอบหน้าที่กลับมาจะเริ่มนับเวลานั่งต่อเนื่องใหม่ (เทียบเท่า "พักแล้ว")
        const breakStep = stepBreakReminder(person.breakState, true, now, p.breakThresholds)
        person.breakState = breakStep.state
        if (breakStep.shouldRemind) {
          p.onBreakDue(label, breakStep.continuousMinutes)
          if (p.soundEnabled) playAlertBeep()
        }
      }
```
**แทนที่ด้วย:**
```ts
      }

      // เตือนพัก: นับระดับกล้อง "มีใครอยู่หน้ากล้องนี้ไหม" — หายไปไม่ถึง breakResetMs ยังนับเป็นรอบนั่งเดิม
      const breakStep = stepBreakReminder(deskBreakStateRef.current, matches.length > 0, now, p.breakThresholds)
      deskBreakStateRef.current = breakStep.state
      if (breakStep.shouldRemind) {
        p.onBreakDue(p.multiCameraMode ? `คนที่นั่งหน้า${p.cameraLabel}` : 'คุณ', breakStep.continuousMinutes)
        if (p.soundEnabled) playAlertBeep()
      }
```

> 💡 **สังเกตวงเล็บปีกกา `}`:** โค้ดใหม่อยู่ **นอก** loop `for` (หลัง `}` ที่ปิด loop) เพราะเราเรียกครั้งเดียวต่อเฟรม ไม่ใช่ครั้งเดียวต่อคน
> `matches.length > 0` = "เฟรมนี้เจอคนอย่างน้อย 1 คน"
> ข้อความเตือนจะเป็น "คุณนั่งต่อเนื่องมาแล้ว..." หรือถ้าต่อหลายกล้องจะเป็น "คนที่นั่งหน้ากล้อง 1 นั่งต่อเนื่องมาแล้ว..." (ตัวแปร `label` ใน loop ยังใช้อยู่กับท่านั่งและหกล้ม จึงไม่ต้องลบ)

✅ **ตรวจสอบ:**
1. `npm run build` ผ่าน
2. **ทดสอบจริงแบบเร็ว:** ตั้ง slider "นั่งต่อเนื่องกี่นาทีถึงเตือนให้พัก" เป็นค่าต่ำสุด (15 นาที) ถ้าไม่อยากรอ ให้แก้ชั่วคราวใน `src/types/wellbeing.ts`:
   ```ts
   continuousSittingMs: 1 * 60 * 1000, // ทดสอบ: 1 นาที (อย่าลืมแก้กลับเป็น 45!)
   ```
   - นั่ง 30 วิ → ลุกออกจากกล้อง 10 วิ → กลับมานั่ง → ต้องเตือนประมาณวินาทีที่ 60 นับจากเริ่ม (ไม่ใช่เริ่มนับใหม่)
   - **อย่าลืมแก้ค่ากลับเป็น 45 นาทีก่อน commit**

💾 **บันทึก:**
```bash
git add -A
git commit -m "แก้ break timer: ใช้ breakResetMs จริง และแยกตัวจับเวลาออกจาก track lifetime"
```

🧠 **คำถามทบทวน:**
1. ทำไมตัวจับเวลาที่ผูกกับ track ถึงหายไปเมื่อเราลุกแค่ 5 วินาที?
2. ข้อเสียของการทำตัวจับเวลา "ระดับกล้อง" ในโหมดหลายคนคืออะไร? (ใบ้: ถ้า 2 คนนั่งสลับกัน)

---

## ขั้น 1.5 — แก้การแจ้งเตือน "หกล้มแล้วหายไปจากเฟรม" ที่ไม่มีวันทำงาน

🎯 **เป้าหมาย:** ถ้าคนร่วงตัวลงเร็ว ๆ แล้วหลุดออกจากมุมกล้องไปเลย (เช่น ตกจากเก้าอี้ไปด้านหลัง) ระบบต้องแจ้งเตือน `fall_suspected_left_frame` ได้จริง

🤔 **ทำไม — ไล่ timeline ดู:**

โค้ดเดิม (ตอนลบคนที่หายไปจากเฟรม):
```ts
if (person.lastRapidDropAt > 0 && now - person.lastRapidDropAt <= p.fallThresholds.disappearGraceMs) {
  // แจ้งเตือน "หกล้มแล้วหายไปจากเฟรม"
}
```

| เวลา | เหตุการณ์ |
|---|---|
| 0.0 วิ | ร่วงตัวเร็ว → `lastRapidDropAt = 0.0` |
| 0.3 วิ | หลุดออกจากเฟรม (เห็นครั้งสุดท้าย) |
| 4.3 วิ | tracker ลบคนนี้ (หายไปเกิน `POSE_TRACK_STALE_MS = 4000`) → โค้ดข้างบนถูกเรียก **ตอนนี้** |
| | `now - lastRapidDropAt` = 4.3 วิ > `disappearGraceMs` = 2.5 วิ → **ไม่แจ้งเตือน** ❌ |

กว่าโค้ดนี้จะถูกเรียก เวลาก็ผ่านไป **อย่างน้อย 4 วินาทีเสมอ** แต่ค่าเริ่มต้นยอมแค่ 2.5 วินาที → เงื่อนไขนี้ **เป็นจริงไม่ได้เลย** (เว้นแต่ผู้ใช้จะลาก slider ไปเกิน 4 วินาทีเอง)

**วิธีแก้:** สิ่งที่ต้องการถามจริง ๆ คือ "ร่วงตัว **แล้วหายไปภายในกี่วินาที**" จึงต้องเทียบกับ **เวลาที่เห็นครั้งสุดท้าย** ไม่ใช่ `now`

```
lastSeenAt − lastRapidDropAt = 0.3 วิ  ≤  2.5 วิ  → แจ้งเตือน ✓
```

> ⚠️ **ข้อจำกัดที่ยังเหลือ:** การแจ้งเตือนนี้จะมาช้าประมาณ 4 วินาที (รอ tracker ลบคนก่อน) ถ้าอยากให้เร็วขึ้น ต้องเช็คทุกเฟรมว่า "คนที่เพิ่งร่วงตัวหายไปเกิน 1 วินาทีหรือยัง" ซึ่งซับซ้อนกว่า เก็บไว้เป็นแบบฝึกหัดหลังจบ Phase 5

📚 **ศึกษาก่อน:** อ่าน `src/lib/fallDetection.ts` (สั้นมาก) และส่วน `// --- Fall detection` ใน `CameraStage.tsx` ให้เข้าใจว่า `lastRapidDropAt` ถูกตั้งค่าเมื่อไหร่

🛠 **ลงมือ:** ไฟล์ `src/components/CameraStage.tsx`

**(1)** เพิ่มช่อง `lastSeenAt` ใน `PersonState` — **หา:**
```ts
  lastRapidDropAt: number
}
```
**แทนที่ด้วย:**
```ts
  lastRapidDropAt: number
  /** เวลาที่เห็นคนนี้ในเฟรมครั้งล่าสุด (ms, Date.now()) — ใช้เทียบกับ lastRapidDropAt ตอน track หลุด */
  lastSeenAt: number
}
```

**(2)** แก้เงื่อนไข — **หา:**
```ts
        if (person.lastRapidDropAt > 0 && now - person.lastRapidDropAt <= p.fallThresholds.disappearGraceMs) {
```
**แทนที่ด้วย:**
```ts
        // เทียบกับ "เวลาที่เห็นครั้งสุดท้าย" ไม่ใช่ now — เพราะกว่า track จะถูกลบก็ผ่านไปแล้วอย่างน้อย POSE_TRACK_STALE_MS
        if (person.lastRapidDropAt > 0 && person.lastSeenAt - person.lastRapidDropAt <= p.fallThresholds.disappearGraceMs) {
```

**(3)** ค่าเริ่มต้นตอนสร้างคนใหม่ — **หา:**
```ts
            lastRapidDropAt: 0,
          }
```
**แทนที่ด้วย:**
```ts
            lastRapidDropAt: 0,
            lastSeenAt: now,
          }
```

**(4)** อัปเดตทุกเฟรมที่เห็นคนนี้ — **หา:**
```ts
        const left = landmarks[11]
        const right = landmarks[12]
        const normalizedTorsoY
```
**แทนที่ด้วย:**
```ts
        person.lastSeenAt = now

        const left = landmarks[11]
        const right = landmarks[12]
        const normalizedTorsoY
```

✅ **ตรวจสอบ:**
1. `npm run build` ผ่าน
2. **ทดสอบจริง (ระวังตัวด้วย!):** ไม่ต้องล้มจริง ให้ยืนหน้ากล้อง แล้ว **ย่อตัว/ก้มลงเร็ว ๆ จนหลุดเฟรมด้านล่าง** แล้วอยู่นอกเฟรมสัก 5 วินาที → ต้องขึ้น banner สีแดง "สงสัยว่า ... หกล้ม/ตกจากเก้าอี้ แล้วหายไปจากมุมกล้องกะทันหัน"
3. ลองลุกเดินออกจากกล้องตามปกติ (ไม่ร่วงตัว) → ต้อง **ไม่** แจ้งเตือน

💾 **บันทึก:**
```bash
git add -A
git commit -m "แก้ fall_suspected_left_frame: เทียบเวลาร่วงตัวกับเวลาที่เห็นครั้งสุดท้าย แทน now"
git checkout main
git merge phase-1-bugfix
```

🧠 **คำถามทบทวน:** บั๊กนี้เป็นบั๊กประเภทที่ "test ด้วยมือ" แทบไม่มีทางเจอ เพราะต้องล้มจริงถึงจะรู้ ทำไมการ "ไล่ timeline บนกระดาษ" ถึงช่วยหาบั๊กแบบนี้ได้?

---

# Phase 2 — ทดลองวัดจริง + Quality Gate

```bash
git checkout -b phase-2-quality-gate
```

## ขั้น 2.1 — ทดลองดูข้อมูลจริงก่อนแก้ (สำคัญมาก!)

🎯 **เป้าหมาย:** เห็นด้วยตาตัวเองว่า AI "เห็น" อะไรบ้าง และเจอบั๊กที่ซ่อนอยู่ 2 ตัว

🤔 **ทำไม:** นักพัฒนาที่ดี **ไม่เดา** ว่าปัญหาคืออะไร แต่ **วัด** ก่อน
ผมสงสัยว่ามีปัญหา 2 ข้อ ขั้นนี้คือการพิสูจน์:

- **สมมติฐาน A:** กล้องโน้ตบุ๊กมักมองไม่เห็นสะโพก (โต๊ะบัง) และโค้ดเดิม **บังคับ** ต้องเห็นสะโพก ไม่งั้นถือว่า "ไม่พบคน" → ระบบแทบไม่ทำงานเลย (ท่านั่ง, เตือนพัก, ความเหนื่อยล้า, **หกล้ม** ล้มหมด เพราะทุกอย่างพึ่ง pose)
- **สมมติฐาน B:** การคำนวณ "ไหล่เอียง" อาจได้ค่า ~180° แทนที่จะเป็น ~0° เมื่อนั่งตรง เพราะสำหรับกล้องหน้า "ไหล่ซ้าย" ของเราจะอยู่ **ฝั่งขวาของภาพ** ทำให้สูตร `atan2(dy, dx)` ได้ค่า dx ติดลบ

📚 **ศึกษาก่อน:**
- Chrome DevTools Console: https://developer.chrome.com/docs/devtools/console
- `console.log` และ `console.table`
- ภาพ 33 จุดของ MediaPipe Pose (ดูเลข index ของแต่ละจุด): https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
  - จำไว้: `0` = จมูก, `7/8` = หูซ้าย/ขวา, `11/12` = ไหล่ซ้าย/ขวา, `23/24` = สะโพกซ้าย/ขวา

🛠 **ลงมือ:** ไฟล์ `src/components/CameraStage.tsx` (**โค้ดชั่วคราว** จะลบทิ้งท้ายขั้น)

**(1)** **หา:**
```ts
  const lastVideoTimeRef = useRef(-1)
```
**แทนที่ด้วย:**
```ts
  const lastVideoTimeRef = useRef(-1)
  const lastDebugLogAtRef = useRef(0) // DEBUG ชั่วคราว
```

**(2)** (อยู่ใน `try { ... }` ที่แก้ในขั้น 1.3) **หา:**
```ts
        latestPoseResultRef.current = poseResult
```
**แทนที่ด้วย:**
```ts
        latestPoseResultRef.current = poseResult

        // DEBUG ชั่วคราว: ดูค่า visibility ของจุดสำคัญ วินาทีละครั้ง (ลบออกเมื่อทดลองเสร็จ)
        const debugLm = poseResult.landmarks[0]
        if (debugLm && now - lastDebugLogAtRef.current > 1000) {
          lastDebugLogAtRef.current = now
          const v = (i: number) => (debugLm[i]?.visibility ?? 0).toFixed(2)
          console.table({ หูซ้าย: v(7), หูขวา: v(8), ไหล่ซ้าย: v(11), ไหล่ขวา: v(12), สะโพกซ้าย: v(23), สะโพกขวา: v(24) })
          console.log('ไหล่ซ้าย x =', debugLm[11]?.x.toFixed(2), '| ไหล่ขวา x =', debugLm[12]?.x.toFixed(2))
          console.log('ผลวิเคราะห์:', analyzePosture(debugLm, p.postureThresholds))
        }
```

> 💡 ถ้าต่อ 2 กล้อง log จะออกจากทั้ง 2 กล้องปนกัน ให้ทดลองด้วยกล้องเดียวก่อน

**(3)** `npm run dev` → เปิดแอป → กด `F12` → แท็บ **Console**

**(4) ทดลองและจดผลลงตาราง** (ก๊อปตารางนี้ไปจดในโน้ต):

| การทดลอง | visibility สะโพก (23/24) | ไหล่ซ้าย x มากกว่าไหล่ขวา x? | shoulderTiltDeg | issue ที่ได้ |
|---|---|---|---|---|
| นั่งตรง ปกติ ตำแหน่งทำงานจริง | | | | |
| ถอยห่างให้เห็นถึงเอว | | | | |
| ก้มหน้าดูมือถือ | | | | |
| เอียงตัวไปทางซ้าย | | | | |
| (ถ้ามี) กล้อง IP ตั้งไกล ๆ เห็นทั้งตัว | | | | |

**สิ่งที่น่าจะเห็น** (ถ้าสมมติฐานถูก):
- ตำแหน่งทำงานจริง: visibility สะโพก **ต่ำกว่า 0.5** → `issue: 'no_person'`
- `ไหล่ซ้าย x` **มากกว่า** `ไหล่ขวา x` (เช่น 0.62 vs 0.38)
- นั่งตรงแล้ว `shoulderTiltDeg` ได้ประมาณ **170–180** แทนที่จะเป็น 0–5 → ระบบตอบ `leaning` (เอียงข้าง) ทั้งที่นั่งตรง

> 🎓 **บทเรียน:** ถ้าไม่ลองวัดจริง เราอาจไปเสียเวลาปรับ threshold หรือ Train AI ทั้งที่ปัญหาจริงคือสูตรคณิตศาสตร์ผิด 1 บรรทัด

**(5) ลบโค้ด DEBUG ทั้งหมดออก** (ทั้ง `lastDebugLogAtRef` และบล็อก `// DEBUG ชั่วคราว`) หรือใช้:
```bash
git restore src/components/CameraStage.tsx
```

> 📝 **ไม่ต้อง commit ขั้นนี้** เพราะเป็นแค่การทดลอง แต่ **เก็บตารางผลการทดลองไว้** จะใช้เทียบหลังแก้เสร็จ

🧠 **คำถามทบทวน:** ถ้ากล้องตั้งอยู่ด้านข้าง (มองเห็นเราจากด้านข้าง) ค่า x ของไหล่ซ้าย/ขวาจะเป็นยังไง?

---

## ขั้น 2.2 — แก้สูตรมุมไหล่เอียง

🎯 **เป้าหมาย:** นั่งตรงแล้วได้ `shoulderTiltDeg` ≈ 0°

🤔 **ทำไม:** สูตรเดิม:
```ts
const dx = right.x - left.x   // กล้องหน้า: ไหล่ขวาอยู่ซ้ายของภาพ → dx ติดลบ!
const dy = right.y - left.y
const rad = Math.atan2(dy, dx) // atan2(0, ติดลบ) = 180°
```

ลองนึกภาพ: `atan2(dy, dx)` คือ "มุมของลูกศรที่ชี้จากจุด left ไปจุด right เทียบกับแกน x" ถ้าลูกศรชี้ไปทาง **ซ้าย** มุมจะเป็น ~180° ไม่ใช่ 0°

**วิธีแก้:** เราสนใจแค่ "เส้นไหล่เอียงจากแนวนอนกี่องศา" ไม่สนว่าชี้ซ้ายหรือขวา → ใช้ค่าสัมบูรณ์ (`Math.abs`) ของทั้ง dx และ dy ผลจะอยู่ระหว่าง 0°–90° เสมอ

📚 **ศึกษาก่อน:**
- `Math.atan2(y, x)` — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atan2
- ลองเล่นใน Console: พิมพ์ `Math.atan2(0, 1) * 180 / Math.PI` (ได้ 0) แล้ว `Math.atan2(0, -1) * 180 / Math.PI` (ได้ 180)

🛠 **ลงมือ:** ไฟล์ `src/lib/postureAnalysis.ts`

**หา:**
```ts
/** มุมเอียงของเส้นไหล่ซ้าย-ขวา เทียบแนวนอน */
function shoulderTilt(left: Point, right: Point): number {
  const dx = right.x - left.x
  const dy = right.y - left.y
  const rad = Math.atan2(dy, dx)
  return Math.abs((rad * 180) / Math.PI)
}
```
**แทนที่ด้วย:**
```ts
/** มุมเอียงของเส้นไหล่ซ้าย-ขวา เทียบแนวนอน (0 = ไหล่ตรง) — ใช้ค่าสัมบูรณ์ทั้ง dx, dy
 *  เพื่อไม่ให้ผลขึ้นกับว่าไหล่ซ้ายอยู่ฝั่งซ้ายหรือขวาของภาพ (กล้องหน้าภาพจะกลับด้าน) */
function shoulderTilt(left: Point, right: Point): number {
  const dx = Math.abs(right.x - left.x)
  const dy = Math.abs(right.y - left.y)
  const rad = Math.atan2(dy, dx)
  return (rad * 180) / Math.PI
}
```

✅ **ตรวจสอบ:** `npm run build` ผ่าน (การทดสอบจริงจะทำรวมท้ายขั้น 2.3)

💾 **บันทึก:**
```bash
git add -A
git commit -m "แก้สูตรมุมไหล่เอียง: ใช้ค่าสัมบูรณ์ ไม่ให้ได้ ~180° เมื่อไหล่ซ้ายอยู่ขวาของภาพ"
```

---

## ขั้น 2.3 — Quality Gate: ทำงานได้แม้มองไม่เห็นสะโพก

🎯 **เป้าหมาย:**
- เห็นแค่ **หัว + ไหล่** ก็วิเคราะห์ได้ (โหมด "upper body")
- ถ้าไม่เห็นสะโพก → ไม่ตรวจ "หลังค่อม" (เพราะวัดไม่ได้) แต่ยังตรวจ "ยื่นคอ" และ "เอียงข้าง" ได้
- บนจอแสดงว่า "(เห็นแค่ช่วงบน)" ให้ผู้ใช้รู้

🤔 **ทำไม:** โค้ดเดิม:
```ts
if (!shoulderMid || !hipMid || !headPoint) {
  return { issue: 'no_person', ... }   // ← ไม่เห็นสะโพก = ไม่มีคน!
}
```
นี่คือเหตุผลที่ระบบแทบไม่ทำงานกับกล้องโน้ตบุ๊ก

**Quality Gate** = ด่านตรวจคุณภาพข้อมูล แทนที่จะตัดสินแบบ "มี/ไม่มีคน" เราจะแบ่งเป็นระดับ:

```
เห็นหัว + ไหล่ + สะโพก  →  full_body   (ตรวจได้ทุกอย่าง)
เห็นหัว + ไหล่           →  upper_body  (ตรวจคอ + ไหล่ได้, ข้ามมุมลำตัว)
ไม่เห็นหัวหรือไหล่        →  no_person   (ไม่วิเคราะห์)
```

📚 **ศึกษาก่อน:**
- TypeScript: `number | null` และการเช็ค `!== null` — https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- Nullish coalescing `??` — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing

🛠 **ลงมือ:**

**(1) ไฟล์ `src/lib/postureAnalysis.ts`** — เปลี่ยน type ของผลลัพธ์

**หา:**
```ts
export interface PostureAngles {
  neckAngleDeg: number
  torsoAngleDeg: number
  shoulderTiltDeg: number
}

export interface PostureAnalysisResult extends PostureAngles {
  issue: PostureIssueType
}
```
**แทนที่ด้วย:**
```ts
/** คุณภาพของสัญญาณ pose: เห็นทั้งตัว (มีสะโพก) / เห็นแค่ช่วงบน (หัว+ไหล่) */
export type PoseQuality = 'full_body' | 'upper_body'

export interface PostureAngles {
  neckAngleDeg: number
  /** null = มองไม่เห็นสะโพก วัดมุมลำตัวไม่ได้ */
  torsoAngleDeg: number | null
  shoulderTiltDeg: number
}

export interface PostureAnalysisResult extends PostureAngles {
  issue: PostureIssueType
  quality: PoseQuality
}

const NO_PERSON: PostureAnalysisResult = {
  issue: 'no_person',
  quality: 'upper_body',
  neckAngleDeg: 0,
  torsoAngleDeg: null,
  shoulderTiltDeg: 0,
}
```

**(2)** **หา:**
```ts
  if (!landmarks || landmarks.length < 25) {
    return { issue: 'no_person', neckAngleDeg: 0, torsoAngleDeg: 0, shoulderTiltDeg: 0 }
  }
```
**แทนที่ด้วย:**
```ts
  if (!landmarks || landmarks.length < 25) return NO_PERSON
```

**(3)** **หา:**
```ts
  if (!shoulderMid || !hipMid || !headPoint) {
    return { issue: 'no_person', neckAngleDeg: 0, torsoAngleDeg: 0, shoulderTiltDeg: 0 }
  }

  const neckAngleDeg = angleFromVertical(shoulderMid, headPoint)
  const torsoAngleDeg = angleFromVertical(hipMid, shoulderMid)
```
**แทนที่ด้วย:**
```ts
  // Quality Gate: ต้องเห็นอย่างน้อย "หัว + ไหล่" ส่วนสะโพกไม่บังคับ (กล้องโน้ตบุ๊กมักมองไม่เห็นเพราะโต๊ะบัง)
  if (!shoulderMid || !headPoint) return NO_PERSON
  const quality: PoseQuality = hipMid ? 'full_body' : 'upper_body'

  const neckAngleDeg = angleFromVertical(shoulderMid, headPoint)
  const torsoAngleDeg = hipMid ? angleFromVertical(hipMid, shoulderMid) : null
```

**(4)** **หา:**
```ts
  if (torsoAngleDeg >= thresholds.torsoAngleThresholdDeg) {
```
**แทนที่ด้วย:**
```ts
  if (torsoAngleDeg !== null && torsoAngleDeg >= thresholds.torsoAngleThresholdDeg) {
```

**(5)** **หา:**
```ts
  return { issue, neckAngleDeg, torsoAngleDeg, shoulderTiltDeg }
```
**แทนที่ด้วย:**
```ts
  return { issue, quality, neckAngleDeg, torsoAngleDeg, shoulderTiltDeg }
```

**(6) ไฟล์ `src/components/CameraStage.tsx`** — แสดงสถานะคุณภาพ

**หา:**
```ts
        person.postureStatusLabel = POSTURE_LABELS_TH[analysis.issue]
```
**แทนที่ด้วย:**
```ts
        person.postureStatusLabel =
          POSTURE_LABELS_TH[analysis.issue] + (analysis.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
```

**(7)** ตอนนี้ `torsoAngleDeg` อาจเป็น `null` แต่ `metrics` ต้องเป็นตัวเลขเท่านั้น — ในบรรทัด `stepSustainedAlert` ของท่านั่ง **หา:**
```ts
torsoAngleDeg: analysis.torsoAngleDeg, shoulderTiltDeg
```
**แทนที่ด้วย:**
```ts
torsoAngleDeg: analysis.torsoAngleDeg ?? 0, shoulderTiltDeg
```

**(8) ส่วนตรวจหกล้ม** ก็ใช้ `torsoAngleDeg` เพื่อดูว่า "ลำตัวราบ" หรือยัง — **หา:**
```ts
            const isNearHorizontal = analysis.torsoAngleDeg >= p.fallThresholds.fallTorsoAngleDeg
```
**แทนที่ด้วย:**
```ts
            // มองไม่เห็นสะโพก (torsoAngleDeg = null) = ยืนยันไม่ได้ว่าลำตัวราบ — เหลือแค่เส้นทาง "หายไปจากเฟรม" ด้านบน
            const torsoAngleDeg = analysis.torsoAngleDeg
            const isNearHorizontal = torsoAngleDeg !== null && torsoAngleDeg >= p.fallThresholds.fallTorsoAngleDeg
```

**หา** (ไม่กี่บรรทัดถัดมา):
```ts
                metrics: { dropRatio, torsoAngleDeg: analysis.torsoAngleDeg },
```
**แทนที่ด้วย:**
```ts
                metrics: { dropRatio, torsoAngleDeg: torsoAngleDeg ?? 0 },
```

> 💡 **TypeScript ช่วยเรา:** ถ้าลืมข้อ (4), (7) หรือ (8) แล้วรัน `npm run build` TypeScript จะ error บอกว่า "อาจเป็น null" นี่คือประโยชน์ของการระบุชนิดข้อมูล มันจับบั๊กก่อนรันจริง ลองจงใจลืมสักข้อดูก็ได้ จะได้เห็นว่า error หน้าตาเป็นยังไง

> 🤔 **ข้อแลกเปลี่ยนเรื่องหกล้ม:** ก่อนแก้ ถ้ามองไม่เห็นสะโพก ระบบไม่เห็น "คน" เลย ตรวจหกล้มไม่ได้ทุกแบบ หลังแก้ ระบบเห็นคนแล้ว เส้นทาง "ร่วงตัวแล้วหายจากเฟรม" (ขั้น 1.5) จึงใช้ได้ แต่เส้นทาง "ร่วงตัว + ลำตัวราบ" ยังต้องเห็นสะโพกเหมือนเดิม ถ้าต้องการตรวจหกล้มให้ครบ ควรตั้งกล้อง (เช่น กล้อง IP) ให้เห็นทั้งตัว

✅ **ตรวจสอบ:**
1. `npm run build` ผ่าน
2. `npm run dev` → นั่งตำแหน่งทำงานปกติ (ไม่เห็นสะโพก) → ต้องเห็น "คนที่ 1 — นั่งท่าดี (เห็นแค่ช่วงบน)"
3. นั่งตรง → **ต้องไม่ขึ้น "นั่งเอียงข้าง"** (ผลจากขั้น 2.2)
4. เอียงตัวไปด้านข้างชัด ๆ ค้างไว้ 8 วินาที → ต้องแจ้งเตือน "นั่งเอียงข้าง"
5. **เทียบกับตารางในขั้น 2.1** — ดีขึ้นไหม?

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม Quality Gate: วิเคราะห์ได้แม้ไม่เห็นสะโพก (upper body mode)"
git checkout main
git merge phase-2-quality-gate
```

🧠 **คำถามทบทวน:**
1. ทำไมเราไม่ตรวจ "หลังค่อม" ตอนไม่เห็นสะโพก?
2. หลังแก้แล้ว ทำไมเตือนพักกับความเหนื่อยล้าถึงทำงานดีขึ้นด้วย ทั้งที่เราไม่ได้แตะโค้ดส่วนนั้นเลย? (ใบ้: ดูว่า face ถูก "ผูก" กับอะไรใน `runFaceDetection`)
3. ทำไมเราไม่เดาว่า "ไม่เห็นสะโพก = ลำตัวตั้งตรง" (torsoAngleDeg = 0) ไปเลย? จะเกิดอะไรกับการตรวจหกล้มและหลังค่อม?

---

# Phase 3 — โหมดคนเดียว (Workstation) + จำกัด FPS

```bash
git checkout -b phase-3-performance
```

## ขั้น 3.1 — เพิ่มโหมด Personal Workstation (1 คน) เป็นค่าเริ่มต้น

🎯 **เป้าหมาย:** มีตัวเลือกใน Settings "ใช้คนเดียว" (ค่าเริ่มต้น) กับ "หลายคน"

🤔 **ทำไม:**
- ตอนนี้ AI หาคน **สูงสุด 4 คนทุกเฟรม** (`MAX_TRACKED_PEOPLE = 4`) แต่การใช้งานจริงส่วนใหญ่คือ 1 คน 1 คอม
- หาคนเดียวจะ **เร็วกว่า**, ไม่สับสนคน, calibrate ง่ายกว่า (Phase 4 จะได้ใช้ประโยชน์นี้)
- ยังเก็บโหมดหลายคนไว้เผื่อใช้ (เช่น กล้อง IP มุมกว้างที่เห็นหลายโต๊ะ)
- ตอนนี้ต่อได้ 2 กล้อง และ **แต่ละกล้องโหลดโมเดลของตัวเอง** ภาระเครื่องจึงคูณ 2 การลดจาก 4 คนเหลือ 1 คนต่อกล้องจึงช่วยได้มาก
- โหมดที่เลือกจะใช้กับ **ทุกกล้อง** (ตั้งค่าที่เดียวใน SettingsPanel)

📚 **ศึกษาก่อน:**
- React: การส่ง props จากแม่ไปลูก และส่ง callback จากลูกกลับขึ้นแม่ — https://react.dev/learn/sharing-state-between-components
- React: `useEffect` dependency array (ทำไม `[numPoses]` ทำให้ effect รันใหม่) — https://react.dev/learn/synchronizing-with-effects
- HTML `<input type="radio">`

🛠 **ลงมือ:**

**(1) เขียน `src/lib/multiPerson.ts` ใหม่ทั้งไฟล์:**
```ts
// ค่าคงที่กลางสำหรับโหมดการตรวจจับ ใช้ร่วมกันทั้ง pose landmarker และ face-api
//   - workstation: 1 กล้อง 1 คน (โน้ตบุ๊ก/คอมตั้งโต๊ะส่วนตัว) — เร็วที่สุด แม่นที่สุด เป็นค่าเริ่มต้น
//   - multi: กล้องตัวเดียวดูหลายคนพร้อมกัน — กินทรัพยากรมากขึ้นตามจำนวนคน

export type DetectionMode = 'workstation' | 'multi'

export const MAX_TRACKED_PEOPLE = 4

export function maxPeopleFor(mode: DetectionMode): number {
  return mode === 'workstation' ? 1 : MAX_TRACKED_PEOPLE
}
```

**(2) ไฟล์ `src/hooks/usePoseLandmarker.ts`** — ให้รับจำนวนคนเป็น parameter

- **ลบบรรทัด:**
  ```ts
  import { MAX_TRACKED_PEOPLE } from '../lib/multiPerson'
  ```
- **หา:** `export function usePoseLandmarker() {`
  **แทนที่ด้วย:**
  ```ts
  /** @param numPoses จำนวนคนสูงสุดที่ให้โมเดลหา — เปลี่ยนค่าแล้วโมเดลจะถูกสร้างใหม่อัตโนมัติ */
  export function usePoseLandmarker(numPoses: number) {
  ```
- **หา** `numPoses: MAX_TRACKED_PEOPLE,` (มี **2 ที่** — ทั้งแบบ GPU และ CPU) **แทนที่ทั้งสองที่ด้วย:**
  ```ts
            numPoses,
  ```
  > 💡 `numPoses,` เป็นตัวย่อของ `numPoses: numPoses,` (shorthand property)
- **หา** (ท้ายไฟล์):
  ```ts
    }, [])

    return { landmarkerRef, status, error }
  ```
  **แทนที่ด้วย:**
  ```ts
    }, [numPoses])

    return { landmarkerRef, status, error }
  ```
  > 💡 `[numPoses]` แปลว่า "ถ้า numPoses เปลี่ยน ให้ปิดโมเดลเก่า (cleanup) แล้วโหลดใหม่"

**(3) ไฟล์ `src/components/CameraStage.tsx`**

- **หา:** `import { MAX_TRACKED_PEOPLE } from '../lib/multiPerson'`
  **แทนที่ด้วย:** `import { maxPeopleFor, type DetectionMode } from '../lib/multiPerson'`
- ใน `interface Props` **หา:**
  ```ts
    faceFeaturesEnabled: boolean
    enrolledPeople: EnrolledPerson[]
  ```
  **แทนที่ด้วย:**
  ```ts
    faceFeaturesEnabled: boolean
    detectionMode: DetectionMode
    enrolledPeople: EnrolledPerson[]
  ```
- ในพารามิเตอร์ของฟังก์ชัน `CameraStage({ ... })` เพิ่ม `detectionMode,` ต่อจาก `faceFeaturesEnabled,`
- ใน `useRef({ ... })` ของ `propsRef` **และ** ใน `useEffect` ข้างล่างที่อัปเดต `propsRef.current = { ... }` — เพิ่ม `detectionMode,` ต่อจาก `faceFeaturesEnabled,` **ทั้ง 2 ที่**
  > 💡 **ทำไมต้องใส่ใน propsRef?** `detectFrame` ถูกเรียกจาก rAF loop ซึ่ง "จำ" ค่า props ตอนสร้าง ถ้าอ่าน props ตรง ๆ จะได้ค่าเก่าเสมอ (stale closure) จึงอ่านผ่าน `propsRef.current` ที่อัปเดตทุก render แทน
- **หา:** `usePoseLandmarker()` **แทนที่ด้วย:** `usePoseLandmarker(maxPeopleFor(detectionMode))`
- ใน `runFaceDetection` **หา:**
  ```ts
        // จำกัดจำนวนไม่ให้เกิน MAX_TRACKED_PEOPLE โดยเลือกใบหน้าที่ใหญ่สุด (ใกล้กล้องที่สุด) ก่อน
        const limited = [...results].sort((a, b) => b.detection.box.width - a.detection.box.width).slice(0, MAX_TRACKED_PEOPLE)
  ```
  **แทนที่ด้วย:**
  ```ts
        // จำกัดจำนวนไม่ให้เกินโหมดที่เลือก โดยเลือกใบหน้าที่ใหญ่สุด (ใกล้กล้องที่สุด) ก่อน
        const limited = [...results]
          .sort((a, b) => b.detection.box.width - a.detection.box.width)
          .slice(0, maxPeopleFor(propsRef.current.detectionMode))
  ```
- **หา:**
  ```tsx
          ตรวจพบในเฟรม: {peopleCount} คน (รองรับสูงสุด {MAX_TRACKED_PEOPLE} คนพร้อมกัน)
  ```
  **แทนที่ด้วย** (ชั่วคราว ขั้น 3.3 จะเพิ่มต่อ):
  ```tsx
          ตรวจพบในเฟรม: {peopleCount} คน (รองรับสูงสุด {maxPeopleFor(detectionMode)} คน)
  ```

**(4) ไฟล์ `src/App.tsx`**

- เพิ่ม import ต่อจาก `import type { PersonSummary } from './types/person'`:
  ```ts
  import type { DetectionMode } from './lib/multiPerson'
  ```
- เพิ่ม state ต่อจากบรรทัด `faceFeaturesEnabled`:
  ```ts
    const [detectionMode, setDetectionMode] = useState<DetectionMode>('workstation')
  ```
- ใน `<CameraStage ... />` (อยู่ใน `cameraSlots.map(...)` จึงเขียนครั้งเดียวได้ทุกกล้อง) เพิ่มต่อจาก `faceFeaturesEnabled={faceFeaturesEnabled}`:
  ```tsx
                    detectionMode={detectionMode}
  ```
- ใน `<SettingsPanel ... />` เพิ่มต่อจาก `onFaceFeaturesEnabledChange={setFaceFeaturesEnabled}`:
  ```tsx
              detectionMode={detectionMode}
              onDetectionModeChange={setDetectionMode}
  ```

**(5) ไฟล์ `src/components/SettingsPanel.tsx`**

- เพิ่ม import ต่อจากบรรทัด `import type { FallThresholds } from '../types/fall'`:
  ```ts
  import type { DetectionMode } from '../lib/multiPerson'
  ```
- ใน `interface Props` เพิ่มท้ายสุด (ก่อน `}`):
  ```ts
    detectionMode: DetectionMode
    onDetectionModeChange: (mode: DetectionMode) => void
  ```
- ในพารามิเตอร์ `SettingsPanel({ ... })` เพิ่มต่อจาก `onFaceFeaturesEnabledChange,`:
  ```ts
    detectionMode,
    onDetectionModeChange,
  ```
- **หา:** `<h3>ท่านั่ง</h3>` **แทนที่ด้วย:**
  ```tsx
        <h3>โหมดการตรวจจับ</h3>
        <label className="settings-row settings-checkbox">
          <span>ใช้คนเดียว (Personal Workstation) — แนะนำ</span>
          <input
            type="radio"
            name="detection-mode"
            checked={detectionMode === 'workstation'}
            onChange={() => onDetectionModeChange('workstation')}
          />
        </label>
        <label className="settings-row settings-checkbox">
          <span>กล้องเดียวหลายคน (Multi-person)</span>
          <input
            type="radio"
            name="detection-mode"
            checked={detectionMode === 'multi'}
            onChange={() => onDetectionModeChange('multi')}
          />
        </label>

        <h3>ท่านั่ง</h3>
  ```

✅ **ตรวจสอบ:**
1. `npm run build` ผ่าน (ถ้า error ว่า "Property 'detectionMode' is missing" = ลืมส่ง prop ที่ไหนสักที่ อ่าน error ว่าไฟล์ไหน บรรทัดไหน)
2. เปิดแอป → ค่าเริ่มต้นเป็น "ใช้คนเดียว" → ข้อความใต้วิดีโอ "รองรับสูงสุด 1 คน"
3. ให้เพื่อนมายืนข้างหลัง → ต้องเห็น skeleton แค่ 1 คน
4. สลับเป็น "หลายคน" → โมเดลโหลดใหม่ (มีข้อความ "กำลังโหลดโมเดล" แป๊บหนึ่ง) → เห็นได้หลายคน

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่มโหมด Personal Workstation (1 คน) เป็นค่าเริ่มต้น"
```

---

## ขั้น 3.2 — จำกัดการรัน Pose ไว้ที่ ~12 ครั้ง/วินาที

🎯 **เป้าหมาย:** ลดภาระเครื่อง (CPU/GPU/แบตเตอรี่) โดยที่ผลการตรวจท่านั่งไม่แย่ลง

🤔 **ทำไม:** ท่านั่งไม่ได้เปลี่ยนเร็วขนาด 30 ครั้งต่อวินาที และเราต้องรอผิดต่อเนื่อง 8 วินาทีอยู่แล้วกว่าจะเตือน การวิเคราะห์ 12 ครั้ง/วินาทีจึงเหลือเฟือ เครื่องจะเย็นลง แบตอยู่นานขึ้น และหน้าเว็บลื่นขึ้น

**สำคัญมากสำหรับกล้อง IP:** โค้ดปัจจุบันเช็ค "เฟรมใหม่" ได้เฉพาะกล้องในเครื่อง (`video.currentTime`) ส่วนกล้อง IP (`<img>` แบบ MJPEG) ไม่มีสัญญาณนี้ จึง **รัน AI ทุกรอบ rAF ≈ 60 ครั้ง/วินาที** ถ้าต่อ 2 กล้อง IP = 120 ครั้ง/วินาที! ขั้นนี้จะลดเหลือกล้องละ 12

> 🤔 **แล้วตรวจหกล้มยังทันไหม?** หน้าต่างเวลาตรวจ "ร่วงตัวเร็ว" คือ 700 ms (`dropWindowMs`) ที่ 12 FPS ยังได้ ~8 จุดข้อมูลในหน้าต่างนั้น เพียงพอ

**วิธีคิด (throttle):** จดเวลาที่รันล่าสุดไว้ ถ้ายังไม่ครบ 1000/12 ≈ 83 ms ก็ข้ามไป

📚 **ศึกษาก่อน:**
- Throttling คืออะไร — https://developer.mozilla.org/en-US/docs/Glossary/Throttle
- `performance.now()` ต่างจาก `Date.now()` ยังไง — https://developer.mozilla.org/en-US/docs/Web/API/Performance/now

🛠 **ลงมือ:** ไฟล์ `src/components/CameraStage.tsx`

**(1)** **หา:**
```ts
const FACE_DETECT_INTERVAL_MS = 400
```
**แทนที่ด้วย** (บรรทัดเดิมยังอยู่ แค่เพิ่มบรรทัดบน):
```ts
const POSE_INTERVAL_MS = 1000 / 12 // รัน pose แค่ ~12 ครั้ง/วินาที พอสำหรับดูท่านั่ง ประหยัด CPU/GPU
const FACE_DETECT_INTERVAL_MS = 400
```

**(2)** **หา:**
```ts
  const lastVideoTimeRef = useRef(-1)
```
**แทนที่ด้วย:**
```ts
  const lastVideoTimeRef = useRef(-1)
  const lastPoseRunAtRef = useRef(0)
  // เวลาที่ใช้ต่อการรัน pose 1 ครั้ง (ms) แบบเฉลี่ยเรียบ — ใช้ดูว่าเครื่องหนักแค่ไหน
  const poseInferenceMsRef = useRef(0)
```

**(3)** **หา:**
```ts
    // กล้องในเครื่อง (video): ประมวลผลเฉพาะตอนเฟรมเปลี่ยนจริง (เช็คจาก currentTime) กันประมวลผลซ้ำเฟรมเดิม
    // กล้อง IP (MJPEG ผ่าน <img>): ไม่มีสัญญาณ "เฟรมใหม่" ที่เชื่อถือได้ เลยประมวลผลทุกรอบไปเลย
    // ถ้าเคยเจอปัญหา CORS กับแหล่งภาพนี้มาแล้ว หยุดลองซ้ำทุกเฟรม (กัน error สแปม) จนกว่าจะเปลี่ยนแหล่งกล้อง
    const shouldProcessPose =
      !!landmarker && !sourceErrorStickyRef.current && (!isVideoSource || source.currentTime !== lastVideoTimeRef.current)

    if (shouldProcessPose && landmarker) {
      if (isVideoSource) lastVideoTimeRef.current = source.currentTime
      try {
        poseResult = landmarker.detectForVideo(source, performance.now())
        latestPoseResultRef.current = poseResult
```
**แทนที่ด้วย:**
```ts
    // กล้องในเครื่อง (video): ประมวลผลเฉพาะตอนเฟรมเปลี่ยนจริง (เช็คจาก currentTime) กันประมวลผลซ้ำเฟรมเดิม
    // กล้อง IP (MJPEG ผ่าน <img>): ไม่มีสัญญาณ "เฟรมใหม่" ที่เชื่อถือได้ — throttle ด้านล่างจึงเป็นตัวจำกัดเดียว
    // ถ้าเคยเจอปัญหา CORS กับแหล่งภาพนี้มาแล้ว หยุดลองซ้ำทุกเฟรม (กัน error สแปม) จนกว่าจะเปลี่ยนแหล่งกล้อง
    // ทุกแหล่งภาพ: รันไม่ถี่กว่า POSE_INTERVAL_MS
    const perfNow = performance.now()
    const shouldProcessPose =
      !!landmarker &&
      !sourceErrorStickyRef.current &&
      perfNow - lastPoseRunAtRef.current >= POSE_INTERVAL_MS &&
      (!isVideoSource || source.currentTime !== lastVideoTimeRef.current)

    if (shouldProcessPose && landmarker) {
      if (isVideoSource) lastVideoTimeRef.current = source.currentTime
      lastPoseRunAtRef.current = perfNow
      try {
        poseResult = landmarker.detectForVideo(source, perfNow)
        poseInferenceMsRef.current = poseInferenceMsRef.current * 0.9 + (performance.now() - perfNow) * 0.1
        latestPoseResultRef.current = poseResult
```

> 💡 ถ้าทำขั้น 2.1 แล้วยังไม่ได้ลบโค้ด DEBUG ให้ลบก่อน ไม่งั้นข้อความ "หา" จะไม่ตรง

> 💡 **บรรทัด `poseInferenceMsRef` คืออะไร?** `ค่าเก่า × 0.9 + ค่าใหม่ × 0.1` คือ **EMA** (ค่าเฉลี่ยเคลื่อนที่แบบเลขชี้กำลัง) ทำให้ตัวเลขไม่กระโดดไปมา จะได้เรียนจริงจังใน Phase 4

> 💡 **ไม่ต้องกลัว skeleton กระพริบ:** เพราะขั้น 1.3 ทำให้วาดผลล่าสุดค้างไว้แล้ว นี่คือตัวอย่างว่าการแก้บั๊กที่ต้นเหตุช่วยให้งานถัดไปง่ายขึ้น

---

## ขั้น 3.3 — แสดงเวลาที่ AI ใช้ (วัดผล)

🎯 **เป้าหมาย:** เห็นตัวเลข "Pose ใช้เวลา ~X ms/ครั้ง" บนจอ

🤔 **ทำไม:** "สิ่งที่วัดไม่ได้ ปรับปรุงไม่ได้" เราต้องมีตัวเลขไว้เทียบว่าการแก้แต่ละครั้งทำให้เร็วขึ้นหรือช้าลง

🛠 **ลงมือ:** ไฟล์ `src/components/CameraStage.tsx`

**(1)** **หา:**
```ts
  const [peopleCount, setPeopleCount] = useState(0)
```
**แทนที่ด้วย:**
```ts
  const [peopleCount, setPeopleCount] = useState(0)
  const [poseInferenceMs, setPoseInferenceMs] = useState(0)
```

**(2)** อัปเดตค่าบนจอทุกครึ่งวินาที (ใช้จังหวะเดียวกับที่ส่งสรุปรายชื่อคนอยู่แล้ว) — **หา:**
```ts
    setPeopleCount(summaries.length)
```
**แทนที่ด้วย:**
```ts
    setPeopleCount(summaries.length)
    setPoseInferenceMs(Math.round(poseInferenceMsRef.current))
```

**(3)** **หา:**
```tsx
        ตรวจพบในเฟรม: {peopleCount} คน (รองรับสูงสุด {maxPeopleFor(detectionMode)} คน)
```
**แทนที่ด้วย:**
```tsx
        ตรวจพบในเฟรม: {peopleCount} คน (รองรับสูงสุด {maxPeopleFor(detectionMode)} คน) · Pose ใช้เวลา ~{poseInferenceMs} ms/ครั้ง
```

✅ **ตรวจสอบ:**
1. `npm run build` ผ่าน
2. เปิดแอป ดูตัวเลข ms (ปกติ GPU ~5–20 ms, CPU ~20–60 ms ขึ้นกับเครื่อง)
3. **ทดลองเปรียบเทียบ** (จดลงโน้ต):
   - โหมดคนเดียว vs หลายคน ต่างกันกี่ ms?
   - ต่อ 1 กล้อง vs 2 กล้อง ตัวเลขของแต่ละกล้องเปลี่ยนไหม?
   - เปิด Windows Task Manager (`Ctrl+Shift+Esc`) ดู CPU ของ Chrome ก่อน/หลังขั้น 3.2 (ลอง `git stash` เพื่อย้อนชั่วคราว แล้ว `git stash pop` เพื่อกลับมา)
4. 📚 **ลองใช้ Chrome Performance tab:** F12 → Performance → กดอัด 5 วินาที → ดูว่า `detectFrame` ใช้เวลาเท่าไหร่ (https://developer.chrome.com/docs/devtools/performance)

💾 **บันทึก:**
```bash
git add -A
git commit -m "จำกัด pose inference ~12 FPS และแสดงเวลา inference บนจอ"
git checkout main
git merge phase-3-performance
```

🧠 **คำถามทบทวน:**
1. ถ้าตั้ง `POSE_INTERVAL_MS = 1000 / 2` (2 ครั้ง/วินาที) จะมีข้อเสียอะไร?
2. ทำไมต้องเช็ค `video.currentTime !== lastVideoTimeRef.current` ด้วย ทั้งที่มี throttle แล้ว?
3. ทำไมกล้อง IP ถึงได้ประโยชน์จากขั้นนี้มากกว่ากล้องในเครื่อง?

---

# Phase 4 — Calibration + Smoothing + วัดมุมให้ถูก

```bash
git checkout -b phase-4-calibration
```

> ⚠️ **Phase นี้ยากที่สุด** ใช้เวลาเท่าไหร่ก็ได้ ไม่ต้องรีบ อ่านส่วน 🤔 ให้เข้าใจก่อนลงมือ ถ้างงให้ถามได้เลย

## ภาพรวมของ Phase 4

เราจะเปลี่ยน "สมอง" ของการวิเคราะห์ท่านั่งจาก:

```
landmarks ──▶ analyzePosture() ──▶ "good" / "slouching" / ...
              (คำนวณ + ตัดสิน ในฟังก์ชันเดียว)
```

เป็น:

```
landmarks ──▶ extractPostureFeatures() ──▶ smoothFeatures() ──▶ classifyPosture(baseline) ──▶ ผล
              ขั้น 1: วัดตัวเลข             ขั้น 2: ทำให้เรียบ    ขั้น 3: ตัดสิน โดยเทียบกับ
              (ไม่ตัดสินอะไร)                                    "ท่าดีของคนนี้"
                     │
                     └──▶ (ตอนกด Calibrate) เก็บไว้ 3 วิ ──▶ median ──▶ baseline
```

**ทำไมต้องแยก?** เพราะเราต้องการแทรก smoothing และ calibration "ตรงกลาง" ระหว่างการวัดกับการตัดสิน ถ้ารวมอยู่ในฟังก์ชันเดียวจะแทรกไม่ได้

📚 **ศึกษาก่อนเริ่ม Phase 4 (สำคัญ):**
- **Aspect ratio** คืออะไร (อัตราส่วนกว้าง:สูง เช่น 4:3, 16:9)
- **EMA / Exponential smoothing** — https://en.wikipedia.org/wiki/Exponential_smoothing (อ่านแค่ส่วน "Basic exponential smoothing")
- **Median vs Mean** — ทำไม median ทนต่อค่าผิดปกติ (outlier) มากกว่า
- **One Euro Filter** (อ่านผ่าน ๆ ไว้เป็นความรู้ ยังไม่ต้องทำ) — https://gery.casiez.net/1euro/
- **`JSON.stringify` / `JSON.parse`** และ `try...catch`

---

## ขั้น 4.1 — เพิ่มชนิดข้อมูลใหม่

🎯 **เป้าหมาย:** นิยาม "รูปร่าง" ของข้อมูลก่อนเขียน logic (เหมือนออกแบบแบบฟอร์มก่อนกรอก)

🛠 **ลงมือ:** ไฟล์ `src/types/posture.ts`

**(1)** **หา:**
```ts
/** ค่า threshold ที่ผู้ใช้ปรับได้จาก SettingsPanel */
```
**แทนที่ด้วย:**
```ts
/** คุณภาพของสัญญาณ pose: เห็นทั้งตัว (มีสะโพก) / เห็นแค่ช่วงบน (หัว+ไหล่) */
export type PoseQuality = 'full_body' | 'upper_body'

/** ตัวเลขที่วัดได้จากท่านั่ง 1 เฟรม (ยังไม่ตัดสินว่าดี/ไม่ดี) — ทุกมุมคำนวณใน pixel space */
export interface PostureFeatures {
  quality: PoseQuality
  neckAngleDeg: number
  /** null = มองไม่เห็นสะโพก วัดมุมลำตัวไม่ได้ */
  torsoAngleDeg: number | null
  shoulderTiltDeg: number
  /** ความสูงของหัวเหนือไหล่ หารด้วยความกว้างไหล่ — null ถ้าเห็นไหล่ไม่ครบ 2 ข้าง */
  headHeightRatio: number | null
}

/** ค่า "ท่าดี" ของผู้ใช้คนนี้ ได้จากการ Calibrate (เก็บค่ากลาง/median ของหลายเฟรม) */
export interface PostureBaseline {
  neckAngleDeg: number
  torsoAngleDeg: number | null
  shoulderTiltDeg: number
  headHeightRatio: number | null
  createdAt: number
}

/** ค่า threshold ที่ผู้ใช้ปรับได้จาก SettingsPanel */
```

**(2)** ใน `interface PostureThresholds` **หา:**
```ts
  minVisibility: number
}
```
**แทนที่ด้วย:**
```ts
  minVisibility: number
  /** หัวต่ำลงจากตอน calibrate เกินสัดส่วนนี้ (0.15 = 15%) ถือว่าก้ม/ยื่นคอ — ใช้เมื่อ calibrate แล้วเท่านั้น */
  headDropThreshold: number
}
```

**(3)** ใน `DEFAULT_THRESHOLDS` **หา:**
```ts
  minVisibility: 0.5,
}
```
**แทนที่ด้วย:**
```ts
  minVisibility: 0.5,
  headDropThreshold: 0.15,
}
```

> ตอนนี้ `npm run build` จะยังผ่าน (เพราะยังไม่มีใครใช้ type ใหม่) ลองรันดู

---

## ขั้น 4.2 — เขียน `postureAnalysis.ts` ใหม่: วัดในหน่วยพิกเซล + feature แบบอัตราส่วน

🎯 **เป้าหมาย:**
1. แก้มุมเพี้ยนจาก aspect ratio
2. เพิ่ม feature ใหม่ `headHeightRatio` ที่จับ "ก้มคอ/ยื่นคอ" จากกล้องหน้าได้ดีกว่ามุม
3. แยกเป็น `extractPostureFeatures` + `classifyPosture`

🤔 **ทำไม — ปัญหาที่ 1: Aspect ratio**

MediaPipe ให้พิกัดแบบ normalized: `x` เป็นสัดส่วนของ **ความกว้าง** และ `y` เป็นสัดส่วนของ **ความสูง** แต่ภาพกว้าง 640 สูง 480 (ไม่ใช่สี่เหลี่ยมจัตุรัส)

```
Δx = 0.1  →  0.1 × 640 = 64 พิกเซล
Δy = 0.1  →  0.1 × 480 = 48 พิกเซล     ← "0.1 เท่ากัน" แต่ระยะจริงไม่เท่ากัน!
```

ผลคือมุมเพี้ยน เช่น มุมจริง 15° โค้ดเดิมจะคำนวณได้ประมาณ 11° ทำให้ threshold "25°" ที่ตั้งไว้ไม่ได้หมายถึง 25° จริง

**วิธีแก้:** คูณกลับเป็นพิกเซลก่อนคำนวณ (`x × width`, `y × height`)

**🤔 ปัญหาที่ 2: กล้องหน้าวัด "ยื่นคอ" ด้วยมุมไม่ค่อยได้**

เวลาเรายื่นคอ/ก้มหน้า **ทิศที่ขยับจริงคือเข้าหากล้อง** (แกน z) ไม่ใช่ซ้าย-ขวา มุมคอ 2D จากด้านหน้าจึงแทบไม่เปลี่ยน สิ่งที่เปลี่ยนชัดจากมุมกล้องหน้าคือ **"หัวดูต่ำลงมาใกล้ไหล่"**

```
  ท่าดี               ก้ม/ยื่นคอ
    ●  หัว
    |                    ●  หัว (ต่ำลง)
    |  ← สูง             |  ← เตี้ยลง
●───┼───● ไหล่        ●───┼───● ไหล่
```

แต่ระยะ "หัวถึงไหล่" เป็นพิกเซลจะเปลี่ยนตาม **ระยะห่างจากกล้อง** ด้วย (นั่งใกล้ = ทุกอย่างดูใหญ่) จึงหารด้วย **ความกว้างไหล่** (ซึ่งก็ใหญ่ขึ้นตามระยะเหมือนกัน) → ได้อัตราส่วนที่ไม่ขึ้นกับระยะ:

```
headHeightRatio = (ไหล่.y − หัว.y) / ความกว้างไหล่
```

> 💡 ทำไมไม่ใช้ค่า `z` (ความลึก) จาก MediaPipe? เพราะค่า z จากกล้องตัวเดียวสั่นและไม่แม่น การใช้อัตราส่วน 2D + เทียบกับ baseline ของแต่ละคน เสถียรกว่ามาก

📚 **ศึกษาก่อน:**
- อ่านไฟล์ `postureAnalysis.ts` เดิมอีกรอบ ทำความเข้าใจ `angleFromVertical` และ `midOrVisible`
- TypeScript type guard (`p is Point`) — https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates

🛠 **ลงมือ:** **เขียน `src/lib/postureAnalysis.ts` ใหม่ทั้งไฟล์:**

```ts
// การคำนวณมุมท่านั่งจาก 33 pose landmarks ของ MediaPipe BlazePose
// อ้างอิง index ของ landmark ตามมาตรฐาน BlazePose:
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
//
// แบ่งเป็น 2 ขั้น:
//   1) extractPostureFeatures — แปลง landmarks เป็น "ตัวเลขที่วัดได้" (มุม/อัตราส่วน) ไม่ตัดสินอะไร
//   2) classifyPosture       — เอาตัวเลขมาเทียบ threshold (และ baseline ถ้า calibrate แล้ว) ตัดสินว่าท่าไหน
// แยกกันเพื่อให้แทรก smoothing / calibration / dataset recorder ไว้ตรงกลางได้

import type {
  Point,
  PostureBaseline,
  PostureFeatures,
  PostureIssueType,
  PostureThresholds,
} from '../types/posture'

const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const

export interface FrameSize {
  width: number
  height: number
}

/** แปลงพิกัด normalized (0-1) เป็นพิกเซล — จำเป็นเพราะเฟรมไม่ใช่สี่เหลี่ยมจัตุรัส (เช่น 640x480)
 *  ถ้าคำนวณมุมจาก normalized ตรงๆ แกน x กับ y จะ "ยาวไม่เท่ากัน" ทำให้มุมเพี้ยน */
function toPixels(p: Point, frame: FrameSize): Point {
  return { x: p.x * frame.width, y: p.y * frame.height, visibility: p.visibility }
}

/** มุม (องศา) ระหว่างเวกเตอร์ p1->p2 กับแนวดิ่ง (0 = ตรงดิ่งพอดี, ยิ่งมากยิ่งเอียง) */
function angleFromVertical(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  // แกน y ของภาพชี้ลง จึงใช้ -dy แทนทิศ "ขึ้น" ของแนวดิ่งอ้างอิง
  const rad = Math.atan2(dx, -dy)
  return Math.abs((rad * 180) / Math.PI)
}

/** มุมเอียงของเส้นไหล่ซ้าย-ขวา เทียบแนวนอน (0 = ไหล่ตรง) — ใช้ค่าสัมบูรณ์ทั้ง dx, dy
 *  เพื่อไม่ให้ผลขึ้นกับว่าไหล่ซ้ายอยู่ฝั่งซ้ายหรือขวาของภาพ (กล้องหน้าภาพจะกลับด้าน) */
function shoulderTilt(left: Point, right: Point): number {
  const dx = Math.abs(right.x - left.x)
  const dy = Math.abs(right.y - left.y)
  const rad = Math.atan2(dy, dx)
  return (rad * 180) / Math.PI
}

function isVisible(p: Point | undefined, min: number): p is Point {
  return !!p && (p.visibility === undefined || p.visibility >= min)
}

/** เลือกจุดกึ่งกลางระหว่างซ้าย-ขวา ถ้าเห็นทั้งคู่ ไม่งั้นใช้ข้างที่เห็น (เผื่อกรณีนั่งหันข้างให้กล้อง) */
function midOrVisible(left: Point | undefined, right: Point | undefined, min: number): Point | undefined {
  const l = isVisible(left, min)
  const r = isVisible(right, min)
  if (l && r) return { x: (left!.x + right!.x) / 2, y: (left!.y + right!.y) / 2 }
  if (l) return left
  if (r) return right
  return undefined
}

/**
 * ขั้นที่ 1: landmarks 1 คน -> ตัวเลขที่วัดได้ (ยังไม่ตัดสินว่าดี/ไม่ดี)
 * คืน null ถ้ามองไม่เห็น "หัว + ไหล่" ชัดพอ (Quality Gate) — สะโพกไม่บังคับ
 */
export function extractPostureFeatures(
  landmarks: Point[] | undefined,
  frame: FrameSize,
  minVisibility: number,
): PostureFeatures | null {
  if (!landmarks || landmarks.length < 25) return null

  const at = (index: number): Point | undefined => {
    const p = landmarks[index]
    return p ? toPixels(p, frame) : undefined
  }
  const nose = at(LM.NOSE)
  const leftShoulder = at(LM.LEFT_SHOULDER)
  const rightShoulder = at(LM.RIGHT_SHOULDER)

  const shoulderMid = midOrVisible(leftShoulder, rightShoulder, minVisibility)
  const hipMid = midOrVisible(at(LM.LEFT_HIP), at(LM.RIGHT_HIP), minVisibility)
  // หัว: ใช้หูถ้าเห็น (แม่นกว่าเวลานั่งหันข้าง) ไม่งั้น fallback ไปจมูก
  const headPoint =
    midOrVisible(at(LM.LEFT_EAR), at(LM.RIGHT_EAR), minVisibility) ??
    (isVisible(nose, minVisibility) ? nose : undefined)

  if (!shoulderMid || !headPoint) return null

  let shoulderTiltDeg = 0
  let headHeightRatio: number | null = null
  if (isVisible(leftShoulder, minVisibility) && isVisible(rightShoulder, minVisibility)) {
    shoulderTiltDeg = shoulderTilt(leftShoulder, rightShoulder)
    const shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y)
    // หัวสูงเหนือไหล่กี่ "เท่าของความกว้างไหล่" — ก้มคอ/ยื่นคอเข้าหากล้อง ค่านี้จะลดลง
    // หารด้วยความกว้างไหล่เพื่อไม่ให้ค่าเปลี่ยนตามระยะห่างจากกล้อง
    if (shoulderWidth > 0) headHeightRatio = (shoulderMid.y - headPoint.y) / shoulderWidth
  }

  return {
    quality: hipMid ? 'full_body' : 'upper_body',
    neckAngleDeg: angleFromVertical(shoulderMid, headPoint),
    torsoAngleDeg: hipMid ? angleFromVertical(hipMid, shoulderMid) : null,
    shoulderTiltDeg,
    headHeightRatio,
  }
}

/**
 * ขั้นที่ 2: ตัวเลข -> ท่านั่ง
 * ถ้ามี baseline (calibrate แล้ว) จะเทียบ "ส่วนต่างจากท่าดีของคนนั้น" แทนค่าสัมบูรณ์
 */
export function classifyPosture(
  f: PostureFeatures,
  t: PostureThresholds,
  baseline: PostureBaseline | null,
): Exclude<PostureIssueType, 'no_person'> {
  const neck = baseline ? f.neckAngleDeg - baseline.neckAngleDeg : f.neckAngleDeg
  const tilt = baseline ? f.shoulderTiltDeg - baseline.shoulderTiltDeg : f.shoulderTiltDeg

  let torso: number | null = f.torsoAngleDeg
  if (torso !== null && baseline && baseline.torsoAngleDeg !== null) torso -= baseline.torsoAngleDeg

  // หัวต่ำลงกี่ % เทียบกับตอน calibrate (เช่น 0.2 = ต่ำลง 20%) — ใช้ได้เฉพาะเมื่อ calibrate แล้ว
  let headDrop: number | null = null
  if (baseline && baseline.headHeightRatio && f.headHeightRatio !== null) {
    headDrop = 1 - f.headHeightRatio / baseline.headHeightRatio
  }

  if (torso !== null && torso >= t.torsoAngleThresholdDeg) return 'slouching'
  if (neck >= t.neckAngleThresholdDeg || (headDrop !== null && headDrop >= t.headDropThreshold)) return 'forward_head'
  if (tilt >= t.shoulderTiltThresholdDeg) return 'leaning'
  return 'good'
}

export const POSTURE_LABELS_TH: Record<PostureIssueType, string> = {
  good: 'นั่งท่าดี',
  forward_head: 'ก้มคอ/ยื่นคอไปข้างหน้า',
  slouching: 'หลังค่อม/โน้มตัว',
  leaning: 'นั่งเอียงข้าง',
  no_person: 'ไม่พบคนในเฟรม',
}
```

> 💡 **อ่านให้เข้าใจ:**
> - `Exclude<PostureIssueType, 'no_person'>` = "PostureIssueType ทุกค่า **ยกเว้น** 'no_person'" เพราะ classifyPosture ถูกเรียกเมื่อเจอคนแล้วเสมอ ไม่มีทางตอบ 'no_person'
> - `headDrop = 1 - ปัจจุบัน / baseline` เช่น baseline = 0.62, ตอนนี้ = 0.44 → `1 - 0.44/0.62 = 0.29` = หัวต่ำลง 29% → เกิน 15% → `forward_head`

> ⚠️ ตอนนี้ `npm run build` จะ **error** ที่ `CameraStage.tsx` เพราะยังเรียก `analyzePosture` ที่เราลบไปแล้ว **เป็นเรื่องปกติ** จะแก้ในขั้น 4.5

---

## ขั้น 4.3 — Smoothing (ทำให้ตัวเลขเรียบ)

🎯 **เป้าหมาย:** ตัวเลขมุมไม่กระโดดไปมาทุกเฟรม ลดการเตือนผิด

🤔 **ทำไม:** AI จะหาตำแหน่งจุดได้ต่างกันเล็กน้อยทุกเฟรม แม้เรานั่งนิ่ง เช่น มุมคอ: 17, 21, 18, 26, 20, 24... ถ้า threshold = 25 เฟรมที่ได้ 26 จะถูกนับเป็น "ผิด" ทั้งที่เรานั่งเหมือนเดิม

**EMA (Exponential Moving Average):**
```
ค่าเรียบใหม่ = alpha × ค่าที่วัดได้ตอนนี้ + (1 − alpha) × ค่าเรียบรอบก่อน
```

ลองคิดเลขด้วยมือ (alpha = 0.3) จะเข้าใจทันที:

| เฟรม | ค่าดิบ | คำนวณ | ค่าเรียบ |
|---|---|---|---|
| 1 | 17 | (ค่าแรก ใช้เลย) | 17.0 |
| 2 | 21 | 0.3×21 + 0.7×17.0 | 18.2 |
| 3 | 18 | 0.3×18 + 0.7×18.2 | 18.1 |
| 4 | **26** | 0.3×26 + 0.7×18.1 | **20.5** ← ไม่กระโดดไป 26 |
| 5 | 20 | 0.3×20 + 0.7×20.5 | 20.4 |

- `alpha` ใกล้ 1 → ตามค่าจริงไว แต่ยังสั่น
- `alpha` ใกล้ 0 → เรียบมาก แต่ตอบสนองช้า

🛠 **ลงมือ:** **สร้างไฟล์ใหม่ `src/lib/smoothing.ts`:**

```ts
// ทำให้ตัวเลขที่สั่นไปมาทุกเฟรม "เรียบ" ขึ้น ด้วย Exponential Moving Average (EMA)
//   ค่าใหม่ = alpha * ค่าที่วัดได้ตอนนี้ + (1 - alpha) * ค่าเรียบรอบก่อน
// alpha ใกล้ 1 = ตามค่าจริงไว แต่สั่น / alpha ใกล้ 0 = เรียบมาก แต่ตามช้า

import type { PostureFeatures } from '../types/posture'

export function ema(previous: number | null, current: number, alpha: number): number {
  return previous === null ? current : alpha * current + (1 - alpha) * previous
}

export function smoothFeatures(prev: PostureFeatures | null, current: PostureFeatures, alpha: number): PostureFeatures {
  if (!prev) return current
  return {
    quality: current.quality,
    neckAngleDeg: ema(prev.neckAngleDeg, current.neckAngleDeg, alpha),
    torsoAngleDeg: current.torsoAngleDeg === null ? null : ema(prev.torsoAngleDeg, current.torsoAngleDeg, alpha),
    shoulderTiltDeg: ema(prev.shoulderTiltDeg, current.shoulderTiltDeg, alpha),
    headHeightRatio: current.headHeightRatio === null ? null : ema(prev.headHeightRatio, current.headHeightRatio, alpha),
  }
}
```

---

## ขั้น 4.4 — Calibration: คำนวณ baseline + เก็บลงเครื่อง

🎯 **เป้าหมาย:** มีฟังก์ชันคำนวณ "ท่าดีของคนนี้" และฟังก์ชันบันทึก/โหลดจาก localStorage

🤔 **ทำไม Calibration สำคัญที่สุด:**

threshold แบบ "มุมคอเกิน 25° = ผิด" ใช้กับทุกคนไม่ได้ เพราะแต่ละคน **ต่างกัน**: รูปร่าง ความสูง ตำแหน่งกล้อง ความสูงโต๊ะ/เก้าอี้ มุมจอโน้ตบุ๊ก...

```
คน A: ท่าดีของเขาวัดได้ 5°    → ก้มนิดเดียว 15° ก็ผิดแล้ว แต่ threshold 25° ไม่เตือน ❌
คน B: ท่าดีของเขาวัดได้ 22°   → (เพราะกล้องตั้งต่ำ) ขยับนิดเดียวก็เกิน 25° เตือนตลอด ❌
```

**แก้ด้วย:** ให้ผู้ใช้นั่งท่าดีแล้วกด "Calibrate" ระบบเก็บค่า 3 วินาที (~36 เฟรม) หา **median** เก็บเป็น baseline จากนั้นตัดสินจาก **"ส่วนต่างจาก baseline"**

**ทำไม median ไม่ใช่ average?** สมมติ 5 เฟรม: `[7, 7, 8, 7, 45]` (เฟรมสุดท้าย AI หาจุดผิด)
- average = 14.8 ← โดนค่าเพี้ยนดึงไปไกล
- median = 7 ← ไม่สนค่าเพี้ยน ✓

🛠 **ลงมือ:**

**(1) สร้างไฟล์ใหม่ `src/lib/postureCalibration.ts`:**

```ts
// คำนวณ "ท่าดีของผู้ใช้คนนี้" (baseline) จากตัวอย่างหลายเฟรมที่เก็บระหว่าง Calibrate
// ใช้ median (ค่ากลาง) แทน average เพราะไม่โดนค่าเพี้ยนบางเฟรมดึงไป (เช่น landmark กระโดดชั่วขณะ)

import type { PostureBaseline, PostureFeatures } from '../types/posture'

/** ต้องมีตัวอย่างอย่างน้อยเท่านี้ถึงจะเชื่อถือได้ (~1 วินาทีที่ 12 FPS) */
export const MIN_CALIBRATION_SAMPLES = 12

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeBaseline(samples: PostureFeatures[], now: number): PostureBaseline | null {
  if (samples.length < MIN_CALIBRATION_SAMPLES) return null

  const neck = median(samples.map((s) => s.neckAngleDeg))
  const tilt = median(samples.map((s) => s.shoulderTiltDeg))
  if (neck === null || tilt === null) return null

  return {
    neckAngleDeg: neck,
    shoulderTiltDeg: tilt,
    torsoAngleDeg: median(samples.flatMap((s) => (s.torsoAngleDeg === null ? [] : [s.torsoAngleDeg]))),
    headHeightRatio: median(samples.flatMap((s) => (s.headHeightRatio === null ? [] : [s.headHeightRatio]))),
    createdAt: now,
  }
}
```

> 💡 **`[...values].sort((a, b) => a - b)`** — ต้องก๊อป array ก่อน sort (`[...values]`) เพราะ `sort` แก้ array เดิม และต้องใส่ `(a, b) => a - b` เพราะ sort ปกติเรียงแบบ "ตัวอักษร" (ลอง `[10, 9, 1].sort()` ใน Console ดู จะได้ `[1, 10, 9]` 😱)
>
> **`flatMap(s => s.x === null ? [] : [s.x])`** — เป็นเทคนิค "map + กรองค่า null ทิ้ง" ในขั้นเดียว

**(2) สร้างไฟล์ใหม่ `src/services/postureBaselineStore.ts`:**

> 🎥 **เก็บแยกต่อกล้อง:** ตอนนี้ต่อได้ 2 กล้องที่ตั้งคนละมุม ท่าดีที่กล้อง 1 วัดได้จึงใช้กับกล้อง 2 ไม่ได้ เราเลยต่อท้ายชื่อ key ด้วย `cameraId` (เช่น `camwell:posture-baseline:v1:cam-1`)

```ts
// เก็บ/อ่าน baseline ท่านั่งใน localStorage ของเบราว์เซอร์ (อยู่ในเครื่องนี้เท่านั้น)
// แยกเก็บต่อกล้อง (cameraId) เพราะแต่ละกล้องตั้งคนละมุม ท่าดีที่วัดได้จึงไม่เท่ากัน
// ใส่ ":v1" ในชื่อ key ไว้ ถ้าวันหลังเปลี่ยนโครงสร้างข้อมูลจะได้เปลี่ยนเป็น v2 ไม่ชนของเก่า

import type { PostureBaseline } from '../types/posture'

const STORAGE_KEY_PREFIX = 'camwell:posture-baseline:v1:'

export function loadPostureBaseline(cameraId: string): PostureBaseline | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + cameraId)
    return raw ? (JSON.parse(raw) as PostureBaseline) : null
  } catch {
    return null
  }
}

export function savePostureBaseline(cameraId: string, baseline: PostureBaseline): void {
  localStorage.setItem(STORAGE_KEY_PREFIX + cameraId, JSON.stringify(baseline))
}

export function clearPostureBaseline(cameraId: string): void {
  localStorage.removeItem(STORAGE_KEY_PREFIX + cameraId)
}
```

> 💡 **ทำไมต้อง `try...catch`?** ถ้าข้อมูลใน localStorage เสีย (เช่น มีคนไปแก้มือ) `JSON.parse` จะ throw error ทำให้แอปพังทั้งหน้า เราจับไว้แล้วคืน `null` (= ยังไม่เคย calibrate) แทน

---

## ขั้น 4.5 — เชื่อมทุกอย่างเข้า CameraStage

🎯 **เป้าหมาย:** ใช้ฟังก์ชันใหม่ใน loop หลัก + มีปุ่ม "Calibrate ท่านั่งดี" ใต้กล้องแต่ละตัว

> 💡 **ออกแบบ:** เพราะ baseline เป็นของ "กล้องแต่ละตัว" ให้ `CameraStage` เป็นเจ้าของ baseline เองเลย (โหลด/บันทึกด้วย `cameraId` ของตัวเอง) **ไม่ต้องแก้ `App.tsx`** ในขั้นนี้ หลักคิดคือ *เก็บ state ไว้ใกล้คนที่ใช้มันที่สุด*

🛠 **ลงมือ:** ไฟล์ `src/components/CameraStage.tsx` (มีหลายจุด ค่อย ๆ ทำทีละจุด แล้วรัน `npm run build` ดู error ที่เหลือลดลงเรื่อย ๆ)

**(1) Imports** — **หา:**
```ts
import { analyzePosture, POSTURE_LABELS_TH, type PostureAnalysisResult } from '../lib/postureAnalysis'
```
**แทนที่ด้วย:**
```ts
import { classifyPosture, extractPostureFeatures, POSTURE_LABELS_TH } from '../lib/postureAnalysis'
import { smoothFeatures } from '../lib/smoothing'
import { computeBaseline } from '../lib/postureCalibration'
import { loadPostureBaseline, savePostureBaseline } from '../services/postureBaselineStore'
```

**หา:**
```ts
import type { PostureThresholds } from '../types/posture'
```
**แทนที่ด้วย:**
```ts
import type { PostureBaseline, PostureFeatures, PostureThresholds } from '../types/posture'
```

**(2) ค่าคงที่** — **หา:**
```ts
const FACE_DETECT_INTERVAL_MS = 400
```
**แทนที่ด้วย:**
```ts
const POSTURE_SMOOTHING_ALPHA = 0.3 // EMA: ยิ่งน้อยยิ่งเรียบแต่ตอบสนองช้า (ที่ 12 FPS ค่านี้หน่วงราว 0.3 วิ)
const POSTURE_CALIBRATION_MS = 3000 // เก็บตัวอย่างท่าดีนานเท่านี้ตอนกด Calibrate
const FACE_DETECT_INTERVAL_MS = 400
```

**(3) PersonState** — **หา:**
```ts
  postureStatusLabel: string
```
**แทนที่ด้วย:**
```ts
  postureStatusLabel: string
  /** ค่า feature หลังทำ smoothing แล้ว (null = ยังไม่มีข้อมูล) */
  smoothedFeatures: PostureFeatures | null
```

**(4) Tracker data type** — **หา:**
```ts
new PositionTracker<{ landmarks: NormalizedLandmark[]; analysis: PostureAnalysisResult }>
```
**แทนที่ด้วย:**
```ts
new PositionTracker<{ landmarks: NormalizedLandmark[]; features: PostureFeatures }>
```

**(5) State ของ baseline และการ Calibrate** — **หา:**
```ts
  const [enrollName, setEnrollName] = useState('')
```
**แทนที่ด้วย:**
```ts
  const [enrollName, setEnrollName] = useState('')

  // baseline ท่าดีของ "กล้องตัวนี้" (แต่ละกล้องตั้งคนละมุม จึงเก็บแยกตาม cameraId) — โหลดครั้งเดียวตอนสร้าง component
  const [postureBaseline, setPostureBaseline] = useState<PostureBaseline | null>(() => loadPostureBaseline(cameraId))
  // Calibrate ท่าดี: ระหว่างนี้จะเก็บ feature ทุกเฟรมไว้ แล้วหา median ตอนครบเวลา
  const calibrationRef = useRef<{ endsAt: number; samples: PostureFeatures[] } | null>(null)
  const [isCalibratingPosture, setIsCalibratingPosture] = useState(false)
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null)
```
> 💡 `useState(() => ...)` (ใส่ฟังก์ชัน) = "lazy initializer" อ่าน localStorage แค่ครั้งแรกครั้งเดียว ไม่ใช่ทุก render

**(6) ให้ `detectFrame` อ่าน baseline ได้ผ่าน propsRef** — ใน `useRef({ ... })` ของ `propsRef` **และ** ใน `propsRef.current = { ... }` ของ `useEffect` (**ทั้ง 2 ที่**) **หา:**
```ts
    cameraSource,
    cameraLabel,
    multiCameraMode,
```
**แทนที่ด้วย** (ที่ 2 ย่อหน้าลึกกว่า 2 ช่อง ไม่เป็นไร):
```ts
    cameraSource,
    cameraId,
    cameraLabel,
    multiCameraMode,
    postureBaseline,
```
> 💡 `postureBaseline` เป็น state ของ `CameraStage` เอง แต่ `detectFrame` (ที่ rAF เรียก) อ่าน state ตรง ๆ ไม่ได้ (stale closure เหมือนกับ props) จึงต้องผ่าน `propsRef` เหมือนกัน ส่วน `cameraId` ใช้ตอนบันทึก baseline

**(7) ตอนหาคนในเฟรม** — **หา:**
```ts
          const analysis = analyzePosture(landmarks, p.postureThresholds)
          if (analysis.issue === 'no_person') return null
```
**แทนที่ด้วย:**
```ts
          const features = extractPostureFeatures(landmarks, canvas, p.postureThresholds.minVisibility)
          if (!features) return null
```
> 💡 ส่ง `canvas` เป็น `frame` ได้เพราะ canvas มี `width` และ `height` ตรงกับ `FrameSize` (TypeScript ดู "รูปร่าง" ไม่ได้ดูชื่อ type — เรียกว่า *structural typing*) และ canvas ถูกตั้งขนาดให้เท่ากับภาพจากกล้องทุกเฟรมอยู่แล้ว ใช้ได้ทั้งกล้องในเครื่องและกล้อง IP

**หา:** `return { position: anchorNorm, data: { landmarks, analysis } }`
**แทนที่ด้วย:** `return { position: anchorNorm, data: { landmarks, features } }`

**(8)** **หา:** `const { landmarks, analysis } = match.data`
**แทนที่ด้วย:** `const { landmarks, features } = match.data`

**(9)** ตอนสร้างคนใหม่ **หา:**
```ts
            postureStatusLabel: POSTURE_LABELS_TH.no_person,
```
**แทนที่ด้วย:**
```ts
            postureStatusLabel: POSTURE_LABELS_TH.no_person,
            smoothedFeatures: null,
```

**(10) หัวใจ: วัด → เรียบ → ตัดสิน** — **หา:**
```ts
        person.postureStatusLabel =
          POSTURE_LABELS_TH[analysis.issue] + (analysis.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
```
**แทนที่ด้วย:**
```ts
        // ระหว่าง Calibrate: เก็บค่าดิบไว้ (ต้องมีคนเดียวในเฟรม จะได้ไม่ปนกับคนอื่น)
        if (calibrationRef.current && matches.length === 1) calibrationRef.current.samples.push(features)

        const smoothed = smoothFeatures(person.smoothedFeatures, features, POSTURE_SMOOTHING_ALPHA)
        person.smoothedFeatures = smoothed
        const postureIssue = classifyPosture(smoothed, p.postureThresholds, p.postureBaseline)

        person.postureStatusLabel =
          POSTURE_LABELS_TH[postureIssue] + (smoothed.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
```

**(11) ส่วนตรวจหกล้ม: ใช้ค่าดิบ** — **หา:**
```ts
            // มองไม่เห็นสะโพก (torsoAngleDeg = null) = ยืนยันไม่ได้ว่าลำตัวราบ — เหลือแค่เส้นทาง "หายไปจากเฟรม" ด้านบน
            const torsoAngleDeg = analysis.torsoAngleDeg
```
**แทนที่ด้วย:**
```ts
            // ใช้ค่าดิบ (ไม่ผ่าน smoothing) เพราะหกล้มเกิดเร็ว smoothing จะทำให้ตรวจช้า/พลาด
            // มองไม่เห็นสะโพก (torsoAngleDeg = null) = ยืนยันไม่ได้ว่าลำตัวราบ — เหลือแค่เส้นทาง "หายไปจากเฟรม" ด้านบน
            const torsoAngleDeg = features.torsoAngleDeg
```
> 🤔 **ทำไมไม่ใช้ `smoothed`?** smoothing ตั้งใจให้ตัวเลข "ตามช้า" เพื่อไม่ให้ท่านั่งเตือนมั่ว แต่การหกล้มเกิดในเสี้ยววินาที ถ้าใช้ค่าที่ถูกทำให้ช้าลง มุมลำตัวอาจยังไม่ถึงเกณฑ์ตอนที่ไหล่ร่วงพอดี → พลาดการแจ้งเตือน **เลือกเครื่องมือให้ตรงงาน**: ท่านั่ง = ค่าเรียบ, เหตุฉุกเฉิน = ค่าดิบ

**(12) state machine ของท่านั่ง** — **หา:**
```ts
        const postureIssue = analysis.issue === 'no_person' ? 'no_signal' : analysis.issue
        const step = stepSustainedAlert(
          person.postureState,
          { issue: postureIssue, metrics: { neckAngleDeg: analysis.neckAngleDeg, torsoAngleDeg: analysis.torsoAngleDeg ?? 0, shoulderTiltDeg: analysis.shoulderTiltDeg } },
```
**แทนที่ด้วย** (บรรทัด `const postureIssue` ย้ายไปอยู่ข้อ (10) แล้ว):
```ts
        const step = stepSustainedAlert(
          person.postureState,
          { issue: postureIssue, metrics: { neckAngleDeg: smoothed.neckAngleDeg, torsoAngleDeg: smoothed.torsoAngleDeg ?? 0, shoulderTiltDeg: smoothed.shoulderTiltDeg } },
```

**(13) จบการ Calibrate** — **หา:**
```ts
      // เตือนพัก: นับระดับกล้อง
```
**แทนที่ด้วย:**
```ts
      // ครบเวลา Calibrate แล้ว — หา baseline จากตัวอย่างที่เก็บมา แล้วบันทึกแยกตามกล้องนี้
      const calibration = calibrationRef.current
      if (calibration && now >= calibration.endsAt) {
        calibrationRef.current = null
        setIsCalibratingPosture(false)
        const baseline = computeBaseline(calibration.samples, now)
        if (baseline) {
          savePostureBaseline(p.cameraId, baseline)
          setPostureBaseline(baseline)
          setCalibrationMessage('Calibrate ท่านั่งสำเร็จ ✓ ระบบจะเทียบกับท่านี้เป็นหลัก')
        } else {
          setCalibrationMessage('Calibrate ไม่สำเร็จ — ต้องมีคนเดียวในเฟรมและเห็นหัว+ไหล่ชัดเจน ลองใหม่อีกครั้ง')
        }
      }

      // เตือนพัก: นับระดับกล้อง
```

**(14) ฟังก์ชันเมื่อกดปุ่ม** — **หา:**
```ts
  const handleEnroll = useCallback(() => {
```
**แทนที่ด้วย:**
```ts
  const handleCalibratePosture = useCallback(() => {
    calibrationRef.current = { endsAt: Date.now() + POSTURE_CALIBRATION_MS, samples: [] }
    setIsCalibratingPosture(true)
    setCalibrationMessage('กำลัง Calibrate... นั่งท่าที่ดีที่สุดค้างไว้ 3 วินาที')
  }, [])

  const handleEnroll = useCallback(() => {
```

**(15) ปุ่มบนจอ** — ใน JSX ส่วนล่าง **หา:**
```tsx
      {faceFeaturesEnabled && (
        <>
          <button type="button" className="secondary-button" onClick={handleCalibrate}
```
**แทนที่ด้วย:**
```tsx
      <button type="button" className="secondary-button" onClick={handleCalibratePosture} disabled={isCalibratingPosture}>
        {isCalibratingPosture ? 'กำลัง Calibrate...' : postureBaseline ? 'Calibrate ท่านั่งดีใหม่' : 'Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)'}
      </button>
      {calibrationMessage && <p className="panel-note">{calibrationMessage}</p>}
      {faceFeaturesEnabled && (
        <>
          <button type="button" className="secondary-button" onClick={handleCalibrate}
```

✅ **ตรวจสอบ:**
1. `npm run build` → ต้องผ่าน **0 error**
   - ถ้า error ให้อ่านว่า **ไฟล์ไหน บรรทัดไหน** แล้วกลับไปดูว่าข้ามจุดไหน
   - ถ้า error `Cannot find name 'analysis'` = ยังมีจุดที่ใช้ `analysis` เหลืออยู่ (ค้นหาคำว่า `analysis.` ใน CameraStage ต้องไม่เจอเลย)
2. `npm run dev` → เห็นปุ่ม "Calibrate ท่านั่งดี (แนะนำให้ทำก่อนใช้งาน)" ใต้กล้อง
3. นั่งท่าดี → กดปุ่ม → นิ่ง 3 วินาที → ต้องขึ้น "Calibrate ท่านั่งสำเร็จ ✓"
4. F12 → Application → Local Storage → ต้องเห็น key `camwell:posture-baseline:v1:cam-1` พร้อมตัวเลข
5. **รีเฟรชหน้าเว็บ** → ปุ่มต้องเปลี่ยนเป็น "Calibrate ท่านั่งดีใหม่" (= โหลด baseline กลับมาได้)
6. **ทดสอบความแม่น:** ก้มหน้าดูมือถือค้าง 8 วิ → ต้องแจ้งเตือน "ก้มคอ/ยื่นคอ" / นั่งตรง → ต้องไม่เตือน
7. (ถ้ามี 2 กล้อง) กด "+ เพิ่มกล้อง" → กล้อง 2 ต้องขึ้นปุ่ม "Calibrate ท่านั่งดี" (ยังไม่มี baseline) ไม่ใช่ "ใหม่"

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม Personal Calibration (แยกต่อกล้อง), EMA smoothing, คำนวณมุมใน pixel space, feature headHeightRatio"
```

---

## ขั้น 4.6 — ปรับจูน threshold (ทดลองเอง)

🎯 **เป้าหมาย:** หาค่าที่เหมาะกับการใช้งานจริง

🤔 **ทำไม:** หลัง calibrate แล้ว ความหมายของ threshold **เปลี่ยน** จาก "มุมคอเกิน 25°" เป็น "มุมคอ **มากกว่าตอน calibrate** เกิน 25°" ซึ่ง 25° น่าจะหลวมเกินไป

🛠 **ลงมือ (แบบฝึกหัด):**

1. **เพิ่ม slider ปรับ `headDropThreshold`** ใน `SettingsPanel.tsx` ต่อจาก slider "มุมเอียงไหล่ที่ยอมรับได้":
   ```tsx
      <Slider
        label="หัวต่ำลงจากท่าที่ Calibrate ได้ไม่เกิน"
        unit="%"
        min={5}
        max={40}
        step={1}
        value={Math.round(postureThresholds.headDropThreshold * 100)}
        onChange={(v) => setPosture('headDropThreshold', v / 100)}
      />
   ```
2. **ทดลองแล้วจดผล:** ลองค่า neck threshold 10°, 15°, 20° และ head drop 10%, 15%, 20% แบบไหนเตือนตอนก้มจริง แต่ไม่เตือนตอนนั่งปกติ?
3. **ถ้าอยากเห็นตัวเลขสด ๆ** ใช้เทคนิค `console.log` แบบขั้น 2.1 พิมพ์ค่า `smoothed` วินาทีละครั้ง

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม slider headDropThreshold"
git checkout main
git merge phase-4-calibration
```

🧠 **คำถามทบทวน Phase 4:**
1. อธิบายด้วยคำพูดตัวเองว่าทำไมต้องแปลงเป็นพิกเซลก่อนคำนวณมุม
2. ทำไม `headHeightRatio` ถึงต้องหารด้วยความกว้างไหล่?
3. ถ้าเปลี่ยน `POSTURE_SMOOTHING_ALPHA` เป็น 0.05 จะเกิดอะไรขึ้น? ลองดู!
4. ถ้าผู้ใช้ย้ายโน้ตบุ๊กไปโต๊ะอื่น ควรทำอะไร?

---

# Phase 5 — Automated Tests ด้วย Vitest

```bash
git checkout -b phase-5-tests
```

## ทำไมต้องเขียน Test?

ทุกครั้งที่แก้โค้ด เราต้องเปิดกล้อง นั่งท่าต่าง ๆ ทดสอบด้วยมือ ซึ่ง **ช้า เหนื่อย และลืมทดสอบบางกรณี**

Unit test = โค้ดที่ทดสอบโค้ด **รันทั้งหมดในไม่ถึง 1 วินาที** ทุกครั้งที่แก้ เช่น:
> "ถ้าใส่ท่าที่ไหล่เอียง 17° ฟังก์ชัน `classifyPosture` ต้องตอบ `leaning`"

ข่าวดี: ไฟล์ใน `src/lib/` เป็น **pure function** (ใส่ input → ได้ output ไม่ยุ่งกับกล้อง/หน้าจอ) จึงเทสง่ายมาก

📚 **ศึกษาก่อน:**
- Vitest Getting Started — https://vitest.dev/guide/
- แนวคิด **Arrange → Act → Assert** (เตรียมข้อมูล → เรียกฟังก์ชัน → ตรวจผล)
- `describe`, `it`, `expect`, `toBe`, `toEqual`, `toBeNull`, `toBeCloseTo` — https://vitest.dev/api/expect.html

## ขั้น 5.1 — ติดตั้ง Vitest

🛠 **ลงมือ:**

```bash
npm install -D vitest
```

เปิด `package.json` ในส่วน `"scripts"` เพิ่มบรรทัด `"test"`:
```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "test": "vitest",
    "preview": "vite preview",
    "setup:assets": "node scripts/setup-assets.mjs",
    "postinstall": "node scripts/setup-assets.mjs"
  },
```
> ⚠️ ระวังเครื่องหมาย `,` ท้ายบรรทัด JSON ถ้าขาดหรือเกินจะ error

> 💡 (ทดสอบแล้วว่า Vitest เวอร์ชัน 5 ใช้ร่วมกับ Vite 8 ของโปรเจกต์นี้ได้) ถ้าติดตั้งแล้วเจอ error เรื่อง "peer dependency" ให้ดูตารางความเข้ากันได้ที่ https://vitest.dev/guide/
>
> ⚠️ รันคำสั่งนี้ที่ **โฟลเดอร์หลักของโปรเจกต์** (ไม่ใช่ในโฟลเดอร์ `backend/` ซึ่งเป็นอีกโปรเจกต์แยกที่มี `package.json` ของตัวเอง)

## ขั้น 5.2 — Test แรก: State Machine (และเจอบั๊กจริง!)

🛠 **ลงมือ:** **สร้างไฟล์ `src/lib/sustainedAlertMachine.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'
import { initialSustainedState, stepSustainedAlert, type SustainedAlertState } from './sustainedAlertMachine'

const SUSTAINED_MS = 5000

/** ช่วยเรียก state machine ทีละเฟรม — ส่ง issue เดิมทุกๆ stepMs จนครบ durationMs */
function feed(state: SustainedAlertState, issue: 'good' | 'slouching', fromMs: number, durationMs: number, stepMs = 100) {
  const started = []
  const ended = []
  for (let t = fromMs; t <= fromMs + durationMs; t += stepMs) {
    const r = stepSustainedAlert(state, { issue, metrics: { torsoAngleDeg: 20 } }, t, 'posture', SUSTAINED_MS)
    state = r.state
    if (r.startedEvent) started.push(r.startedEvent)
    if (r.endedEvent) ended.push(r.endedEvent)
  }
  return { state, started, ended }
}

describe('stepSustainedAlert', () => {
  it('ยังไม่เตือน ถ้านั่งท่าไม่ดีไม่ถึงเวลาที่กำหนด', () => {
    const r = feed(initialSustainedState, 'slouching', 0, 4000)
    expect(r.started).toHaveLength(0)
  })

  it('เตือน 1 ครั้ง เมื่อนั่งท่าไม่ดีต่อเนื่องครบเวลา', () => {
    const r = feed(initialSustainedState, 'slouching', 0, 6000)
    expect(r.started).toHaveLength(1)
    expect(r.started[0].type).toBe('slouching')
  })

  it('จบการเตือน เมื่อกลับมานั่งท่าดีต่อเนื่องสักพัก', () => {
    const bad = feed(initialSustainedState, 'slouching', 0, 6000)
    const good = feed(bad.state, 'good', 6100, 2000)
    expect(good.ended).toHaveLength(1)
    expect(good.state.activeEvent).toBeNull()
  })
})
```

รัน:
```bash
npm test
```

### 😮 ผล: Test 2 ข้อ FAIL!

```
× เตือน 1 ครั้ง เมื่อนั่งท่าไม่ดีต่อเนื่องครบเวลา
× จบการเตือน เมื่อกลับมานั่งท่าดีต่อเนื่องสักพัก
AssertionError: expected [] to have a length of 1 but got +0
```

**นี่คือบั๊กจริงที่ test จับได้!** มาสืบกัน:

เปิด `src/lib/sustainedAlertMachine.ts` ดูบรรทัดนี้:
```ts
  const sustainedFor = state.candidateSince ? now - state.candidateSince : 0
```

ใน test เราเริ่มที่เวลา `t = 0` ดังนั้น `candidateSince = 0`
แต่ใน JavaScript **`0` ถือเป็น "เท็จ" (falsy)** → `state.candidateSince ? ...` ได้ผลเป็น `0` เสมอ → ไม่มีวันเตือน!

> 📚 **ศึกษา:** Truthy / Falsy ใน JavaScript — https://developer.mozilla.org/en-US/docs/Glossary/Falsy
> ค่าที่ถือเป็น "เท็จ" มี: `false`, `0`, `""`, `null`, `undefined`, `NaN`

> 🤔 **ทำไมในแอปจริงไม่เจอ?** เพราะแอปใช้ `Date.now()` ซึ่งเป็นเลขใหญ่มาก (เช่น 1760000000000) ไม่มีวันเป็น 0 แต่ **โค้ดแบบนี้เปราะบาง** ถ้าวันหนึ่งเปลี่ยนไปใช้ `performance.now()` (ซึ่งเริ่มนับจาก 0 ตอนเปิดหน้าเว็บ) จะพังทันที test ช่วยให้เราเจอก่อนเกิดปัญหาจริง

🛠 **แก้:** ไฟล์ `src/lib/sustainedAlertMachine.ts` แก้ **3 จุด** ให้เช็ค `null` ตรง ๆ:

**หา:**
```ts
    if (state.lastSignalAt && now - state.lastSignalAt < NO_SIGNAL_GRACE_MS) {
```
**แทนที่ด้วย:**
```ts
    if (state.lastSignalAt !== null && now - state.lastSignalAt < NO_SIGNAL_GRACE_MS) {
```

**หา:**
```ts
    if (!state.goodSince) state.goodSince = now
```
**แทนที่ด้วย:**
```ts
    if (state.goodSince === null) state.goodSince = now
```

**หา:**
```ts
  const sustainedFor = state.candidateSince ? now - state.candidateSince : 0
```
**แทนที่ด้วย:**
```ts
  const sustainedFor = state.candidateSince !== null ? now - state.candidateSince : 0
```

รัน `npm test` อีกครั้ง → ต้องผ่านทั้ง 3 ข้อ ✅

> 🎓 **บทเรียนสำคัญ:** เวลาเช็คว่า "มีค่าหรือยัง" สำหรับตัวเลข ให้ใช้ `!== null` เสมอ อย่าใช้ `if (x)` เฉย ๆ

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม Vitest + test state machine, แก้บั๊ก falsy-zero ใน sustainedAlertMachine"
```

## ขั้น 5.3 — Test ตัวจับเวลาเตือนพัก (ยืนยันว่าขั้น 1.4 ถูกต้อง)

🛠 **สร้างไฟล์ `src/lib/breakReminder.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'
import { initialBreakState, stepBreakReminder } from './breakReminder'
import type { BreakThresholds } from '../types/wellbeing'

const MIN = 60 * 1000
const thresholds: BreakThresholds = { continuousSittingMs: 45 * MIN, breakResetMs: 3 * MIN }

describe('stepBreakReminder', () => {
  it('หายไปแป๊บเดียว (10 วิ) ยังนับเป็นรอบนั่งเดิม', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    state = stepBreakReminder(state, true, 40 * MIN, thresholds).state
    state = stepBreakReminder(state, false, 40 * MIN + 10_000, thresholds).state // ลุกไป 10 วิ
    const back = stepBreakReminder(state, true, 40 * MIN + 20_000, thresholds)
    expect(back.state.continuousSinceMs).toBe(0) // ยังนับจากเวลาเริ่มเดิม
    expect(back.continuousMinutes).toBe(40)
  })

  it('หายไปนานเกิน breakResetMs ถือว่าพักแล้ว เริ่มนับใหม่', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    state = stepBreakReminder(state, true, 40 * MIN, thresholds).state
    state = stepBreakReminder(state, false, 44 * MIN, thresholds).state // หายไป 4 นาที
    expect(state.continuousSinceMs).toBeNull()
  })

  it('เตือนครั้งเดียวเมื่อนั่งครบเวลา ไม่เตือนซ้ำทุกเฟรม', () => {
    let state = stepBreakReminder(initialBreakState, true, 0, thresholds).state
    const first = stepBreakReminder(state, true, 45 * MIN, thresholds)
    state = first.state
    const second = stepBreakReminder(state, true, 45 * MIN + 100, thresholds)
    expect(first.shouldRemind).toBe(true)
    expect(second.shouldRemind).toBe(false)
  })
})
```

> 💡 สังเกตความสวยงาม: เราทดสอบ "นั่ง 40 นาที" ได้ในเสี้ยววินาที โดยแค่ส่งตัวเลขเวลาเข้าไป ไม่ต้องนั่งรอจริง นี่คือข้อดีที่ฟังก์ชันรับ `now` เป็น parameter แทนที่จะเรียก `Date.now()` ข้างใน

## ขั้น 5.4 — Test การวิเคราะห์ท่านั่งด้วย "คนจำลอง"

🤔 **แนวคิด:** เราสร้าง landmark ปลอม (synthetic) ที่รู้คำตอบแน่นอน เช่น "ไหล่ระดับเดียวกัน หูอยู่ตรงเหนือไหล่" = ท่าดี แล้วตรวจว่าฟังก์ชันตอบถูก

🛠 **สร้างไฟล์ `src/lib/postureAnalysis.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'
import { classifyPosture, extractPostureFeatures } from './postureAnalysis'
import { computeBaseline } from './postureCalibration'
import { DEFAULT_THRESHOLDS, type Point } from '../types/posture'

const FRAME = { width: 640, height: 480 }
const MIN_VIS = DEFAULT_THRESHOLDS.minVisibility

/**
 * สร้าง landmark จำลอง 33 จุด (ทุกจุดมองไม่เห็นเป็นค่าเริ่มต้น) แล้วใส่เฉพาะจุดที่ต้องการ
 * หมายเหตุ: กล้องหน้า "ไหล่ซ้าย" ของคนจะอยู่ฝั่งขวาของภาพ (x มากกว่า)
 */
function makePose(points: Record<number, [number, number]>): Point[] {
  const lm: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  for (const [index, [x, y]] of Object.entries(points)) {
    lm[Number(index)] = { x, y, visibility: 0.99 }
  }
  return lm
}

// ท่าดี: หูอยู่ตรงเหนือไหล่ ไหล่ระดับเดียวกัน (มองไม่เห็นสะโพก — แบบกล้องโน้ตบุ๊ก)
const GOOD = makePose({ 7: [0.55, 0.3], 8: [0.45, 0.3], 11: [0.62, 0.5], 12: [0.38, 0.5] })
// เอียงข้าง: ไหล่ซ้ายต่ำกว่าไหล่ขวา
const LEAN = makePose({ 7: [0.55, 0.3], 8: [0.45, 0.3], 11: [0.62, 0.55], 12: [0.38, 0.45] })
// ยื่นคอ/ก้ม: หัวต่ำลงมาใกล้ไหล่
const HEAD_DOWN = makePose({ 7: [0.55, 0.36], 8: [0.45, 0.36], 11: [0.62, 0.5], 12: [0.38, 0.5] })

function featuresOf(pose: Point[]) {
  const f = extractPostureFeatures(pose, FRAME, MIN_VIS)
  if (!f) throw new Error('ควรได้ feature แต่ได้ null')
  return f
}

describe('extractPostureFeatures', () => {
  it('ท่าดี: ไหล่ไม่เอียง (ต้องได้ ~0° ไม่ใช่ ~180°)', () => {
    expect(featuresOf(GOOD).shoulderTiltDeg).toBeCloseTo(0, 1)
  })

  it('มองไม่เห็นสะโพก ยังวิเคราะห์ได้ แต่เป็น upper_body และไม่มีมุมลำตัว', () => {
    const f = featuresOf(GOOD)
    expect(f.quality).toBe('upper_body')
    expect(f.torsoAngleDeg).toBeNull()
  })

  it('มองไม่เห็นไหล่ → null (ไม่พบคน)', () => {
    const noShoulders = makePose({ 7: [0.55, 0.3], 8: [0.45, 0.3] })
    expect(extractPostureFeatures(noShoulders, FRAME, MIN_VIS)).toBeNull()
  })
})

describe('classifyPosture', () => {
  it('ท่าดี → good', () => {
    expect(classifyPosture(featuresOf(GOOD), DEFAULT_THRESHOLDS, null)).toBe('good')
  })

  it('ไหล่เอียง → leaning', () => {
    expect(classifyPosture(featuresOf(LEAN), DEFAULT_THRESHOLDS, null)).toBe('leaning')
  })

  it('หลัง Calibrate: หัวต่ำลงกว่าท่าดี → forward_head', () => {
    const baseline = computeBaseline(Array.from({ length: 20 }, () => featuresOf(GOOD)), 0)
    expect(baseline).not.toBeNull()
    expect(classifyPosture(featuresOf(HEAD_DOWN), DEFAULT_THRESHOLDS, baseline)).toBe('forward_head')
  })
})
```

> 🧪 **ลองพิสูจน์ว่า test มีประโยชน์จริง:** ไปแก้ `shoulderTilt` ใน `postureAnalysis.ts` ให้กลับเป็นสูตรเดิม (ไม่มี `Math.abs`) แล้วรัน `npm test` → test "ไหล่ไม่เอียง" จะ FAIL ทันที (ได้ ~180) จากนั้นแก้กลับ
> นี่คือ **regression test** = test ที่ป้องกันไม่ให้บั๊กเดิมกลับมา

✅ **ตรวจสอบ:**
```bash
npm test
```
ต้องได้ประมาณ:
```
 Test Files  3 passed (3)
      Tests  12 passed (12)
```
(กด `q` เพื่อออกจากโหมด watch) แล้ว `npm run build` ต้องผ่านด้วย

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม unit test: break timer และ posture analysis ด้วย synthetic landmarks"
```

## ขั้น 5.5 — Test การตรวจหกล้ม (`fallDetection.ts`)

🤔 **ทำไม:** การแจ้งเตือนหกล้มเป็นฟีเจอร์ที่ **ทดสอบด้วยมือยากและเสี่ยงที่สุด** (ไม่มีใครอยากล้มจริงทุกครั้งที่แก้โค้ด) ข่าวดีคือส่วนคำนวณถูกแยกไว้เป็น pure function ใน `src/lib/fallDetection.ts` แล้ว เทสได้ทันที

🛠 **สร้างไฟล์ `src/lib/fallDetection.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'
import { computeDropRatio, pruneHistory } from './fallDetection'

describe('computeDropRatio', () => {
  it('ข้อมูลจุดเดียว → ยังคำนวณไม่ได้ (null)', () => {
    expect(computeDropRatio([{ t: 0, y: 0.4 }])).toBeNull()
  })

  it('ไหล่ร่วงจาก y=0.40 ลงไป y=0.70 → ร่วง 0.30', () => {
    const history = [
      { t: 0, y: 0.4 },
      { t: 200, y: 0.5 },
      { t: 400, y: 0.7 },
    ]
    expect(computeDropRatio(history)).toBeCloseTo(0.3)
  })

  it('ลุกขึ้น (y ลดลง) → ไม่นับเป็นการร่วง', () => {
    const history = [
      { t: 0, y: 0.7 },
      { t: 400, y: 0.4 },
    ]
    expect(computeDropRatio(history)).toBe(0)
  })
})

describe('pruneHistory', () => {
  it('ตัดข้อมูลที่เก่ากว่าหน้าต่างเวลาทิ้ง', () => {
    const history = [
      { t: 0, y: 0.4 },
      { t: 500, y: 0.45 },
      { t: 900, y: 0.5 },
    ]
    expect(pruneHistory(history, 1000, 700)).toEqual([
      { t: 500, y: 0.45 },
      { t: 900, y: 0.5 },
    ])
  })
})
```

> 💡 **จำไว้:** ในภาพ แกน y **ชี้ลง** (0 = บนสุด, 1 = ล่างสุด) "ร่วงลง" จึงแปลว่า y **เพิ่มขึ้น** ถ้าสับสนเรื่องนี้ test ข้อ "ลุกขึ้น" จะช่วยเตือน

✅ **ตรวจสอบ:**
```bash
npx vitest run
```
ต้องได้:
```
 Test Files  4 passed (4)
      Tests  16 passed (16)
```

> 🧪 **แบบฝึกหัด:** ส่วนที่ตัดสินว่า "แจ้งเตือนหกล้มไหม" (รวมบั๊กที่แก้ในขั้น 1.5) ยังอยู่ใน `CameraStage.tsx` จึงยังเทสไม่ได้ ลองคิดว่าถ้าจะย้ายมาเป็นฟังก์ชัน `shouldAlertLeftFrame(lastSeenAt, lastRapidDropAt, graceMs): boolean` ใน `fallDetection.ts` จะเขียน test อะไรบ้าง (ใบ้: ค่าขอบ เช่น ห่างกันพอดี 2500 ms)

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม unit test ให้ fallDetection"
```

## ขั้น 5.6 — (ขั้นท้าทาย ทำทีหลังได้) แยก logic ออกจาก React

🤔 **ปัญหา:** `CameraStage.tsx` ยาว 800+ บรรทัด ปนทั้ง "หน้าจอ" กับ "สมอง" ส่วนที่อยู่ใน `detectFrame` (จับคู่คน → วัด → เรียบ → ตัดสิน → state machine → ตรวจหกล้ม → เตือนพัก) **เทสไม่ได้** เพราะผูกกับ React และกล้อง ยิ่งมีฟีเจอร์ใหม่ (กล้อง IP, หกล้ม, หลายกล้อง) มาเพิ่ม ไฟล์นี้ก็ยิ่งโต

**แนวคิด:** ย้าย logic ต่อเฟรมออกไปเป็นฟังก์ชัน/คลาสล้วน เช่น:

```ts
// src/lib/postureEngine.ts (แนวคิด — ยังไม่ต้องเขียนตามนี้เป๊ะ)
export interface EngineEvents {
  started: AlertEvent[]
  ended: AlertEvent[]
  breakDue: { continuousMinutes: number } | null
}

export class PostureEngine {
  processPoseFrame(allLandmarks: Point[][], frame: FrameSize, now: number, settings: EngineSettings): EngineEvents {
    // ย้ายโค้ดจาก detectFrame ส่วน "tracker → features → smoothing → classify → state machine → หกล้ม → เตือนพัก" มาที่นี่
  }
}
```

แล้ว `CameraStage` เหลือแค่: เรียกกล้อง → เรียก `engine.processPoseFrame(...)` → เอาผลไปแสดง/เล่นเสียง

**ประโยชน์:** เทส "ทั้งระบบ" ได้ด้วย landmark จำลอง เช่น "ส่งท่าก้ม 10 วินาที → ต้องได้ event เตือน 1 ครั้ง" หรือ "ส่งไหล่ร่วงเร็วแล้วหายไป 5 วินาที → ต้องได้ `fall_suspected_left_frame` 1 ครั้ง" (บั๊กขั้น 1.5 จะถูกจับได้ด้วย test นี้)

📚 **ศึกษาก่อนทำ:**
- *Separation of Concerns* / *Functional core, imperative shell* (ค้นหาคำนี้ใน YouTube)
- JavaScript Classes — https://javascript.info/classes
- ⚠️ โปรเจกต์นี้ตั้ง `erasableSyntaxOnly: true` ห้ามใช้ `constructor(private x: number)` (parameter properties) และห้ามใช้ `enum` ให้ประกาศ field แยกแบบใน `src/lib/tracker.ts`

> 💬 ขั้นนี้ refactor ใหญ่ แนะนำให้ทำหลังเข้าใจ Phase 1–4 ดีแล้ว และทำเป็น branch แยก ถ้าติดให้ถาม Claude ได้

```bash
git checkout main
git merge phase-5-tests
```

---

# Phase 6 — รองรับหลายปัญหาพร้อมกัน + Dataset Recorder

```bash
git checkout -b phase-6-issues-dataset
```

## ขั้น 6.1 — `issues[]`: คนหนึ่งมีหลายปัญหาพร้อมกันได้

🎯 **เป้าหมาย:** ถ้าก้มคอ **และ** เอียงข้างพร้อมกัน ระบบเตือนทั้ง 2 อย่าง

🤔 **ทำไม — ปัญหา 2 ข้อของระบบปัจจุบัน:**

**ข้อ 1:** `classifyPosture` ใช้ `if ... return` ตอบได้ทีละ 1 ปัญหา (ปัญหาแรกที่เจอ) ปัญหาอื่นถูกซ่อน

**ข้อ 2 (บั๊กแฝง):** ใน state machine ถ้าปัญหา **สลับไปมา** ตัวจับเวลาจะเริ่มนับใหม่ทุกครั้ง:
```
วินาทีที่ 0–4: forward_head   (นับ 0→4)
วินาทีที่ 4–8: slouching      (เปลี่ยนปัญหา! เริ่มนับ 0 ใหม่)
วินาทีที่ 8–12: forward_head  (เปลี่ยนอีก! นับ 0 ใหม่)
→ ท่าแย่ตลอด 12 วินาที แต่ไม่เคยเตือนเลย 😱
```

**วิธีแก้ที่สวยงาม:** ไม่ต้องแก้ state machine เลย! แค่ให้แต่ละปัญหามี **state machine ของตัวเอง** (3 ตัว) แต่ละตัวถามแค่ว่า "เฟรมนี้มีปัญหาของฉันไหม"

```
forward_head machine:  เจอ / ไม่เจอ (good)   → เตือน forward_head อิสระ
slouching machine:     เจอ / ไม่เจอ (good)   → เตือน slouching อิสระ
leaning machine:       เจอ / ไม่เจอ (good)   → เตือน leaning อิสระ
```

📚 **ศึกษาก่อน:**
- `Record<K, V>` ใน TypeScript — https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type
- `array.includes()`, `array.join()`

🛠 **ลงมือ:**

**(1) ไฟล์ `src/types/posture.ts`** — **หา:**
```ts
export type PostureIssueType = 'forward_head' | 'slouching' | 'leaning' | 'good' | 'no_person'
```
**แทนที่ด้วย:**
```ts
export type PostureIssueType = 'forward_head' | 'slouching' | 'leaning' | 'good' | 'no_person'

/** เฉพาะ "ปัญหา" ท่านั่ง (ไม่รวม good/no_person) — คนหนึ่งมีได้หลายปัญหาพร้อมกัน */
export type PostureProblem = 'forward_head' | 'slouching' | 'leaning'

export const POSTURE_PROBLEMS: PostureProblem[] = ['forward_head', 'slouching', 'leaning']
```

**(2) ไฟล์ `src/lib/postureAnalysis.ts`**

ใน import ด้านบน เพิ่ม `PostureProblem,` ต่อจาก `PostureIssueType,`

**หา:**
```ts
): Exclude<PostureIssueType, 'no_person'> {
```
**แทนที่ด้วย:**
```ts
): PostureProblem[] {
```

**หา:**
```ts
  if (torso !== null && torso >= t.torsoAngleThresholdDeg) return 'slouching'
  if (neck >= t.neckAngleThresholdDeg || (headDrop !== null && headDrop >= t.headDropThreshold)) return 'forward_head'
  if (tilt >= t.shoulderTiltThresholdDeg) return 'leaning'
  return 'good'
```
**แทนที่ด้วย:**
```ts
  const issues: PostureProblem[] = []
  if (neck >= t.neckAngleThresholdDeg || (headDrop !== null && headDrop >= t.headDropThreshold)) issues.push('forward_head')
  if (torso !== null && torso >= t.torsoAngleThresholdDeg) issues.push('slouching')
  if (tilt >= t.shoulderTiltThresholdDeg) issues.push('leaning')
  return issues
```
และแก้คอมเมนต์เหนือฟังก์ชันเพิ่มบรรทัด: `* คืน array ของทุกปัญหาที่พบ (array ว่าง = ท่าดี)`

**(3) ไฟล์ `src/components/CameraStage.tsx`**

**(3a)** **หา:**
```ts
import type { PostureBaseline, PostureFeatures, PostureThresholds } from '../types/posture'
```
**แทนที่ด้วย:**
```ts
import { POSTURE_PROBLEMS, type PostureBaseline, type PostureFeatures, type PostureProblem, type PostureThresholds } from '../types/posture'
```

**(3b)** ใน `PersonState` **หา:**
```ts
  postureState: SustainedAlertState
```
**แทนที่ด้วย:**
```ts
  /** state machine แยกต่อปัญหา — หลายปัญหา active พร้อมกันได้ */
  postureStates: Record<PostureProblem, SustainedAlertState>
```

**(3c)** เพิ่มฟังก์ชันช่วย — **หา:**
```ts
type FaceResult =
```
**แทนที่ด้วย:**
```ts
function createPostureStates(): Record<PostureProblem, SustainedAlertState> {
  return { forward_head: initialSustainedState, slouching: initialSustainedState, leaning: initialSustainedState }
}

type FaceResult =
```

**(3d)** ใน `recomputeAlertUi` **หา:**
```ts
      if (person.postureState.activeEvent) labels.push(`${name}: ${person.postureStatusLabel}`)
```
**แทนที่ด้วย:**
```ts
      for (const problem of POSTURE_PROBLEMS) {
        if (person.postureStates[problem].activeEvent) labels.push(`${name}: ${POSTURE_LABELS_TH[problem]}`)
      }
```

**(3e)** ตอนลบคนที่หายไป **หา:**
```ts
        if (person.postureState.activeEvent) p.onAlertEnd({ ...person.postureState.activeEvent, endedAt: now })
```
**แทนที่ด้วย:**
```ts
        for (const problem of POSTURE_PROBLEMS) {
          const active = person.postureStates[problem].activeEvent
          if (active) p.onAlertEnd({ ...active, endedAt: now })
        }
```

**(3f)** ตอนสร้างคนใหม่ **หา:**
```ts
            postureState: initialSustainedState,
```
**แทนที่ด้วย:**
```ts
            postureStates: createPostureStates(),
```

**(3g)** ส่วนตัดสินท่านั่ง (2 จุด เพราะมีโค้ดตรวจหกล้มคั่นกลาง) — จุดแรก **หา:**
```ts
        const postureIssue = classifyPosture(smoothed, p.postureThresholds, p.postureBaseline)

        person.postureStatusLabel =
          POSTURE_LABELS_TH[postureIssue] + (smoothed.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
```
**แทนที่ด้วย:**
```ts
        const issues = classifyPosture(smoothed, p.postureThresholds, p.postureBaseline)

        const issueText = issues.length > 0 ? issues.map((i) => POSTURE_LABELS_TH[i]).join(' + ') : POSTURE_LABELS_TH.good
        person.postureStatusLabel = issueText + (smoothed.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
```

จุดที่สอง (หลังส่วนตรวจหกล้ม ท้าย loop `for (const match of matches)`) **หา:**
```ts
        const step = stepSustainedAlert(
          person.postureState,
          { issue: postureIssue, metrics: { neckAngleDeg: smoothed.neckAngleDeg, torsoAngleDeg: smoothed.torsoAngleDeg ?? 0, shoulderTiltDeg: smoothed.shoulderTiltDeg } },
          now,
          'posture',
          p.postureThresholds.sustainedMs,
          label,
        )
        person.postureState = step.state
        if (step.startedEvent) {
          p.onAlertStart(step.startedEvent)
          if (p.soundEnabled) playAlertBeep()
        }
        if (step.endedEvent) p.onAlertEnd(step.endedEvent)
      }
```
**แทนที่ด้วย:**
```ts
        const metrics = { neckAngleDeg: smoothed.neckAngleDeg, torsoAngleDeg: smoothed.torsoAngleDeg ?? 0, shoulderTiltDeg: smoothed.shoulderTiltDeg }
        // แต่ละปัญหามี state machine ของตัวเอง: ปัญหานั้น "เจอ" หรือ "ไม่เจอ (good)" ในเฟรมนี้
        for (const problem of POSTURE_PROBLEMS) {
          const step = stepSustainedAlert(
            person.postureStates[problem],
            { issue: issues.includes(problem) ? problem : 'good', metrics },
            now,
            'posture',
            p.postureThresholds.sustainedMs,
            label,
          )
          person.postureStates[problem] = step.state
          if (step.startedEvent) {
            p.onAlertStart(step.startedEvent)
            if (p.soundEnabled) playAlertBeep()
          }
          if (step.endedEvent) p.onAlertEnd(step.endedEvent)
        }
      }
```

> 💡 ตรวจหกล้มไม่ต้องแก้ เพราะเป็นระบบแจ้งเตือนแยก (edge-triggered) ไม่ได้ใช้ `classifyPosture`

**(4) อัปเดต test** — ไฟล์ `src/lib/postureAnalysis.test.ts` ผลลัพธ์เป็น array แล้ว:

- `.toBe('good')` → `.toEqual([])` (และเปลี่ยนชื่อ test เป็น `'ท่าดี → ไม่มีปัญหา (array ว่าง)'`)
- `.toBe('leaning')` → `.toEqual(['leaning'])`
- `.toBe('forward_head')` → `.toContain('forward_head')`

แล้ว **เพิ่ม test ใหม่** ท้ายไฟล์:
```ts
describe('classifyPosture หลายปัญหาพร้อมกัน', () => {
  it('ไหล่เอียง + หัวต่ำ → ได้ทั้ง 2 ปัญหา', () => {
    const baseline = computeBaseline(Array.from({ length: 20 }, () => featuresOf(GOOD)), 0)
    const leanAndHeadDown = makePose({ 7: [0.55, 0.36], 8: [0.45, 0.36], 11: [0.62, 0.55], 12: [0.38, 0.45] })
    const issues = classifyPosture(featuresOf(leanAndHeadDown), DEFAULT_THRESHOLDS, baseline)
    expect(issues).toContain('forward_head')
    expect(issues).toContain('leaning')
  })
})
```

> 💡 `toBe` เทียบว่า "เป็นตัวเดียวกัน" ใช้กับค่าธรรมดา (ตัวเลข, string) ส่วน `toEqual` เทียบ "เนื้อหาเหมือนกัน" ใช้กับ array/object (`[] === []` ใน JS ได้ `false`!)

✅ **ตรวจสอบ:**
1. `npx vitest run` → 17 tests ผ่าน
2. `npm run build` ผ่าน
3. `npm run dev` → Calibrate → ก้มหน้า **และ** เอียงตัวพร้อมกัน 8 วิ → banner ต้องแสดง 2 รายการ และตาราง "ประวัติ" มี 2 แถว

💾 **บันทึก:**
```bash
git add -A
git commit -m "รองรับหลายปัญหาท่านั่งพร้อมกัน: state machine แยกต่อปัญหา"
```

---

## ขั้น 6.2 — Dataset Recorder (เก็บข้อมูลไว้ Train AI ในอนาคต)

🎯 **เป้าหมาย:** มีแผงสำหรับนักพัฒนา เลือก label (เช่น "SLOUCH") → กดบันทึก → นั่งท่านั้น → หยุด → Export เป็นไฟล์ JSON

🤔 **ทำไม:** ถ้าอนาคตอยากให้ AI เรียนรู้ท่านั่งเอง (แทน rule แบบ if/else) ต้องมี **ข้อมูลตัวอย่างที่ติด label** จำนวนมาก
- เก็บ **แค่ตัวเลข** (landmarks + features) **ไม่เก็บภาพ** → ปลอดภัยเรื่องความเป็นส่วนตัว ไฟล์เล็ก
- เก็บ `worldLandmarks` (พิกัด 3 มิติหน่วยเมตร) ไว้ด้วย เผื่อใช้ทีหลัง
- แสดงเฉพาะตอน `npm run dev` (`import.meta.env.DEV`) ผู้ใช้จริงไม่เห็น
- เก็บ `cameraId` ไว้ในทุกตัวอย่าง เพราะถ้าต่อ 2 กล้อง ทั้ง 2 กล้องจะบันทึกพร้อมกัน (recorder มีชุดเดียวทั้งแอป) ตอนเอาไป Train จะได้แยกออกว่ามาจากกล้อง/มุมไหน

📚 **ศึกษาก่อน:**
- `Blob` และ `URL.createObjectURL` (สร้างไฟล์ให้ดาวน์โหลดจากเบราว์เซอร์) — https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
- Vite env: `import.meta.env.DEV` — https://vite.dev/guide/env-and-mode
- `as const` และ `(typeof ARR)[number]` (สร้าง union type จาก array)
- `setInterval` + cleanup ใน `useEffect`
- ความต่างระหว่าง `landmarks` กับ `worldLandmarks` — https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker (หัวข้อ "Handle and display results")

🛠 **ลงมือ:**

**(1) สร้างไฟล์ `src/services/datasetRecorder.ts`:**

```ts
// Dataset Recorder: เก็บ "ตัวเลข" ของท่านั่ง (ไม่ใช่ภาพ/วิดีโอ) พร้อม label ที่ผู้ใช้เลือก ไว้ export ไปเทรนโมเดลภายหลัง
// เป็นตัวแปรระดับ module (มีชุดเดียวทั้งแอป) เพื่อให้ CameraStage เขียน และ DatasetRecorderPanel อ่านได้
// โดยไม่ต้องส่ง props ไปมา — ข้อมูลอยู่ใน memory เท่านั้น ปิด/รีเฟรชหน้าเว็บแล้วหาย (ต้องกด Export ก่อน)

import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { PostureFeatures } from '../types/posture'

export const DATASET_LABELS = ['GOOD', 'FORWARD_HEAD', 'SLOUCH', 'LEAN_LEFT', 'LEAN_RIGHT'] as const
export type DatasetLabel = (typeof DATASET_LABELS)[number]

export interface DatasetSample {
  timestamp: number
  /** มาจากกล้องตัวไหน — ต่อหลายกล้องพร้อมกันจะบันทึกจากทุกกล้องที่เห็นคนคนเดียว */
  cameraId: string
  label: DatasetLabel
  landmarks: NormalizedLandmark[]
  worldLandmarks: Landmark[]
  features: PostureFeatures
}

const samples: DatasetSample[] = []
let activeLabel: DatasetLabel | null = null

export const datasetRecorder = {
  start(label: DatasetLabel) {
    activeLabel = label
  },
  stop() {
    activeLabel = null
  },
  isRecording(): boolean {
    return activeLabel !== null
  },
  currentLabel(): DatasetLabel | null {
    return activeLabel
  },
  add(sample: Omit<DatasetSample, 'label'>) {
    if (activeLabel) samples.push({ ...sample, label: activeLabel })
  },
  count(): number {
    return samples.length
  },
  clear() {
    samples.length = 0
  },
  /** ดาวน์โหลดเป็นไฟล์ .json ลงเครื่อง */
  exportJson() {
    const blob = new Blob([JSON.stringify(samples)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `camwell-dataset-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  },
}
```

**(2) สร้างไฟล์ `src/components/DatasetRecorderPanel.tsx`:**

```tsx
import { useEffect, useState } from 'react'
import { DATASET_LABELS, datasetRecorder, type DatasetLabel } from '../services/datasetRecorder'

// แผงควบคุม Dataset Recorder สำหรับนักพัฒนา: เลือก label → กดบันทึก → นั่งท่านั้นค้างไว้ → หยุด → Export
export default function DatasetRecorderPanel() {
  const [label, setLabel] = useState<DatasetLabel>('GOOD')
  const [recording, setRecording] = useState(false)
  const [count, setCount] = useState(0)

  // datasetRecorder ไม่ใช่ React state — ใช้ timer อ่านจำนวนตัวอย่างมาแสดงทุกครึ่งวินาที
  useEffect(() => {
    const id = setInterval(() => setCount(datasetRecorder.count()), 500)
    return () => clearInterval(id)
  }, [])

  const toggleRecording = () => {
    if (recording) {
      datasetRecorder.stop()
      setRecording(false)
    } else {
      datasetRecorder.start(label)
      setRecording(true)
    }
  }

  return (
    <div className="panel">
      <h2>Dataset Recorder (สำหรับนักพัฒนา)</h2>
      <p className="panel-note">บันทึกเฉพาะตัวเลข landmark/feature ไม่บันทึกภาพหรือวิดีโอ · ต้องมีคนเดียวในเฟรม</p>
      <label className="settings-row">
        <span>Label ท่าที่กำลังจะบันทึก</span>
        <select value={label} disabled={recording} onChange={(e) => setLabel(e.target.value as DatasetLabel)}>
          {DATASET_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={toggleRecording}>
        {recording ? `■ หยุดบันทึก (${label})` : '● เริ่มบันทึก'}
      </button>
      <p>จำนวนตัวอย่างที่เก็บแล้ว: {count.toLocaleString()}</p>
      <button type="button" className="secondary-button" onClick={() => datasetRecorder.exportJson()} disabled={count === 0}>
        Export เป็น JSON
      </button>
      <button type="button" className="secondary-button" onClick={() => datasetRecorder.clear()} disabled={recording || count === 0}>
        ล้างข้อมูลทั้งหมด
      </button>
    </div>
  )
}
```

**(3) ไฟล์ `src/components/CameraStage.tsx`** — ให้บันทึกข้อมูลระหว่างอัด

**(3a)** **หา:**
```ts
import type { NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
```
**แทนที่ด้วย:**
```ts
import type { Landmark, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
```

**(3b)** ต่อท้าย import ของ `'../types/posture'` (ที่แก้ในขั้น 6.1) เพิ่มบรรทัด:
```ts
import { datasetRecorder } from '../services/datasetRecorder'
```

**(3c)** **หา:**
```ts
new PositionTracker<{ landmarks: NormalizedLandmark[]; features: PostureFeatures }>
```
**แทนที่ด้วย:**
```ts
new PositionTracker<{ landmarks: NormalizedLandmark[]; worldLandmarks: Landmark[]; features: PostureFeatures }>
```

**(3d)** ให้ `.map` รู้ลำดับ (index) ของแต่ละคน เพื่อดึง worldLandmarks ของคนเดียวกัน — **หา:**
```ts
        .map((landmarks) => {
          const features
```
**แทนที่ด้วย:**
```ts
        .map((landmarks, i) => {
          const features
```

**หา:**
```ts
          return { position: anchorNorm, data: { landmarks, features } }
```
**แทนที่ด้วย:**
```ts
          const worldLandmarks = poseResult?.worldLandmarks?.[i] ?? []
          return { position: anchorNorm, data: { landmarks, worldLandmarks, features } }
```

**(3e)** **หา:** `const { landmarks, features } = match.data`
**แทนที่ด้วย:** `const { landmarks, worldLandmarks, features } = match.data`

**(3f)** ต่อจากบรรทัดที่ตั้ง `person.postureStatusLabel` (แก้ในขั้น 6.1) **หา:**
```ts
        person.postureStatusLabel = issueText + (smoothed.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')
```
**แทนที่ด้วย:**
```ts
        person.postureStatusLabel = issueText + (smoothed.quality === 'upper_body' ? ' (เห็นแค่ช่วงบน)' : '')

        // Dataset Recorder: บันทึกเฉพาะตอนมีคนเดียวในเฟรม (label จะได้ไม่ปนกับคนอื่น)
        if (datasetRecorder.isRecording() && matches.length === 1) {
          datasetRecorder.add({ timestamp: now, cameraId: p.cameraId, landmarks, worldLandmarks, features })
        }
```
> 💡 `p.cameraId` ใช้ได้เพราะเราเพิ่ม `cameraId` เข้า `propsRef` ไว้แล้วในขั้น 4.5

**(4) ไฟล์ `src/App.tsx`**

เพิ่ม import ต่อจาก `import EnrollmentPanel from './components/EnrollmentPanel'`:
```ts
import DatasetRecorderPanel from './components/DatasetRecorderPanel'
```

**หา:**
```tsx
          <EventLog events={events} />
```
**แทนที่ด้วย:**
```tsx
          <EventLog events={events} />
          {import.meta.env.DEV && <DatasetRecorderPanel />}
```

✅ **ตรวจสอบ:**
1. `npm run build` และ `npx vitest run` ผ่าน
2. `npm run dev` → เห็นแผง "Dataset Recorder" ด้านขวาล่าง (ใต้ประวัติการแจ้งเตือน)
3. เลือก `GOOD` → เริ่มบันทึก → นั่งท่าดี 10 วิ → หยุด → จำนวนต้องขึ้นประมาณ 100+ (12 ต่อวินาที)
4. เลือก `SLOUCH` → บันทึกท่าหลังค่อม 10 วิ → หยุด
5. Export → ได้ไฟล์ `.json` ใน Downloads → เปิดด้วย VS Code ดูโครงสร้าง
6. `npm run build && npm run preview` → แผงต้อง **ไม่แสดง** (เพราะเป็น production)

💾 **บันทึก:**
```bash
git add -A
git commit -m "เพิ่ม Dataset Recorder สำหรับเก็บข้อมูล landmark/feature พร้อม label (dev mode เท่านั้น)"
git checkout main
git merge phase-6-issues-dataset
```

🧠 **คำถามทบทวน Phase 6:**
1. ทำไมการมี state machine แยกต่อปัญหาถึงแก้บั๊ก "สลับปัญหาไปมาแล้วไม่เตือน" ได้?
2. ทำไมบันทึก dataset เฉพาะตอนมีคนเดียวในเฟรม?
3. ถ้าจะ Train AI ให้แม่น ควรเก็บข้อมูลจากกี่คน? ทำไมเก็บจากตัวเองคนเดียวไม่พอ?

---

# 7. แผนการเรียนรู้รวม (Study Roadmap)

## ตารางสรุป: ต้องรู้อะไรก่อนแต่ละ Phase

| ก่อน Phase | หัวข้อที่ต้องศึกษา | แหล่งเรียน |
|---|---|---|
| **เริ่มต้น** | Git พื้นฐาน (commit, branch, merge, restore) | https://learngitbranching.js.org/ |
| | JavaScript พื้นฐาน (ตัวแปร, ฟังก์ชัน, object, array) | https://javascript.info/ (Part 1) |
| | TypeScript: types, interface, union, null | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html |
| | VS Code: ค้นหา, แก้หลายไฟล์ | https://code.visualstudio.com/docs/getstarted/getting-started |
| **Phase 1** | React: props, state, conditional rendering | https://react.dev/learn |
| | React: **useRef** ⭐ | https://react.dev/learn/referencing-values-with-refs |
| | requestAnimationFrame | MDN |
| | Immutable update (`{ ...obj }`) | https://react.dev/learn/updating-objects-in-state |
| **Phase 2** | Chrome DevTools Console | https://developer.chrome.com/docs/devtools/console |
| | MediaPipe Pose: 33 จุด, visibility | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker |
| | ตรีโกณมิติ: atan2 | Khan Academy + MDN `Math.atan2` |
| | TS: narrowing, `??` | TS Handbook "Narrowing" |
| **Phase 3** | React: lifting state up, useEffect dependencies | https://react.dev/learn/sharing-state-between-components |
| | Throttle, performance.now() | MDN |
| | Chrome Performance tab | https://developer.chrome.com/docs/devtools/performance |
| **Phase 4** | Aspect ratio, พิกัดภาพ | — |
| | EMA / Exponential smoothing | Wikipedia "Exponential smoothing" |
| | Median vs Mean, outlier | Khan Academy "Statistics" |
| | localStorage, JSON, try/catch | MDN |
| | (เสริม) One Euro Filter, Kalman Filter | https://gery.casiez.net/1euro/ |
| **Phase 5** | Unit testing, Vitest | https://vitest.dev/guide/ |
| | Truthy / Falsy ⭐ | https://developer.mozilla.org/en-US/docs/Glossary/Falsy |
| | (เสริม) Functional core, imperative shell | ค้น YouTube |
| **Phase 6** | TS: Record, `as const`, utility types | TS Handbook "Utility Types" |
| | Blob, download file | MDN `URL.createObjectURL` |
| | Vite env variables | https://vite.dev/guide/env-and-mode |

## หลังจบ Phase 6: ก้าวต่อไป (ไม่ต้องรีบ)

เรียงตามลำดับที่แนะนำ:

1. **ทำขั้น 5.6 ให้เสร็จ** (แยก logic ออกจาก React) จะได้ฝีมือ refactor
2. **Web Worker** — ย้าย AI ไปรันอีก thread ไม่ให้หน้าเว็บกระตุก — https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
3. **แยก face pipeline** — คำนวณ face descriptor (หนัก) เฉพาะตอนต้องระบุตัวตน ไม่ใช่ทุก 400ms (ตอนนี้ทุก 3 วินาทียังส่ง descriptor ไปถาม backend ต่อคนด้วย ถ้าระบุตัวได้แล้วอาจไม่ต้องถามซ้ำจนกว่า track จะเปลี่ยน)
3.5 **แจ้งเตือนหกล้มให้เร็วขึ้น** — ตอนนี้ (หลังขั้น 1.5) การแจ้งเตือน "หายไปจากเฟรม" มาช้า ~4 วินาที เพราะรอ tracker ลบคนก่อน ลองเช็คทุกเฟรมแทน
4. **Machine Learning พื้นฐาน** (ก่อน Train โมเดลเอง):
   - Python พื้นฐาน + pandas
   - คอร์สฟรี: Google Machine Learning Crash Course — https://developers.google.com/machine-learning/crash-course
   - แนวคิด: train/validation/test split, overfitting, confusion matrix
   - เริ่มจากโมเดลง่าย (Logistic Regression, Random Forest ใน scikit-learn) ก่อน Neural Network
5. **นำโมเดลกลับมารันในเบราว์เซอร์**: TensorFlow.js หรือ ONNX Runtime Web
6. **ต่อยอด Backend** (มี backend สำหรับระบุตัวตนแล้ว) — ส่ง log การแจ้งเตือนไป backend / dashboard HR ควรทำหลังจากระบบตรวจในเครื่องเสถียรแล้วเท่านั้น และ⚠️ ออกแบบเรื่อง **ความเป็นส่วนตัวของพนักงาน** ให้ดี (แนะนำส่งแค่สถิติรวมแบบไม่ระบุตัวตนให้ HR ไม่ใช่ข้อมูลรายคน) ปรึกษาฝ่ายกฎหมายเรื่อง PDPA
   - 📚 ถ้าจะเริ่มอ่านโค้ด backend: Express routing — https://expressjs.com/en/guide/routing.html, SQL พื้นฐาน (SELECT/INSERT/JOIN) — https://sqlbolt.com/
7. **ข้อความความเป็นส่วนตัวใต้กล้อง** — ตอนนี้เขียนว่า "ไม่มีการส่งภาพ/วิดีโอออกจากเครื่อง" ซึ่งยังจริงสำหรับภาพ แต่ถ้าเปิดฟีเจอร์ใบหน้า **face descriptor ถูกส่งไป backend** ควรแก้ข้อความให้บอกตามจริง เช่น "ภาพ/วิดีโอประมวลผลในเบราว์เซอร์นี้เท่านั้น — ถ้าเปิดฟีเจอร์ใบหน้า จะส่งเฉพาะตัวเลขลักษณะใบหน้าไปยัง backend ขององค์กร"

## สิ่งที่ **ไม่ควร** รีบทำ

- ❌ เปลี่ยนเป็นโมเดล `pose_landmarker_heavy` (ช้ากว่ามาก ปัญหาไม่ได้อยู่ที่ขนาดโมเดล)
- ❌ Train Neural Network ใหญ่ / LSTM / Transformer ก่อนมี dataset ดีพอ
- ❌ เก็บวิดีโอ/ภาพ (เสี่ยงเรื่องความเป็นส่วนตัว และไม่จำเป็น)
- ❌ เพิ่มฟีเจอร์ใหม่ใน `CameraStage.tsx` ต่อ ก่อนที่ Phase 1–5 จะเสร็จ (ไฟล์โตขึ้นเรื่อย ๆ ยิ่งแก้ทีหลังยิ่งยาก)
- ❌ เพิ่ม `MAX_CAMERA_SLOTS` เกิน 2 ก่อนทำ Phase 3 (แต่ละกล้องโหลดโมเดลแยก เครื่องจะหนักมาก)

---

# 8. เจอปัญหาแล้วทำยังไง (Troubleshooting)

## วิธีคิดเมื่อเจอ error

1. **อ่าน error ให้จบ** — มันบอก **ไฟล์ บรรทัด และสาเหตุ** เสมอ เช่น
   `src/components/CameraStage.tsx(540,13): error TS2322: Type 'X' is not assignable to type 'Y'`
   = ไฟล์ CameraStage.tsx บรรทัด 540 ตัวอักษรที่ 13 ชนิดข้อมูลไม่ตรงกัน
2. **`git diff`** ดูว่าแก้อะไรไปบ้างตั้งแต่ commit ล่าสุด
3. **ย้อนกลับทีละจุด** ถ้าไม่รู้ว่าพังเพราะอะไร
4. **ถาม** — แปะ error **ทั้งหมด** + บอกว่ากำลังทำขั้นไหน

## Error ที่น่าจะเจอบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| `Cannot find name 'xxx'` | ลืม import หรือพิมพ์ชื่อผิด | ตรวจ import ด้านบนไฟล์ |
| `Property 'xxx' is missing in type` | ลืมส่ง prop หรือลืมใส่ field | อ่านว่าขาด field ไหน แล้วเพิ่ม |
| `'xxx' is declared but its value is never read` | import/ประกาศแล้วไม่ใช้ (โปรเจกต์ตั้งให้เป็น error) | ลบทิ้ง หรือใช้มันให้ถูกที่ |
| `Object is possibly 'null'` | ค่าอาจเป็น null แต่ใช้เหมือนมีค่าแน่ ๆ | เช็ค `!== null` ก่อน หรือใช้ `?? ค่าสำรอง` |
| `'X' is a type and must be imported using a type-only import` | โปรเจกต์บังคับ `import type` | เปลี่ยนเป็น `import type { X }` หรือ `import { type X }` |
| หน้าเว็บขาว ไม่มีอะไร | JavaScript error ตอนรัน | F12 → Console ดู error สีแดง |
| กล้องไม่ขึ้น | ไม่ได้อนุญาตกล้อง / โปรแกรมอื่นใช้กล้องอยู่ | ปิด Zoom/Teams แล้วรีเฟรช |
| "โหลดโมเดลไม่สำเร็จ" | ไฟล์โมเดลไม่ได้ดาวน์โหลด | `npm run setup:assets` |
| Calibrate ไม่สำเร็จตลอด | มีหลายคนในเฟรม / เห็นไหล่ไม่ชัด / แสงน้อย | อยู่คนเดียว เปิดไฟ นั่งให้เห็นไหล่ทั้ง 2 ข้าง |
| `npm test` ค้าง ไม่จบ | Vitest อยู่ในโหมด watch (รอดูไฟล์เปลี่ยน) | กด `q` เพื่อออก หรือใช้ `npx vitest run` |
| "เชื่อมต่อ backend (http://localhost:4000) ไม่สำเร็จ" | เปิดฟีเจอร์ใบหน้า แต่ไม่ได้รัน backend | ปิดฟีเจอร์ใบหน้า (ไม่จำเป็นสำหรับแผนนี้) หรือรัน backend ตาม `backend/README.md` |
| กล้อง IP: เห็นภาพ แต่ขึ้น error "CORS" ไม่มี skeleton | กล้องอยู่คนละ origin และไม่ส่ง CORS header เบราว์เซอร์จึงไม่ให้ AI อ่านพิกเซล | ใช้กล้องในเครื่องทดสอบแผนนี้ไปก่อน (แก้ต้องมี backend ช่วยแปลงสตรีม) |
| ข้อความ "หา" ในคู่มือไม่ตรงกับโค้ด | ย่อหน้า (ช่องว่าง) ต่างกัน หรือยังไม่ได้ลบโค้ด DEBUG จากขั้น 2.1 | ค้นหาแค่คำสำคัญบางส่วน เช่น ชื่อตัวแปร |

## ถ้าพังหนักจนแก้ไม่ได้

```bash
git restore .                  # ทิ้งทุกอย่างที่ยังไม่ได้ commit กลับไปจุดล่าสุด
# หรือ
git checkout main              # กลับไป main
git branch -D phase-x-xxx      # ลบ branch ที่พัง แล้วเริ่ม Phase นั้นใหม่
```

---

# 9. Checklist สรุป

พิมพ์ออกมาแล้วติ๊กไปเรื่อย ๆ ✍️

### เตรียมตัว
- [ ] ติดตั้ง Node, Git, VS Code, Chrome
- [ ] เล่น learngitbranching ส่วน Introduction จบ
- [ ] อ่าน javascript.info Part 1 (บทที่ระบุ)
- [ ] อ่าน react.dev เรื่อง State, Refs, Effects
- [ ] อ่าน `postureAnalysis.ts` และ `sustainedAlertMachine.ts` เข้าใจคร่าว ๆ

### Phase 1 — แก้บั๊กเล็ก
- [ ] 1.1 ลบไฟล์ stub
- [ ] 1.2 ปิดใบหน้าเป็นค่าเริ่มต้น + แก้ UI
- [ ] 1.3 แก้ skeleton กระพริบ
- [ ] 1.4 แก้ break timer
- [ ] 1.5 แก้แจ้งเตือน "หกล้มแล้วหายไปจากเฟรม"

### Phase 2 — Quality Gate
- [ ] 2.1 ทดลองวัด + จดตาราง (เจอบั๊กไหล่เอียง ~180°?)
- [ ] 2.2 แก้สูตรไหล่เอียง
- [ ] 2.3 Upper body mode

### Phase 3 — Performance
- [ ] 3.1 Workstation mode
- [ ] 3.2 จำกัด ~12 FPS
- [ ] 3.3 แสดงเวลา inference + เปรียบเทียบ

### Phase 4 — Calibration
- [ ] 4.1 Types ใหม่
- [ ] 4.2 postureAnalysis ใหม่ (pixel + ratio + แยก extract/classify)
- [ ] 4.3 Smoothing
- [ ] 4.4 Calibration + storage
- [ ] 4.5 เชื่อมเข้า CameraStage (baseline แยกต่อกล้อง)
- [ ] 4.6 จูน threshold

### Phase 5 — Tests
- [ ] 5.1 ติดตั้ง Vitest
- [ ] 5.2 Test state machine + แก้บั๊ก falsy-zero
- [ ] 5.3 Test break timer
- [ ] 5.4 Test posture ด้วย synthetic landmarks
- [ ] 5.5 Test fallDetection
- [ ] 5.6 (ท้าทาย) แยก logic ออกจาก React

### Phase 6 — issues[] + Dataset
- [ ] 6.1 หลายปัญหาพร้อมกัน
- [ ] 6.2 Dataset Recorder

---

> 💬 **สุดท้าย:** อย่ากังวลถ้าบางขั้นใช้เวลานาน ทุกคนเคยเป็นมือใหม่ สิ่งที่สำคัญกว่าความเร็วคือ **เข้าใจว่าทำไม** ถ้าตอบคำถามทบทวน 🧠 ได้ด้วยคำพูดของตัวเอง แปลว่าคุณเรียนรู้จริงแล้ว ขอให้สนุกกับการเขียนโค้ดครับ 🚀
