# 16: เครื่องมือบันทึก dataset (เฉพาะโหมด dev)

**What to build:** นักพัฒนาเลือก label (`GOOD FORWARD_HEAD SLOUCH LEAN_LEFT LEAN_RIGHT`) กดเริ่มบันทึก นั่งท่านั้น แล้ว export เป็น JSON ไว้ train โมเดลในอนาคตได้ บันทึกเฉพาะตัวเลขไม่มีภาพ ทุกกล้องบันทึกเข้าที่เดียวกันโดยแต่ละตัวอย่างระบุ `cameraId` และ panel นี้ไม่มีใน production build

**Blocked by:** 13

> หมายเหตุ find-block: guide ขั้น 6.2 อ้างโค้ดหลังขั้น 6.1 ซึ่งถูกข้ามไป (ticket 15 skipped) ให้ agent ปรับ find-block ตามโค้ดจริงใน `CameraStage` และรายงานจุดที่ปรับ

**Status:** ready-for-agent

อ้างอิง: guide ขั้น 6.2 · plan Step 6.2

- [ ] service `datasetRecorder` เป็น module singleton: start/stop/isRecording/add/count/clear/exportJson และแต่ละตัวอย่างมี `cameraId`
- [ ] คอมโพเนนต์ `DatasetRecorderPanel` แสดงใน `App` เฉพาะเมื่อ `import.meta.env.DEV`
- [ ] ส่ง `worldLandmarks[i]` ผ่านข้อมูลของ tracker; บันทึก 1 ตัวอย่างต่อเฟรมขณะกำลังบันทึกและตรวจพบคนเดียวพอดี
- [ ] แต่ละตัวอย่างเก็บมุมดิบ (ก่อน smoothing) คือ `neckAngleDeg`, `torsoAngleDeg`, `shoulderTiltDeg`, `headHeightRatio`, `quality` ควบคู่กับ `worldLandmarks` และ label (เหตุผล: ไฟล์ JSON นี้จะใช้เป็นชุดข้อมูล validate คะแนน RULA โดยให้ผู้เชี่ยวชาญด้านการยศาสตร์ให้คะแนนด้วยมือแล้วเทียบกับคะแนนที่ระบบคำนวณ ถ้าเก็บแต่ landmark จะต้องย้อนมาเก็บข้อมูลใหม่)
- [ ] ตัวอย่างมีแต่ตัวเลข ไม่มีภาพ
- [ ] production build (`vite build`) ไม่มี recorder panel อยู่ใน bundle
- [ ] Gate เขียว
