---
name: Camwell
description: On-premise office wellbeing cameras, presented as a Thai pharmacy medicine envelope (ซองยาประจำออฟฟิศ).
colors:
  pharmacy-green-ink: "#0b6b47"
  envelope-paper: "#f8faf7"
  rule-soft: "color-mix(in srgb, #0b6b47 30%, #f8faf7)"
  ballpoint-blue: "#1f3fbf"
  stamp-red: "#c62b28"
  reverse-ground: "#0a4630"
  ballpoint-blue-reverse: "#b4c3ff"
  stamp-red-reverse: "#ff9d8f"
typography:
  display:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(44px, 7.2vw, 104px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(20px, 2.3vw, 30px)"
    fontWeight: 700
    lineHeight: 1.3
  lead:
    fontFamily: "Sarabun, IBM Plex Sans Thai Looped, system-ui, sans-serif"
    fontSize: "clamp(18px, 1.55vw, 21px)"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "Sarabun, IBM Plex Sans Thai Looped, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  body-operate:
    fontFamily: "Sarabun, IBM Plex Sans Thai Looped, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
  stat-value:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  hand:
    fontFamily: "Sriracha, Sarabun, cursive"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.3
  mono-raw:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
rounded:
  none: "0px"
  stamp-inner: "4px"
  stamp-outer: "8px"
  stamp-small-inner: "3px"
  stamp-small-outer: "6px"
spacing:
  gutter: "clamp(16px, 5vw, 72px)"
  section: "clamp(56px, 7vw, 96px)"
  block: "28px"
  sheet-gap: "24px"
  row: "14px"
  sheet-max: "1440px"
  sheet-max-operate: "1600px"
components:
  header-band:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    height: "76px"
  app-nav-band:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    typography: "{typography.label}"
    height: "64px"
  stamp-button:
    textColor: "{colors.stamp-red}"
    typography: "{typography.label}"
    rounded: "{rounded.stamp-outer}"
    padding: "5px"
  stamp-ack:
    backgroundColor: "{colors.envelope-paper}"
    textColor: "{colors.stamp-red}"
    rounded: "{rounded.stamp-small-outer}"
    padding: "4px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.pharmacy-green-ink}"
    rounded: "{rounded.none}"
    padding: "0 22px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
  button-secondary-small:
    backgroundColor: "transparent"
    textColor: "{colors.pharmacy-green-ink}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "40px"
  nav-outlined:
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "40px"
  nav-outlined-hover:
    backgroundColor: "{colors.envelope-paper}"
    textColor: "{colors.pharmacy-green-ink}"
  panel:
    backgroundColor: "transparent"
    textColor: "{colors.pharmacy-green-ink}"
    rounded: "{rounded.none}"
    padding: "18px 20px"
  input-printed:
    backgroundColor: "{colors.envelope-paper}"
    textColor: "{colors.pharmacy-green-ink}"
    rounded: "{rounded.none}"
  stat-ledger-cell:
    backgroundColor: "transparent"
    textColor: "{colors.pharmacy-green-ink}"
    typography: "{typography.stat-value}"
    padding: "16px 20px"
  risk-high:
    backgroundColor: "{colors.stamp-red}"
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
  risk-moderate:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-red}"
    rounded: "{rounded.none}"
  risk-low:
    backgroundColor: "transparent"
    textColor: "{colors.pharmacy-green-ink}"
    rounded: "{rounded.none}"
  privacy-promise:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
    padding: "18px 20px 20px"
  fall-banner:
    backgroundColor: "{colors.stamp-red}"
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
    padding: "18px 22px"
  tick-box:
    rounded: "{rounded.none}"
    size: "26px"
  tick-box-small:
    rounded: "{rounded.none}"
    size: "20px"
  table-caption:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    padding: "12px 18px"
  console-nav-item-active:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
---

# Design System: Camwell

## Overview

**Creative North Star: "The Office Medicine Envelope" (ซองยาประจำออฟฟิศ)**

