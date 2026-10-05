# 16: เครื่องมือบันทึก dataset (เฉพาะโหมด dev)

**What to build:** นักพัฒนาเลือก label (`GOOD FORWARD_HEAD SLOUCH LEAN_LEFT LEAN_RIGHT`) กดเริ่มบันทึก นั่งท่านั้น แล้ว export เป็น JSON ไว้ train โมเดลในอนาคตได้ บันทึกเฉพาะตัวเลขไม่มีภาพ ทุกกล้องบันทึกเข้าที่เดียวกันโดยแต่ละตัวอย่างระบุ `cameraId` และ panel นี้ไม่มีใน production build

**Blocked by:** 13

> หมายเหตุ find-block: guide ขั้น 6.2 เขียนบนโครงโค้ดก่อน ticket 14 (ตอนที่ tracker และ posture logic ยังอยู่ใน `CameraStage`) จึงใช้ find-block ของการแก้ `CameraStage` ไม่ได้ทั้งขั้น ให้ใช้ guide เป็นข้อมูลอ้างอิงว่าต้องเก็บอะไรบ้างเท่านั้น แล้ว implement ใหม่ตามโครง `PostureEngine` ปัจจุบัน และรายงานส่วนที่ต่างจาก guide

**Status:** done

อ้างอิง: guide ขั้น 6.2 · plan Step 6.2

