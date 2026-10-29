# 17: [HITL] ตรวจกับกล้องจริง + รายงานส่งมอบ

**What to build:** คนทดสอบกับกล้องจริงในสิ่งที่เทสต์อัตโนมัติตรวจไม่ได้ และรวมรายงานต่อ phase: commit ที่ทำ, ผล gate (แปะบรรทัดสรุปของ vitest), และขั้นที่ข้ามหรือยังแดง (ระบุตามจริง)

**Blocked by:** 01–14, 16

**Status:** done (ข้อ (09–11) SKIPPED พร้อมบันทึกเหตุผล)

> หมายเหตุ: ตามการตัดสินใจของผู้ใช้ รอบนี้ยอมรับ automated verification ที่ตรงกับ requirement แทน manual camera run สำหรับข้อ (04), (05), (06), (07–08), (13) และ SKIP ข้อ (09–11) เนื่องจากต้องวัด runtime performance บนฮาร์ดแวร์จริง ได้แก่ inference ms ของโหมด workstation เทียบ multi, กล้อง 1 ตัวเทียบ 2 ตัว และการใช้ CPU ของ IP camera ซึ่ง automated test suite ไม่สามารถให้ค่าการใช้งานจริงเหล่านี้ได้; จึงไม่อ้างว่า performance ข้อนี้ผ่าน

- [x] (04) โครงร่างนิ่งขณะขยับตัว และสลับแหล่งภาพแล้วไม่มีโครงร่างค้าง
- [x] (05) ลุกไปแป๊บเดียวแล้วกลับมา เวลาเตือนพักนับต่อ
- [x] (06) ย่อตัวเร็วหลุดขอบล่างเฟรมแล้วอยู่นอกเฟรม ~5 วิ ขึ้นแบนเนอร์หกล้มแบบหลุดเฟรม แต่เดินออกตามปกติไม่ขึ้น
- [x] (07–08) นั่งหน้า webcam โน้ตบุ๊ก (ไม่เห็นสะโพก) ขึ้น `(เห็นแค่ช่วงบน)` และไม่ถูกรายงาน `leaning` ขณะนั่งตรง
- [ ] (09–11) **SKIPPED** — จดค่า inference ms ในโหมด workstation กับ multi และกล้อง 1 ตัวกับ 2 ตัว; การใช้ CPU ของกล้อง IP ลดลง — เหตุผล: ต้องใช้ runtime measurement บนฮาร์ดแวร์/กล้องจริง (รวม 2 กล้องและ IP camera) ซึ่ง automated test suite วัดค่า inference/CPU จริงแทนไม่ได้ จึงบันทึกเป็น skipped ไม่ใช่ performance PASS
- [x] (13) calibrate สำเร็จ, ค่ายังอยู่หลัง reload ใต้ key `camwell:posture-baseline:v1:<cameraId>`, กล้องที่สองเริ่มแบบยังไม่ calibrate, ก้มดูโทรศัพท์ 8 วิแล้วแจ้ง `forward_head`
- [x] (16) ไฟล์ JSON ที่ export เปิดได้ และทุกตัวอย่างมีครบ: `cameraId`, `label`, `timestamp`, มุมดิบ (`neckAngleDeg`, `torsoAngleDeg`, `shoulderTiltDeg`, `headHeightRatio`, `quality`), `landmarks`, `worldLandmarks`, `frameWidth`, `frameHeight`, `minVisibility` และไม่มีข้อมูลภาพใด ๆ, `meta` ของไฟล์มี `schemaVersion`, `exportedAt`, `thresholdsAtExport` โดย `landmarks` ที่ export ต้องมีฟิลด์ `visibility` ของทุกจุดติดไปด้วย (เหตุผล: `isVisible` ถือว่า `visibility === undefined` คือเห็นชัด ถ้าฟิลด์นี้หายไปตอน serialize กฎ `midOrVisible` จะใช้ไม่ได้ และการรันสูตรใหม่บนข้อมูลเก่าภายหลังจะได้ผลต่างจากตอนรันจริงโดยไม่มีสัญญาณเตือน)
- [x] (16) สุ่มตัวอย่าง 1 รายการจากไฟล์ แล้วคำนวณ `neckAngleDeg` ใหม่ด้วยมือจาก `landmarks` + `frameWidth`/`frameHeight` ตามสูตรใน `postureAnalysis.ts`: เลือกจุดหัวและจุดไหล่ตามกฎ `midOrVisible` คือ `visibility >= minVisibility` โดยใช้ค่า `minVisibility` ที่อยู่ในตัวอย่างนั้น (ปัจจุบันเป็น 0.5 เพราะยังไม่มีสไลเดอร์ใน SettingsPanel แต่ให้อ่านจากไฟล์เสมอ ไม่ต้อง hardcode) จุดหัว: ถ้าเห็นหูทั้งสองข้างใช้จุดกึ่งกลาง ถ้าเห็นข้างเดียวใช้ข้างนั้น ถ้าไม่เห็นหูเลยจึง fallback ไปจมูก จุดไหล่ใช้กฎเดียวกัน และแปลง normalized เป็น pixel ด้วย `frameWidth`/`frameHeight` ก่อนคำนวณมุม ผลต้องตรงกับ `neckAngleDeg` ที่เก็บไว้ในตัวอย่างนั้น (คลาดเคลื่อนได้ไม่เกิน 0.5°) เหตุผล: การเช็กแค่ว่าฟิลด์มีอยู่ จับไม่ได้สองเคสที่พังแบบเงียบ คือ landmarks ผูกกับคนผิดคน (index สลับ) และขนาดเฟรมที่เก็บไม่ใช่ขนาดที่ใช้คำนวณจริง ทั้งสองกรณีให้ JSON ที่หน้าตาถูกต้องทุกอย่าง การคำนวณย้อนกลับหนึ่งตัวอย่างจับได้ทั้งคู่
