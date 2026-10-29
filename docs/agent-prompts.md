# ชุด Prompt สำหรับทำ performance Ticket (camWell)

ใช้กับ tickets ใน [`docs/performance/`](performance/README.md) ให้แทน `<NN>` ด้วยเลข Ticket (เช่น `04`)

ข้อมูลโปรเจกต์ที่ prompt อ้างถึง:

- เป็นเว็บแอป Vite + React + TypeScript (frontend อยู่ที่ root ส่วน `backend/` เป็น Node/Express + SQLite)
- scope ของ performance tickets: `src/` เท่านั้น ห้ามแตะ `backend/`
- Gate ของทุก Ticket: `npm run build` · `npm run lint` (oxlint) · `npx vitest run`
- ต้องทำ Ticket 01 ก่อน เพราะ Ticket 01 เป็นตัวติดตั้ง Vitest
- ตอนนี้ยังไม่มี coverage gate ถ้ายังไม่มีให้รายงานเป็น N/A ห้ามสร้างเพิ่มเอง
- Status flow ของ Ticket: `ready-for-agent` → `verification-needed` → `done`
- Manual smoke test ทำบน Chrome บนคอมพิวเตอร์ + webcam จริง

---

## Prompt 0 — Check tools

```
Notebook MCP เห็น Project camWell ID 0a36acca-b468-41f3-b55f-6694f1b6d7cf และ skills ไหม ห้ามเดา
```

## Prompt 1 — เริ่มทำ Ticket

```
ผมทำโปรเจกต์ camWell อยู่ที่ workspace `camWell`
(เว็บแอป Vite + React + TypeScript, frontend อยู่ที่ root, `backend/` เป็น Node/Express)

ให้ใช้ Notebook MCP กับ workspace นี้โดยตรง ห้ามใช้ WSL

ใช้ skill `/mattpocock-skills:implement` ทำ performance Ticket <NN> ต่อได้เลย
ก่อนแก้โค้ด:
- อ่าน `docs/performance/README.md` (ลำดับ Ticket, Blocked by, Gate)
- อ่าน `docs/performance/camwell-agent-implementation-plan.md` เฉพาะ step ที่ Ticket อ้างถึง
- อ่านไฟล์ Ticket `docs/performance/<NN>-*.md` ให้ครบ
- อ่าน section ใน `docs/performance/camwell-step-by-step-guide.md` ที่ Ticket อ้างถึง
- ตรวจว่า Ticket ที่อยู่ใน "Blocked by" มี Status เป็น `done` แล้ว ถ้ายังไม่ done ให้หยุดและรายงาน
- ตรวจ git status / branch / commit ปัจจุบันก่อนเริ่ม
  (ต้องอยู่บน `improve-app-performance` และ working tree สะอาด ถ้าไม่ตรงให้รายงานก่อน)
- จด HEAD commit ตอนเริ่มไว้ เพราะจะใช้เป็น fixed point ตอน code review
- ใช้ requirement ใน Ticket เป็น source of truth
  ถ้า guide/plan ขัดกับ Ticket ให้ยึด Ticket และรายงานจุดที่ขัด
  ถ้า find-block ใน guide ไม่ตรงกับโค้ดปัจจุบัน ให้ปรับตามโค้ดจริงและรายงาน

วิธีทำ:
- ทำตาม TDD เท่าที่เหมาะสม (Vitest: เขียนเทสต์ให้แดงก่อน แล้วค่อยแก้ให้เขียว)
- logic ที่เทสต์ได้ให้แยกไว้ใน `src/lib/` เป็น pure function แล้วเทสต์ตรงนั้น
  ส่วน React component / rAF loop / กล้อง ที่เทสต์อัตโนมัติไม่ได้ ให้จดไว้สำหรับ manual smoke
- แก้เฉพาะ scope ของ Ticket นี้ใน `src/` เท่านั้น ห้ามแตะ `backend/`
- ห้ามเพิ่ม dependency ใหม่ ยกเว้น Ticket สั่งไว้ (เช่น Ticket 01 ติดตั้ง vitest)
- เพิ่ม automated tests ให้ครอบ requirement และ regression ที่สำคัญ
- ใช้ npm จาก workspace นี้ (`npm install` ถ้ายังไม่มี node_modules)
- รัน targeted tests ระหว่างทำ (`npx vitest run <ไฟล์เทสต์>`)
- หลัง implementation เสร็จ รัน gate ให้ครบ:
  - `npm run build`
  - `npm run lint`
  - `npx vitest run` (ครบทุกไฟล์)
  - coverage gate ถ้าโปรเจกต์มีแล้ว ถ้ายังไม่มีให้รายงาน N/A ห้ามสร้างเพิ่มเอง
  - `git diff --check`
- tick checkbox ใน Ticket เฉพาะข้อที่ทำเสร็จและ verify แล้ว (ยังไม่ต้องเปลี่ยน Status)

ข้อสำคัญ:
**ห้าม commit และห้าม stage จนกว่าผมจะสั่งให้ commit เอง**
ถึง skill จะบอกให้ commit ก็ให้ยึดคำสั่งนี้เป็นหลัก

ถ้า tool/sub-agent บางอย่างใช้ไม่ได้ ให้ทำเองทีละขั้นแทน ห้ามหยุดงานเพราะ gen agent ไม่ได้

เมื่อ implementation + automated verification เสร็จ ให้รายงาน:
- ไฟล์ที่แก้/เพิ่ม
- เทสต์ที่เพิ่ม (ไฟล์ + ชื่อ test) และ requirement ที่แต่ละเทสต์ครอบ
- ผล gate แต่ละตัว
- สิ่งที่ต้องไปพิสูจน์ด้วย manual smoke
แล้วรอคำสั่งต่อไป
```

