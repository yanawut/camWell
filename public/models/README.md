# โฟลเดอร์นี้เก็บไฟล์โมเดล Pose Landmarker

ไฟล์ `pose_landmarker_lite.task`, `pose_landmarker_full.task`, `pose_landmarker_heavy.task` จะถูกดาวน์โหลดมาไว้ที่นี่อัตโนมัติตอนรัน `npm install`
(ผ่านสคริปต์ `scripts/setup-assets.mjs`) — หน้าหลักใช้ `lite` ส่วน Dev Console (`/?console`) เลือกรุ่นได้

ถ้าดาวน์โหลดอัตโนมัติไม่สำเร็จ (เช่น เครือข่ายบริษัทบล็อก storage.googleapis.com) ให้ดาวน์โหลดเองจาก (เปลี่ยน `lite` เป็น `full`/`heavy` ตามรุ่น):

https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task

แล้ววางไฟล์ไว้ที่ `public/models/pose_landmarker_<รุ่น>.task`