- [x] service `datasetRecorder` เป็น module singleton: start/stop/isRecording/add/count/clear/exportJson และแต่ละตัวอย่างมี `cameraId`
- [x] คอมโพเนนต์ `DatasetRecorderPanel` แสดงใน `App` เฉพาะเมื่อ `import.meta.env.DEV`
- [x] `worldLandmarks` วิ่งผ่าน `PostureEngine` ไม่ใช่ผ่าน tracker ใน `CameraStage`: แก้ signature ของ `processPoseFrame` ให้รับ worldLandmarks, เพิ่มฟิลด์ใน generic ของ tracker ภายใน engine (`TrackedPoseData`) และเพิ่มฟิลด์ `worldLandmarks` ใน `EnginePersonFrame`
- [x] `EnginePersonFrame` ส่งออก normalized `landmarks` เพิ่มจาก `worldLandmarks` ด้วยกลไกเดียวกัน (ผ่าน `TrackedPoseData` ผูกกับคนถูกคน index ตรงกัน) เหตุผล: `worldLandmarks` เป็นพิกัด 3D ไม่ขึ้นกับกล้อง ใช้เทรนโมเดลได้ดี แต่มุมที่ระบบใช้จริงคำนวณจาก normalized landmarks คูณขนาดเฟรม ถ้าเก็บแค่ `worldLandmarks` จะรันสูตรคำนวณมุมเวอร์ชันใหม่บนข้อมูลเก่าไม่ได้ เก็บ `landmarks` และ `worldLandmarks` ทั้งอ็อบเจกต์ตามที่ MediaPipe คืนมา ห้าม map เหลือเฉพาะ `{x, y, z}` ต้องมี `visibility` ของทุกจุดติดไปด้วย (เหตุผล: `isVisible` ใน `postureAnalysis.ts` ถือว่า `visibility === undefined` คือเห็นชัด ถ้าฟิลด์นี้หายไปตอน serialize กฎ `midOrVisible` จะใช้ไม่ได้ และการรันสูตรใหม่บนข้อมูลเก่าจะได้ผลต่างจากตอนรันจริงโดยไม่มีสัญญาณเตือน) และให้มีเทสต์ที่ยืนยันว่าผลของ `buildDatasetJson` (ดูข้อถัดไป) มี `visibility` ครบทุกจุด
- [x] แต่ละ `DatasetSample` เก็บขนาดเฟรมที่ใช้คำนวณ (`frameWidth`, `frameHeight`) เพื่อแปลง normalized landmarks กลับเป็น pixel space ได้
- [x] เทสต์ใน `postureEngine.test.ts` ยืนยันว่าทั้ง `landmarks` และ `worldLandmarks` ที่ส่งออกผูกกับคนถูกคน: index ตรงกับ landmarks ขาเข้าของคนเดียวกัน และไม่สลับกันเมื่อมีหลายคนในเฟรม
- [x] เรียก `datasetRecorder.add` ใน `CameraStage` โดยวนบน `engineResult.people`; `PostureEngine` ต้องไม่ import หรือรู้จัก `datasetRecorder` (กันไม่ให้ engine ผูกกับ service ของ UI)
- [x] บันทึก 1 ตัวอย่างต่อเฟรมขณะกำลังบันทึกและตรวจพบคนเดียวพอดี โดยใช้เงื่อนไข `engineResult.people.length === 1` แบบเดียวกับโค้ด calibration ของ ticket 13
- [x] แต่ละตัวอย่างเก็บมุมดิบ (ก่อน smoothing) โดยอ่านจาก `enginePerson.rawFeatures` (มีครบทุกฟิลด์อยู่แล้ว) ห้ามคำนวณมุมใหม่ และห้ามใช้ `smoothedFeatures`: คือ `neckAngleDeg`, `torsoAngleDeg`, `shoulderTiltDeg`, `headHeightRatio`, `quality` ควบคู่กับ `worldLandmarks` และ label (เหตุผล: ไฟล์ JSON นี้จะใช้เป็นชุดข้อมูล validate คะแนน RULA โดยให้ผู้เชี่ยวชาญด้านการยศาสตร์ให้คะแนนด้วยมือแล้วเทียบกับคะแนนที่ระบบคำนวณ ถ้าเก็บแต่ landmark จะต้องย้อนมาเก็บข้อมูลใหม่)
- [x] ตัวอย่างมีแต่ตัวเลข ไม่มีภาพ
- [x] แยกการสร้าง JSON ออกจากการดาวน์โหลด: `buildDatasetJson(opts: { thresholdsAtExport: PostureThresholds; exportedAt: number }): string` เป็น pure function คืนโครง `{ meta, samples }` ไม่แตะ DOM และไม่เรียก `Date.now()` เอง; `schemaVersion` เป็นค่าคงที่ในโมดูล ไม่ต้องรับเข้ามา; `exportJson(thresholds)` เรียก `buildDatasetJson({ thresholdsAtExport: thresholds, exportedAt: Date.now() })` แล้วค่อยสร้าง Blob + คลิก `<a>`; `DatasetRecorderPanel` รับ `postureThresholds` เป็น prop จาก `App` แล้วส่งต่อให้ `exportJson` เทสต์ยิงที่ `buildDatasetJson` เท่านั้น โดยส่งค่า `exportedAt` คงที่เข้าไปเพื่อให้ผลตรวจได้แน่นอน ห้าม mock `document.createElement` หรือ `URL.createObjectURL` เทสต์ต้องครอบ: มี `visibility` ครบทุกจุดทั้ง `landmarks` และ `worldLandmarks`, มีฟิลด์ครบตามรายการ (`cameraId`, `label`, `timestamp`, มุมดิบ, `landmarks`, `worldLandmarks`, `frameWidth`, `frameHeight`, `minVisibility`) และ `meta` มี `schemaVersion`, `exportedAt`, `thresholdsAtExport`
- [x] แต่ละตัวอย่างเก็บ `minVisibility` ที่ใช้ขณะบันทึกตัวอย่างนั้น (เป็น threshold ตัวเดียวที่มีผลต่อตัวเลขในตัวอย่าง คือการเลือกจุดหัว/ไหล่ตามกฎ `midOrVisible` และการตัดสิน `quality`) ค่านี้มาจาก `p.postureThresholds` ใน `CameraStage` ตอนเรียก `add()` จึงถูกต้องเสมอแม้ผู้ใช้ปรับค่าระหว่างบันทึก
- [x] `meta` ระดับไฟล์เก็บ `schemaVersion`, `exportedAt` และ `thresholdsAtExport` (`PostureThresholds` ทั้งชุด ณ เวลา export) โดยคอมเมนต์กำกับในโค้ดว่า `thresholdsAtExport` เป็นข้อมูลประกอบเท่านั้น ไม่ใช่ค่าที่ใช้คำนวณตัวเลขในแต่ละตัวอย่าง ค่าที่ใช้จริงอยู่ใน `sample.minVisibility`
- [x] ห้ามทำ `meta` เป็น array ตามช่วงเวลา
- [x] production build (`vite build`) ไม่มี recorder panel อยู่ใน bundle
- [x] Gate เขียว
- [ ] Manual browser smoke test ผ่าน (ดู 16-browser-smoke.md) — ผู้ใช้เลือก skip และปิด Ticket นี้โดยอิง code review + automated verification ที่ผ่านแล้ว