## Prompt 2 — Code Review

```
ใช้ skill `/mattpocock-skills:code-review` review performance Ticket นี้จริง ๆ
fixed point = commit ที่ HEAD ตอนเริ่ม Ticket นี้ ให้ review working tree ปัจจุบันทั้งหมดของ Ticket นี้ รวมไฟล์ untracked ด้วย

ถ้า gen/sub-agent ใช้ไม่ได้ ให้ทำ fallback เองทีละขั้นตาม skill โดยแยก review อย่างน้อย:
1. Standards review — เทียบกับ:
   - README.md, docs/performance/README.md (scope: แก้เฉพาะ `src/` ห้ามแตะ `backend/`)
   - conventions ใน docs/performance/camwell-agent-implementation-plan.md
   - tsconfig (strict TypeScript), oxlint และ pattern ของโค้ดเดิมใน src/ (โครง lib/ hooks/ components/ services/, การใช้ ref ใน rAF loop, การตั้งชื่อ)
2. Spec review — เทียบ implementation กับ checklist ใน `docs/performance/<NN>-*.md`,
   plan step และ guide section ที่ Ticket อ้างถึง ทีละ requirement
   (ถ้าโค้ดต่างจาก guide ให้ดูว่าต่างแล้วยังได้ผลตาม requirement ไหม)

ถ้าพบ findings:
- รายงานเฉพาะ finding ที่มีผลจริง
- แก้ findings ให้หมด
- เพิ่ม regression test (Vitest) สำหรับ bug/finding ที่เทสต์ได้
- รัน targeted tests ใหม่ (`npx vitest run <file>`)
- รัน `npm run build`
- รัน `npm run lint`
- รัน full `npx vitest run`
- ถ้าโปรเจกต์มี coverage gate แล้ว ให้รันด้วย ถ้ายังไม่มีให้รายงานว่า N/A ห้ามสร้างเพิ่มเอง
- รัน `git diff --check`
- ทำ post-fix code review ซ้ำจน Standards = 0 actionable findings และ Spec = 0 actionable findings

ยัง **ห้าม commit / ห้าม stage**

เมื่อ review และ verification หลังแก้ผ่านหมดแล้ว ให้รายงานผลและรอผมสั่งเรื่อง manual smoke test
```

## Prompt 3 — เขียน Manual Smoke Test