Camwell is one printed pharmacy envelope: a single sheet of paper, printed in one pharmacy-green ink, with a handful of marks someone made on it by hand. Every rule, box, band and letter is the same ink. The only other colours on the sheet are a ballpoint-blue pen (handwriting, tick strokes, names written in, "all good") and a red rubber stamp (the primary action, alerts that lasted, falls, high risk). The envelope reads as care you take every day, not surveillance; information is laid out as instructions, a dosage table, a floor plan, a ledger and a log, never as feature cards.

The envelope is the whole app. It ships on every surface: the landing page (`/`, Persuade), the office dashboard (`/?dashboard`), the app nav band, and the camera, gait, people, alerts, reports, Dev Console and YOLO Console pages (Operate). Its tokens are global: `frontend/src/envelope/envelope.css` declares them on `:root` (and again on `.rx-tokens` for any scope that re-declares them), with the reverse print under `:root[data-theme='dark']`. The same file holds the shared pieces (focus, selection, inline glyph, field, blank, secondary button, sample tag, privacy promise, tick box, fatigue mark); `envelope/marks.tsx` holds the drawn marks and glyphs; `envelope/markLabels.ts` holds the four mark states and their Thai labels. `frontend/src/index.css` prints the global controls (inputs, selects, checkboxes, radios, file buttons) in the same ink, and each page stylesheet closes with a "ซองยา" block that maps its components onto the envelope.

