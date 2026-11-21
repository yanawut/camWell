---
version: 1
slug: "frontend-src-pages-systemchooserpage-tsx"
primary_target: "frontend/src/pages/SystemChooserPage.tsx"
related_targets: ["frontend/src/pages/SystemChooserPage.css"]
---

# System chooser page (`/?systems`)

Scope: the page between "เข้าสู่ระบบ" on the landing page and the two dashboards, `frontend/src/pages/SystemChooserPage.tsx` + `SystemChooserPage.css`. Mode: Operate.

Audience: HR / team leads entering the app; developers comparing the two detection systems during the YOLO trial. Job: pick which system's room overview to open. Facts on the page come from code: MediaPipe = `pose_landmarker_lite.task` (33 points) + face-api (TinyFaceDetector, Landmark68, Recognition), runs in the browser, watches only while the tab is open. YOLOv8 = `yolov8m-pose.pt` (17 points) + InsightFace `buffalo_l`, falling back to YuNet + SFace (`face_id.create_engine`) + `yolov8m.pt` (COCO 80 classes) with ByteTrack on yolo-backend, reads go2rtc itself; all six checks live and the staff dashboard at `?yolo-dashboard` is finished (user, 2026-11-22). Constraints: same envelope theme, light and dark; cards show model info (user, 2026-11-21); YOLOv8 is the recommended system (user, 2026-11-22): it comes first, carries a solid "แนะนำ" tag, has its "เลือกฝั่งนี้" box ticked at rest and takes the page's one red stamp; MediaPipe takes the outlined ink button.

## Direction contract

THESIS: The chooser is one envelope label split down a perforation into two formulas, MediaPipe and YOLOv8, read side by side line for line. It refuses the SaaS pair of pricing-style cards and the bare two-button splash.

OWN-WORLD: the incumbent envelope. Fibre paper ground, one pharmacy-green ink for band, rules, tables and type; ballpoint-blue Sriracha for hand-written values and ticks; one red rubber stamp, on the recommended system (YOLOv8). Anuphan display, Sarabun form text, monospace only for model file names. Dark theme is the reverse print.

STORY: A lead who just pressed เข้าสู่ระบบ sees the two systems, which models each runs, where it runs and which checks are ready, then stamps into the recommended YOLOv8 overview or takes the outlined button into MediaPipe.

FIRST VIEWPORT: 76px green band (CAMWELL, tag "เลือกระบบตรวจจับ", หน้าแรก link, theme toggle) and dashed perforation; "ถึง หัวหน้าทีม / HR" and date fields; ~54px h1 "วันนี้จะดูห้องด้วยระบบไหน"; under a 2px ink rule, two equal halves split by a dashed vertical perforation, sharing rows so lines align across it (the parts tables list ท่าทาง, ใบหน้า, ตรวจคน in the same order on both sides), closed by the envelope's 6px double rule. Each half: "เลือกฝั่งนี้" tick box (plus the solid "แนะนำ" tag on YOLOv8), system name at ~82px, one where-line, the "ส่วนประกอบ · โมเดล" table (selectable, above the click area), a six-check tick row, then its action: red stamp on YOLOv8 (left, and first when the halves stack on phones), outlined ink button on MediaPipe. Both actions above the fold at 1440x900 and on 768px-tall laptops. Signature move: the whole half is the target; the recommended half's box is ticked at rest, and pointing at or focusing the other half moves the pen tick there (instant under reduced motion).

FORM: one label split in two by a perforation (ฉลากเดียว แบ่งสองฝั่ง), position 6 of 7 grounded candidates; seed:7472b974e881156a.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