```
ตอนนี้ code review และ automated verification ผ่านหมดแล้ว

ให้เขียน manual smoke test สำหรับ performance Ticket นี้แบบละเอียด
โดยอิง requirement จริงของ Ticket และ regression findings ที่เคยเจอ

ต้องระบุ:
- prerequisites / config: Node/npm, `npm install`, `npm run dev` (URL ที่ใช้),
  Chrome บนคอมพิวเตอร์, webcam กี่ตัว (ถ้า Ticket เกี่ยวกับหลายกล้อง ให้ระบุว่าต้องมี 2 ตัวขึ้นไป),
  ต้องรัน `backend/` ไหม (รันเฉพาะเมื่อ scenario ใช้ฟีเจอร์ใบหน้า/identity),
  setting ที่ต้องตั้งใน SettingsPanel
- วิธีเตรียมก่อนแต่ละ scenario (สิทธิ์กล้อง, ท่านั่ง/ระยะ/แสง, เปิด DevTools Console)
- ขั้นตอนบนเบราว์เซอร์ทีละขั้น (กดอะไร ยืน/นั่งท่าไหน ค้างกี่วินาที)
- expected result ที่ต้องเห็น (overlay, status line, alert, EventLog, Console ต้องไม่มี error)
- เงื่อนไข PASS / FAIL
- regression scenarios ที่ automated test อย่างเดียวไม่พอ (เช่น overlay กระพริบ, สลับกล้อง, fps/ความลื่น)
- scenario ที่ทำด้วยมือไม่ได้หรือไม่ควรบังคับทำ เช่น timing ที่ t=0 หรือ edge case ของ state machine
  ให้บอกว่าเทสต์ Vitest ตัวไหน (ไฟล์ + ชื่อ test) พิสูจน์แทน
- อย่าซ้ำกับ Ticket 17 (HITL) ให้ smoke ครอบเฉพาะ scope ของ Ticket นี้

บันทึกไว้ข้าง Ticket ที่ `docs/performance/<NN>-browser-smoke.md`
ใช้ภาษาเดียวกับ Ticket (ไทย) มีตารางสรุปผลท้ายไฟล์ ช่องวันที่ทดสอบและ browser/OS/กล้องที่ใช้

หลังเขียนแล้ว:
- เปลี่ยน `**Status:**` ใน Ticket เป็น `verification-needed`
- เพิ่ม `- [ ] Manual browser smoke test ผ่าน (ดู <NN>-browser-smoke.md)` ใน checklist ของ Ticket
- ยังห้าม commit / ห้าม stage
```

## Prompt 4 — หลังทดสอบ Smoke ผ่าน

```
manual browser smoke test ของ performance Ticket นี้ผ่านทั้งหมดแล้ว

ให้อัปเดต `docs/performance/<NN>-browser-smoke.md`:
- ทุก scenario ที่ผ่านให้เป็น `[x] PASS`
- tick เกณฑ์ผ่านทั้งหมด `[x]`
- ใส่วันที่ทดสอบเป็นวันนี้
- อัปเดตตารางสรุปผลเป็น PASS
- scenario ที่เป็น automated-only / manual N/A ให้ระบุให้ชัด และอ้างชื่อเทสต์ Vitest ที่พิสูจน์แทน

จากนั้นอัปเดต Ticket `docs/performance/<NN>-*.md`:
- checkbox ที่ทำเสร็จแล้วทั้งหมดและ manual smoke เป็น `[x]`
- `**Status:**` เป็น `done`

ไม่ต้องรันเทสต์ใหม่ถ้าแก้เฉพาะเอกสาร
ยัง **ห้าม commit**
```

## Prompt 5 — Commit ปิด Ticket

```
**commit** ปิด performance Ticket นี้ได้

ก่อน commit:
- ตรวจ `git status` และ branch ปัจจุบัน (ต้องเป็น `improve-app-performance` ไม่ใช่ `main`)
- ตรวจว่า staged/working tree มีเฉพาะไฟล์ของ Ticket นี้:
  โค้ดใน `src/`, เทสต์, เอกสาร Ticket + smoke ใน `docs/performance/`
  และ `package.json` / `package-lock.json` เฉพาะเมื่อ Ticket ต้องแก้ dependency/script
- ต้องไม่มีไฟล์ใน `backend/`, `node_modules/`, `dist/`, coverage output หรือไฟล์ asset ที่ generate ขึ้นมา
- stage เฉพาะไฟล์ของ Ticket นี้ทีละไฟล์ (ห้าม `git add -A` / `git add .`)
- ห้ามเอา unrelated changes เข้า commit ถ้าเจอให้รายงานและปล่อยไว้ใน working tree
- ถ้า Ticket กำหนดเรื่อง commit ไว้ (เช่น Ticket 01: fix ต้องอยู่ commit เดียวกับเทสต์) ให้ทำตาม

จากนั้น commit ด้วย Conventional Commit message ที่เหมาะกับงาน
(เช่น `fix(posture): ...`, `perf(pose): ...`, `test: ...`, `refactor: ...`)
body ให้สรุปสิ่งที่เปลี่ยนสั้น ๆ และอ้าง `docs/performance/<NN>-*.md`

หลัง commit:
- รายงาน commit hash
- commit message
- Ticket status
- ผล manual smoke
- ตรวจ `git status` หลัง commit
- บอกว่า working tree สะอาดหรือมีอะไรเหลืออยู่
- ห้าม push จนกว่าผมจะสั่ง
```
