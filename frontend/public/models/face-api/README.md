# โฟลเดอร์นี้เก็บไฟล์โมเดลของ @vladmandic/face-api (MIT License)

ใช้สำหรับฟีเจอร์: ตรวจจับความเหนื่อยล้า/หาว/หลับใน, เตือนระยะห่างจากจอ, และ face recognition (ระบุตัวตนพนักงาน)

ไฟล์ในนี้ถูกดาวน์โหลดมาอัตโนมัติตอน `npm install` จาก GitHub repo ของ vladmandic/face-api
(`scripts/setup-assets.mjs`) — มาจาก `raw.githubusercontent.com` ซึ่งปกติเข้าถึงได้ง่ายกว่า
`storage.googleapis.com` (ที่ใช้เก็บโมเดล MediaPipe Pose Landmarker)

โมเดลที่ใช้ 3 ตัว:
- `tiny_face_detector_model*` — หาตำแหน่งใบหน้าในเฟรม
- `face_landmark_68_model*` — จุด landmark ใบหน้า 68 จุด (ใช้คำนวณ EAR ตา/MAR ปาก)
- `face_recognition_model*` — คำนวณ face descriptor 128 มิติ สำหรับจับคู่ว่าเป็นใคร

ถ้าดาวน์โหลดอัตโนมัติไม่สำเร็จ ดาวน์โหลดเองได้จาก:
https://github.com/vladmandic/face-api/tree/master/model
(เอาเฉพาะ 6 ไฟล์ตามชื่อใน `scripts/setup-assets.mjs`)
