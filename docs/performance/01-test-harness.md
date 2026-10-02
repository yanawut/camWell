# 01: ติดตั้ง Vitest + แก้ state machine ให้ถือว่าเวลา 0 เป็นค่าที่มีอยู่จริง

**What to build:** โปรเจกต์มีชุดเทสต์อัตโนมัติ (`npx vitest run`) ที่ทุก ticket ถัดไปใช้เป็น gate ได้ และแก้บั๊กจริงที่เทสต์แรกเจอ: `stepSustainedAlert` เช็ค `candidateSince`, `goodSince`, `lastSignalAt` ด้วย truthiness ทำให้เวลา `t=0` (ซึ่งเกิดได้จริงจาก `performance.now()`) ถูกมองว่า "ไม่มีค่า" แล้วการแจ้งเตือนเริ่ม/จบผิดเวลา พร้อมเพิ่มเทสต์ของ fall detection ไว้กันพังระหว่าง refactor ในภายหลัง

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

อ้างอิงโค้ดที่ตรวจแล้ว: guide §5.1, §5.2, §5.5 · plan "Step 0"

- [ ] ติดตั้ง `vitest` เป็น devDependency ที่ root repo (ไม่ใช่ `backend/`) และเพิ่ม script `"test": "vitest"`
- [ ] เทสต์ของ sustained alert state machine (3 ข้อ): 2 ข้อแดงบนโค้ดเดิม และเขียวหลังเปลี่ยนเป็นเช็ค `!== null` ทั้ง 3 จุด
- [ ] เทสต์ของ fall detection (guide §5.5) เขียวบนโค้ดปัจจุบันโดยไม่ต้องแก้โค้ด
- [ ] เทสต์ผ่านทั้งหมด 7 ข้อ
- [ ] การแก้ null-check อยู่ใน commit เดียวกับเทสต์ของมัน
- [ ] Gate เขียว: `npm run build`, `npm run lint`, `npx vitest run`