The pre-envelope token names survive only as aliases. `index.css` keeps `--bg`, `--panel-bg`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-fill`, `--on-accent`, `--focus-ring`, `--good`, `--warn`, `--danger`, `--font-body` and `--font-heading` on `:root`, each pointing at an envelope token, so existing CSS that reads them prints in the envelope. They carry no values of their own and switch with the reverse print automatically. New CSS uses the `--rx-*` tokens directly.

Every surface shares one theme mechanism: `<html data-theme="light|dark">`, set before first paint by an inline script in `index.html`, following the OS until the user toggles, then persisted in `localStorage` under `camwell:theme` (`useTheme.ts`). Dark is a reverse print: the green ink becomes the ground and paper colour becomes the type.

**Key Characteristics:**
- One ink, one sheet: pharmacy green on near-white paper, with a faint paper-fibre noise texture on every page.
- Hand marks in ballpoint blue: Sriracha handwriting and stroke-drawn SVG marks, never icon-font glyphs.
- One red rubber stamp per screen; red also marks alerts that lasted, falls and high risk. Red never carries good news.
- Square printed rules, boxes and frames; stamps are the only rounded, rotated objects in the UI.
- Categories are told apart by print pattern and rule weight, not by extra hues.
- Thai-first typesetting: phrase-level non-breaking spans so Thai phrases never split mid-word.
- Dark theme is reverse print, not a dimmed palette.

## Colors

A single-ink print palette with two hand-applied accents, used on every page.

### Primary
- **Pharmacy Green Ink** (`pharmacy-green-ink`): every printed element: type (primary and secondary alike), panel frames, page-heading rules, table heads and captions, input boxes, tick-box and checkbox outlines, radio rings and dots, primary-button fill, secondary-button outline, the header, nav band and console brand block (light theme), the privacy promise panel, room frames and floor-plan drawing, chart fills. In dark theme the ground shifts to Reverse Ground and the ink token takes the paper value.

### Secondary
- **Ballpoint Blue** (`ballpoint-blue`; `ballpoint-blue-reverse` in dark): hand marks and "good". Sriracha values in fields, tallies and feedback lines, names written on the floor plan, tick and strike strokes (including the drawn tick inside a checked checkbox), the Zz fatigue mark, the gait page's "no findings" line, the focus ring, and the selection tint (28% mix). The legacy `--good` alias points here.

### Tertiary
- **Stamp Red** (`stamp-red`; `stamp-red-reverse` in dark): the rubber stamp, the ring mark and red name tag for an alert that lasted, the red circle around a daily count over 10, the fall banner (solid red, paper type), error banners, the red frame of an alerting camera or a room with a fall, high and moderate risk, the fall category in charts, the recording chip, and the PDPA caution frame. The legacy `--warn` and `--danger` aliases both point here.

### Neutral
- **Envelope Paper** (`envelope-paper`): the ground of every page, overlaid by a 180px fractal-noise fibre texture (`--rx-fiber`) at about 2.5% opacity (5% in dark). Also the type on ink fills (bands, primary buttons, active nav items) in light theme.
- **Soft Rule** (`rule-soft`): 30% ink into paper. Perforations and dashed dividers, row dividers in tables, logs and rosters, the dividers between ledger cells, the dashed add-camera slot, the floor-plan grid and chairs. Recomputed from the live ink in dark theme. The legacy `--border` alias points here.
- **Reverse Ground** (`reverse-ground`): the dark-theme paper and the dark band's type; a deeper green than the ink so the reverse print still reads as the same envelope.

### Legacy aliases (no values of their own)
Declared on `:root` in `frontend/src/index.css`: `--bg` and `--panel-bg` → paper; `--border` → soft rule; `--text`, `--text-muted`, `--accent` and `--accent-fill` → ink; `--on-accent` → paper; `--focus-ring` and `--good` → pen; `--warn` and `--danger` → stamp; `--font-body` → Sarabun form stack; `--font-heading` → Anuphan display stack. `--text-muted` deliberately resolves to full ink.

### Live-video exception
Skeletons, keypoints and overlays drawn on live-video canvases (the camera stage, the gait canvas, the YOLO console's live drawing) use their own saturated colours, because they must read on arbitrary video. They are not part of the palette and never leave the canvas, with one bridge: the gait page's per-person colour square (a 9px printed square) repeats that person's skeleton colour so the list can be matched to the video.

### Named Rules
**The One Ink Rule.** Everything printed on the envelope is the single ink token. A second printed colour, a tint ramp of the green, or a grey text tone breaks the envelope. Transparent washes of that same ink exist only as state feedback (hover fills of 5–16%), as empty-media grounds (4%) and as the band's soft outlines and dividers; text is always full ink, and secondary text is set apart by size and weight, not by fading.

**The Two Hands Rule.** Blue is what a person wrote or what is fine; red is what was stamped or must be heeded. Neither appears as decoration, and neither is used for printed structure.

**The Reverse Print Rule.** Dark theme swaps paper and ink (band becomes paper, its type becomes ground) and lifts the pen and stamp to their light reverse values. It never introduces new hues.

**The Severity Grammar Rule.** Severity is one grammar on every page: high is solid red with paper type (or a 3px red frame on a card), moderate is a red outline (2px on cards), low or ok is an ink outline, mild or chronic is a dashed ink outline. Severity never gets its own hue.

**The Print Pattern Rule.** Chart categories are told apart by print pattern, like a one-ink press would: posture is solid ink, fatigue is a 135° hatch, distance is a dot screen, falls are solid red. Each segment is outlined in a 1px inner ink rule so the patterns stay separate.

## Typography

**Display Font:** Anuphan 600/700 (with IBM Plex Sans Thai, system-ui)
**Body Font:** Sarabun 400/600 (with IBM Plex Sans Thai Looped, system-ui), the "form text" of the label
**Hand Font:** Sriracha 400 (with Sarabun, cursive), always in Ballpoint Blue, or Stamp Red for an alerted name
**Raw-data Font:** ui-monospace (Consolas), consoles only

**Character:** Anuphan is the printed heading of a pharmacy label, firm and loopless; Sarabun is the looped Thai of official forms; Sriracha is the pharmacist's ballpoint filling in the blanks.

### Hierarchy
- **Display** (700, clamp 44–104px, 1.18, -0.01em; 40px under 400px wide): the one headline on the landing sheet. App pages do not use it.
- **Headline** (700, clamp 28–40px, 1.25): landing section headings and the page heading of every app page, sitting on a 2px ink rule.
- **Title** (700, clamp 20–30px, 1.3): sub-headings within a side of the envelope; room names on the dashboard (20–24px). Panel headings on app pages use its 20px floor; console card headings are 18px.
- **Lead** (400, clamp 18–21px, 1.7, max 34em): the single lead line under the display.
- **Body** (400, 17px/1.65 on the landing; 16px/1.55 as the root of every app page, 1.6 on the dashboard sheet): running form text; page-heading descriptions at 15px; secondary lines in tables at 14–15px/1.45.
- **Label** (Anuphan 600, 13–17px, 1.2–1.35): field labels, nav links (15px), legend (13px), checkbox labels, table heads (13px), stat labels (14px), secondary buttons (14–15px), primary buttons (700 16px). Table row names, captions, banner headings and stamp faces step up to 700 at 17–28px.
- **Stat value** (Anuphan 700, 34px/1.1 on people, alerts and reports ledgers, 28px on phones; 26px in console stat bars; 22px in gait metric boxes; tabular numerals): numbers in a ledger. Tables also set tabular numerals.
- **Hand** (Sriracha 400, 1.5em of the field label, 14–26px): values written into fields and tallies, doses, log results, step blanks, names on the floor plan, counts in the roster, report feedback lines (15px).
- **Raw data** (ui-monospace 500, 10–11px): only raw metrics, file paths and model names in the Dev and YOLO consoles. It never sets stat values, labels or headings.

### Named Rules
**The Phrase Break Rule.** Thai copy breaks only between phrases: each space-separated phrase is wrapped as a non-breaking span (`Phrases`), and headings use `text-wrap: balance`, paragraphs `pretty`.

**The Written-In Rule.** Sriracha is reserved for values a person would fill in on the label: tallies, names, counts, doses, feedback. Printed labels, headings and instructions never use it.

## Layout

One continuous sheet, never a stack of cards. Every surface opens with a full-width band; the side gutter is fluid (16px at phone width up to 72px) on the landing, the dashboard and every app shell.

**Landing (Persuade).** Capped at 1440px. The first viewport is a two-column label: main column (fields, display, lead, actions) and a 340–460px side column (dosage table, fine print, privacy promise), split by a 2px ink rule. A dashed perforation (2px, Soft Rule) follows the band. Sections below are separated by fluid section padding (56–96px) and open on a heading with a 2px ink rule and a 28px gap. The "two sides" section is a two-column grid split by a dashed fold. Lists, logs and steps are single-column rows divided by 1px Soft Rules. The footer closes the sheet with a 6px double ink rule.

**App pages (Operate).** The app shell is capped at 1600px so working pages get width. Each page opens on a page heading (Headline) with an 18px gap and a 2px ink rule beneath it; under 760px the heading and its description stack. Content sits in 2px-framed panels (18px 20px padding). The camera page adds a status strip under the nav band, closed by a 2px dashed Soft Rule. Stats are a single ruled ledger row inside a 2px ink frame, cells divided by 1px Soft Rules; under 760px the ledger becomes two columns divided by top and left rules, and the reports ledger runs seven across from 1100px.

**Dashboard.** A 24px vertical rhythm between blocks. A header row pairs the page heading (with the live marker: a 1.5px ink-outlined tag reading LIVE with an 8px square printed dot that fades to 25% and back over 1.8s) with a handwritten tally, closed by a 2px ink rule; printed checkboxes and the mark legend share one wrapping row. Each camera is a room in a 2px frame: a floor plan (400:250) beside a 300–380px roster, split by a 2px ink rule; a container query stacks the roster under the plan below 780px. Notes (break reminder, privacy promise) close the sheet in an auto-fit grid of 420px minimum columns.

**Consoles.** A two-column frame: a paper sidebar column closed by a 2px ink right rule, with an ink-band brand block at its top, then the main area whose sticky header is closed by a 2px ink rule. Cards are 2px ink frames.

**App nav band.** Sticky, 64px, capped at 1600px: brand, links and tools on one row. Under 1180px the links move to a second row (44px, horizontally scrollable, divided from the first by a 30% band-type rule); under 760px the band stops being sticky. It is hidden in print.

Breakpoints: 1180px (nav wraps), 1100px (reports ledger seven across), 1024px (landing hero and dashboard split stack), 780px container (room roster stacks), 760px (landing band shortens to 64px, nav stops sticking, page heading and ledgers reflow, fall-banner actions take their own row), 520px (dosage table becomes blocks), 400px (display 40px, stamp face 24px).

## Elevation & Depth

Flat. The envelope is printed paper: depth comes from ink weight (1px soft, 1.5px field and small boxes, 2px structural frames and rules, 3px stamp and high-risk card, 4px red frame for an alerting camera or a room with a fall, 6px double at the foot) and the paper-fibre texture, never from resting shadows. Every pre-envelope shadow on app pages is removed in its page's "ซองยา" block; selected filters use a 2px ink outline or a solid ink fill instead of a lift, and on-video tags drop their frosted-glass blur for solid ink or red plates. The single exception is motion: during the landing stamp's entrance it hovers above the paper with a soft ink-tinted drop shadow (`0 14px 22px -10px`, 45% ink) that disappears as it presses down.

### Named Rules
**The Printed Depth Rule.** Hierarchy is carried by rule weight and ink fill, not elevation. No surface on the sheet carries a box-shadow at rest. Urgency is a heavier rule or a solid fill in red, never a lift.

## Shapes

Square, printed geometry for every piece of UI: panels, cards, buttons, inputs, selects, checkboxes, tags, badges, banners, nav links and tools, stat ledgers, tables, room frames, video frames and the theme toggle are all 0 radius. Rubber stamps are the one rounded and rotated UI object: the landing stamp is a double border (3px outer at 8px radius, 1.5px inner at 4px radius) set at -3deg; the dashboard's acknowledge stamp is the compact form (6px outer, 1.5px inner at 3px, -2deg). Radio buttons keep their conventional circle (a 2px ink ring with an ink dot), because a square radio would read as a checkbox. Other circles appear only inside drawn content: a person's head on the floor plan, plants, the door's swing arc, the red circle that marks a count over 10, symptom dots on the report body map, and the record glyph. Hand marks are hand-drawn SVG paths, not geometric glyphs: a slanted tick, a loose ring that overshoots its start, a short strike, a two-stroke Zz.

## Components

### Buttons
- **Stamp (primary on the landing):** red double-bordered rubber stamp, 5% red wash, Anuphan 700 28px face with an arrow. Rotated -3deg; on hover straightens to -1.5deg, sinks 1px and deepens to an 11% wash; on press sinks 2px and scales to 0.98. One per screen.
- **Acknowledge stamp (in the dashboard fall banner):** the compact stamp printed on paper inside the red banner: paper ground, red type, 2px paper outer border at 6px radius, 1.5px red inner at 3px, set at -2deg, 44px tall. Hover straightens to -1deg and sinks 1px; press scales to 0.98. On the dashboard it is the screen's one stamp.
- **Primary (app pages and consoles):** square solid ink with paper type, 2px ink border, 44px tall, 18px side padding, Anuphan 700 16px. Hover lightens the fill to 85% ink. The console's primary run button and the YOLO console's primary button use the same ink fill.
- **Secondary:** square 2px ink outline, transparent ground. The landing size is 52px tall at Anuphan 600 19px; app pages use 40px at 15px (console buttons 36px, report and gait buttons 40px at 14–15px). Hover fills solid ink with paper type (gait tabs take an 8% ink wash instead). Selected tabs and toggles are solid ink. Optional trailing arrow nudges 3px on hover.
- **Band outlined (login on the landing, Console in the app nav):** square 2px band-type outline, 40px tall, Anuphan 700 14–16px. Hover fills band-type with band-coloured type.
- **Inline link / link button:** Anuphan 600–700, underlined at a 4–5px offset, padded to at least a 24px target (40px on the landing).
- **Command glyphs:** play, pause, stop (filled square), record (filled circle) and warn are line glyphs from `marks.tsx`, sized to the text (16–18px) and aligned in the line by `rx-inline-glyph`; they take the surrounding text colour.

### Panels / Containers
- **Corner Style:** square (0).
- **Background:** transparent over the paper; the frame is the container.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 2px ink for panels, camera cells, console cards and stat ledgers; 1.5px ink for smaller boxes (gait metric boxes, report cards, preset cards; a selected preset goes to 3px with a 6% ink wash); 1px Soft Rule for nested regions (report body map, notes).
- **Internal Padding:** 18px 20px.
- **Empty media:** a video or canvas area with no picture yet is a 4% ink tint in a 2px ink frame; the video or canvas covers it once frames arrive.

### Stat Ledger
One ruled row of figures in a 2px ink frame: each cell a Stat value over an Anuphan 600 14px label, 16px 20px padding, divided by 1px Soft Rules. Two columns on phones. On the alerts page the cells are filters: hover takes a 6% ink wash and the selected filter turns solid ink with paper type.

### Tables
Event logs and people tables: Anuphan 600 13px heads in ink, no fill, over a 2px ink rule; rows divided by Soft Rules, hover at 5% ink. Dosage and roster tables (landing, dashboard) add a 2px frame and a solid-ink caption bar with paper type (Anuphan 700 17–20px), a mark column, the name in Anuphan 700 with a Sarabun secondary line, and a handwritten value at the right; fall and alert rows turn their secondary line red, and a fall's value is red "ทันที".

### Inputs / Fields
- **Text inputs, selects, textareas:** a 1.5px ink box on paper, square, ink type (the reports date picker is a 2px box on transparent).
- **Checkbox:** a real native checkbox drawn as a 20px square with a 2px ink border; checked, it carries the hand-drawn ballpoint tick (the reverse-print blue in dark). Disabled at 45%.
- **Radio:** an 18px circle with a 2px ink ring, filled with a solid ink dot when chosen. Range sliders keep the native control in ink (`accent-color`).
- **File input:** the browser's file button becomes a square 2px ink outline (36px, Anuphan 600 14px) that fills with ink on hover.
- **Hit areas:** labels wrapping a checkbox or radio, link buttons and table links get 6px of block padding, enlarging the target without moving the layout.
- **Focus:** a 3px Ballpoint Blue outline at a 2px offset on every control (band-type, inset 3px, inside the nav band).
- **Printed form field (landing, dashboard tally):** printed label + hand-written value on a 1.5px ink baseline ("ถึง: …", "วันที่: …", "พบในห้อง: …"). Fill-in blanks inside running text use a 2px dotted ink underline with the value in Sriracha.

### Tick Box (signature)
A 26px square (20px small variant for tables, legends and dense lists) with a 2px ink border, carrying one of four states, consistent everywhere: **empty** (no alert), **tick** (blue, all good), **ring** (red, alert that lasted), **strike** (blue, resolved). Marks are stroke-drawn SVG; with an order they draw in one by one (0.38s each, 0.14s stagger). Each box has a Thai `aria-label` from `MARK_LABELS`, or is hidden when adjacent text already says it. A printed checkbox is a visually hidden real input followed by a tick box and an Anuphan 600 16px label, 44px minimum target.

### Risk and Severity Marks
Badges, finding items and person cards follow the Severity Grammar: **high** solid red with paper type (badges, symptom dots, on-video warn plates) or a 3px red frame (cards, findings); **moderate** a red outline (1.5px on badges, 2px on cards) with red type; **low / ok** a 1.5px ink outline; **mild / chronic** a dashed 1.5px ink outline. A person card with a fall takes the 3px red frame. No coloured side tabs: every card is fully framed.

### Report Charts
Hourly bars and legend swatches use the Print Pattern Rule: posture solid ink, fatigue a 135° hatch (1.5px ink every 5px), distance a 5px dot screen, falls solid red. Bars stand on a 2px ink baseline; type-share bars are 10px tracks in a 1.5px ink frame filled with solid ink.

### Banners
- **Fall banner:** a solid stamp-red sheet with paper type. On the dashboard it carries a line-drawn warning glyph, an Anuphan 700 22px heading, a 15px detail line, the acknowledge stamp and a square paper-outlined "ดูตำแหน่ง" button; on app pages its buttons are paper plates with red type (40px, Anuphan 700 15px). The loudest thing on any screen, reserved for falls.
- **Error banner:** solid red with paper type, same as the fall sheet but without the stamp.
- **Break banner and info banners:** a 2px (info: 1.5px) ink frame on paper; their buttons are ink outlines that fill on hover.
- **Status banner on the camera frame:** solid ink with paper type.

### Privacy Promise
A square solid-ink panel with paper type (it reverses with the theme), a line-drawn padlock, and Anuphan 700 at 20–24px. It opens with the lead-in "ความเป็นส่วนตัว:" and carries the binding line "ประมวลผลบนเครื่องของคุณ — ไม่ส่งภาพวิดีโอขึ้นคลาวด์". It is never red and never labelled "ข้อควรระวัง": the promise is good news, and red means action or an alert. (The PDPA biometric-data note on the people pages is a real caution, so it is a 2px red frame with red type.)

### Navigation
- **Landing band:** solid ink (paper in dark), 76px, CAMWELL in Anuphan 700 30px with 0.04em tracking and a tagline, text links with a 2px underline that fades in on hover, a 40px square outlined theme toggle with a line-drawn sun/moon, and the outlined login.
- **App nav band:** the same band at 64px, a cited adaptation of the landing's 76px band so app pages keep vertical room. CAMWELL at 26px (24px when wrapped), Anuphan 600 15px links with a 3px bottom border: 45% band-type on hover, full band-type and 700 weight when active (`aria-current="page"`). Tools: the square theme toggle (1.5px outline at 55%, 12% wash on hover) and the outlined Console link.
- **Console sidebar:** a paper column with a 2px ink right rule. Its top is an ink-band brand block (CAMWELL in Anuphan 700 22px, 0.04em, band-type with a 2px band-type outlined mark). Nav items are Anuphan 600 in ink; hover takes a 7% ink wash; the active item is solid ink with paper type. The engine switch (MediaPipe / YOLO) is a 2px ink segmented control whose active half is solid ink. The back link is a 2px ink outline.

### Floor Plan (signature, dashboard)
Each camera's room drawn top-down in ink SVG: a 4px wall, windows and door cut into it, square desks (2px) with a filled screen and keyboard, chairs in Soft Rule, plants, all over a Soft Rule grid. A person is a filled ink shoulders ellipse with a paper head outlined in ink; an alert that lasted adds a red ring drawn in (0.45s). Names sit under or above the chair as handwritten tags on a paper patch (red when alerted, Zz when fatigued) with today's alert count as a printed 20px box, circled red past 10. People fade in (0.5s) and out (0.7s).

### Fatigue Mark
A two-stroke "Zz" drawn in ballpoint blue (26×18, 2.2 stroke; 20×14 beside a name on the plan). It is a hand mark, so it never appears in red or ink.

## Do's and Don'ts

### Do:
- **Do** build every surface on the `--rx-*` tokens from `envelope/envelope.css` and extend its shared pieces there instead of restyling them per page.
- **Do** print every rule, box and letter in the single ink token, and let the reverse print switch it in dark theme rather than adding per-component dark overrides.
- **Do** keep blue for hand marks, "good" and focus, and red for the stamp, alerts that lasted, falls, errors and high or moderate risk. Never use red or a warning label for good news such as the privacy promise.
- **Do** use the four-state tick grammar (empty / tick / ring / strike) with the same meanings wherever status is shown, labelled from `MARK_LABELS`.
- **Do** show severity with the one grammar (solid red, red outline, ink outline, dashed ink) and chart categories with print patterns, never with new hues.
- **Do** set stats as a ruled ledger in Anuphan with tabular numerals; keep monospace for raw metrics, paths and model names in the consoles.
- **Do** wrap Thai phrases in non-breaking spans so lines break between phrases.
- **Do** show real default thresholds from code on the label, and say they are defaults.
- **Do** keep real form controls under printed marks (native checkboxes and radios restyled, or a visually hidden input beside a tick box) and enlarge hit areas with padding.
- **Do** honour `prefers-reduced-motion`: stamp press, tick and ring drawing, people fading, the live dot's pulse and hover transitions are disabled.

### Don't:
- **Don't** add a second printed colour, green tints for text, or grey text to the envelope; `--text-muted` is full ink on purpose.
- **Don't** put a resting box-shadow on anything on the sheet; only the landing stamp's entrance shadow exists, and only in motion.
- **Don't** round or rotate any UI element except a stamp; radios keep their conventional circle, and other circles belong only to drawn content.
- **Don't** reintroduce rounded cards, soft shadows, blue accents, frosted-glass plates or coloured side tabs on any page.
- **Don't** use more than one stamp per screen.
- **Don't** use icon-font or emoji glyphs for status or commands; marks and glyphs are drawn SVG strokes from `marks.tsx`.
- **Don't** pull the live-video skeleton and overlay colours into the page palette; they stay on the canvas (the gait page's per-person square is the one bridge).
- **Don't** write new CSS against the legacy alias names; they exist so old rules keep working, and new rules use `--rx-*`.
