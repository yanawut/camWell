---
version: 1
slug: "frontend-src-dashboard-officedashboard-tsx"
primary_target: "frontend/src/dashboard/OfficeDashboard.tsx"
related_targets: ["frontend/src/dashboard/OfficeRoom.tsx","frontend/src/dashboard/dashboard.css","frontend/src/components/AppNavigation.tsx"]
---

# Dashboard (`/?dashboard`)

Scope: `frontend/src/dashboard/OfficeDashboard.tsx`, `OfficeRoom.tsx`, `dashboard.css`, and the app nav `frontend/src/components/AppNavigation.*`, which every app page shares. Mode: Operate.

Audience and task: HR and team leads check in between other work. Within seconds they should see which rooms have people, who has a problem that lasted (the red ring), and any fall, which is the loudest thing on the page. Employees never see this page.

Cited adaptation: the shared app nav band is 64px tall, not the landing page's 76px, so Operate pages keep vertical room for content. The dashed perforation sits under it on the dashboard sheet.

Decisions (user, 2026-11-21): the envelope world, already established on the landing page and recorded in DESIGN.md, extends to this page. The pixel-art room is redrawn as a single-ink, top-down floor plan. The green envelope header band replaces the old nav on every app page; other page bodies stay on the old system until they are converted.

## Direction contract

THESIS: The dashboard is the same printed label as the landing page, now in Operate mode. Each camera is a printed room plan with a roster table beside it. It refuses the colourful pixel-art cards and the hard-shadow panels.

OWN-WORLD: envelope tokens from `envelope/envelope.css`: one green ink on paper (reverse print in dark), ballpoint-blue handwriting for names and fill-ins, red only for alerts that lasted and falls. Square 2px ink frames, the four-state tick grammar, Anuphan / Sarabun / Sriracha.

STORY: The visitor scans the header tally (people, cameras, date), reads each room's status line (ว่าง / ปกติทุกคน / เตือนอยู่ N คน / ตรวจพบการล้ม), then the roster sorted with alerts first. They open the live view when needed.

FIRST VIEWPORT: the envelope band nav, then an h1 with LIVE (and ตัวอย่างจำลอง in demo) and handwritten tally fields on the right, a ruled divider, then the printed checkboxes (show cameras, multi-person) with a mark legend. Below that is the first room: a frame holding a head row (name, status mark, ดูภาพสด), a 400×250 ink plan, and a "คนในห้องนี้" roster column; under 780px of container width the roster drops below the plan. A fall adds a solid red banner above everything and a 4px red frame on the room.

FORM: an extension of the established envelope world to an Operate surface; no concept roll. seed: none (pinned) — "OK ที่นี้เอาธีมนี้มาปรับกับหน้า http://localhost:5173/?dashboard ด้วย"; answers "วาดใหม่เป็นผังหมึกเขียว (Recommended)" and "ทุกหน้าในแอป (Recommended)".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
