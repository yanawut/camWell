---
version: 1
slug: "frontend-src-pages-landingpage-tsx"
primary_target: "frontend/src/pages/LandingPage.tsx"
related_targets: ["frontend/src/pages/LandingPage.css"]
---

# Landing page (`/`)

Scope: the pre-login landing page, `frontend/src/pages/LandingPage.tsx` + `LandingPage.css`. Mode: Persuade.

Audience: HR / team leads and the employees on camera, weighted equally (user's answer, 2026-11-21). Job: understand what Camwell watches, believe it is care rather than surveillance and that video stays in the office, then act: press the stamp into the system chooser (`?systems`). Every way into the app from this page goes through `?systems`; no link goes straight to a MediaPipe page (`?camera`, `?people`, `?dashboard`) (user, 2026-11-22). Proof: the real default thresholds from code (posture 8 s, screen distance 5 s, eyes closed 2 s or 3 yawns in 10 min, 45 min sitting → break, 3 min away resets, falls instant). Constraints: both light and dark themes, following the OS until the user toggles; the headline may be rewritten; the pixel-art room may be dropped. No accuracy figures, customers, or PDPA claims. Face features: say "เลือกปิดได้", never "off by default" (code default is on).

## Direction contract

THESIS: Camwell's landing page is a Thai pharmacy medicine envelope/label: one printed sheet of instructions, tick boxes and a rubber stamp. Care you use every day, not surveillance. It refuses the SaaS split hero + feature-card grid + CTA band.

OWN-WORLD: bright white envelope paper, printed in one pharmacy-green ink for every rule, box, band and type. The only other marks are ballpoint blue hand marks (handwriting face, stroke-drawn SVG ticks) and a red rubber stamp. Tick grammar: empty box, blue tick, red ring (alert that lasted), strike-through (resolved). Dark theme = reverse print: ink becomes the ground, paper colour becomes type. Display: Anuphan; form text: Sarabun; hand: Sriracha.

STORY: The visitor sees a label addressed to both of them, reads what the camera watches and after how long, sees the privacy promise that video never leaves the office (a solid-ink panel, never a red warning), then presses the stamp to enter.

FIRST VIEWPORT: a full-width green header band with the CAMWELL shop name and nav. A dashed perforation runs under it. On the left: a handwritten "ถึง:" line, a ~104px headline "กล้องที่ดูแล ไม่ได้จับผิด", one lead line, a red stamp "เข้าสู่ระบบ" with a printed Sarabun line beside it, "แล้วเลือกระบบตรวจจับ MediaPipe หรือ YOLOv8", saying where the stamp leads. On the right: the "วิธีใช้" instruction table with tick rows and real thresholds, and under it the solid-ink privacy promise panel with the cloud promise, led by "ความเป็นส่วนตัว:".

FORM: Thai pharmacy envelope (ซองยา/ฉลากยา), position 3 of 7 grounded candidates; seed:51078578e1a2e54d. Raises: one continuous sheet (orizuru); single-ink discipline (mondo); four-state tick grammar (tensegrity); stroke-drawn hand marks (ebru); one stamp moment (title card).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Decision (user, 2026-11-21): the cloud promise is good news, so it is never labelled "ข้อควรระวัง" or set in red; red stays for the stamp and alerts.

Decision (user, 2026-11-22): the outlined "ตั้งค่ากล้อง" button and the step links to `?camera`, `?people` and `?dashboard` are removed; only the last step of "เริ่มใช้ 4 ขั้น" links, to `?systems` ("เข้าสู่ระบบ").
