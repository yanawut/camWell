---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/App.css","frontend/src/pages/GaitAssessmentPage.tsx","frontend/src/pages/PeoplePage.tsx","frontend/src/pages/AlertsPage.tsx","frontend/src/pages/ReportsPage.tsx","frontend/src/console/DevConsole.tsx","frontend/src/yoloConsole/YoloConsole.tsx"]
---

# App pages: camera, gait, people, alerts, report, Dev Console, YOLO Console

Scope: the remaining app surfaces `/?camera` (App.tsx + App.css), `/?gait`, `/?people`, `/?alerts`, `/?report`, `/?console` and `/?yolo-console`, together with the shared base in `index.css` and `envelope/envelope.css`. Mode: Operate.

Audience and task: HR and team leads (people, alerts, reports) plus admins and developers (camera setup, gait, both consoles). They complete tasks: configure, filter, read and export. Layouts, flows, copy and controls stay as they are. This pass moves the material, not the information architecture.

Decision (user, 2026-11-21): "ทำให้กับ http://localhost:5173/?camera, http://localhost:5173/?gait, http://localhost:5173/?people, http://localhost:5173/?alerts, http://localhost:5173/?report, http://localhost:5173/?console, http://localhost:5173/?yolo-console ทั้งหมดนี้ด้วย". It extends the envelope world, already on the landing page, dashboard and app nav, to every page.

## Direction contract

THESIS: Every app page is printed on the same label paper as the dashboard. Panels are square ink frames, stats are one ruled ledger row, and controls are printed boxes. It refuses the old blue panel UI (rounded cards, soft shadows, blue accents, coloured side tabs).

OWN-WORLD: the `--rx-*` tokens live at `:root`, and the legacy tokens (`--bg`, `--text`, `--accent`, `--good/warn/danger`, the fonts) now point at them. Rules: one green ink for type, rules and primary fills; ballpoint blue only for good status, ticks and focus; stamp red only for warnings, alerts and falls. Dark theme is a reverse print. Anuphan for headings and labels, Sarabun for body text, monospace kept only for raw metrics and paths.

STORY: The visitor recognises the same printed sheet on every page. The status of anything reads in the same grammar: ink means normal, red outline means moderate or caution, solid red means high or a fall, and a blue tick means confirmed.

FIRST VIEWPORT: unchanged per page, inside the shared 64px envelope band. Page heading has a 2px ink rule beneath it, primary button ink fill, secondary 2px ink outline. Empty video and canvas areas are a 4% ink tint inside a 2px ink frame. The consoles' sidebar is a paper column with a 2px ink right rule and an ink-band brand block.

FORM: an extension of the established envelope world to Operate pages; no concept roll. seed: none (pinned) — the user's request quoted above. Report charts separate categories by print pattern (posture solid ink, fatigue diagonal hatch, distance dot screen, fall solid red), never by hue.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
