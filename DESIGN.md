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
  app-accent: "#397cf6"
  app-accent-fill: "#2466e0"
  app-on-accent: "#ffffff"
  app-bg: "#f6f8fb"
  app-panel: "#ffffff"
  app-border: "#e1e6ee"
  app-text: "#151d32"
  app-text-muted: "#5f6e88"
  app-good: "#16a34a"
  app-warn: "#f97316"
  app-danger: "#dc2626"
typography:
  display:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(44px, 7.2vw, 104px)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.2vw, 40px)"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "clamp(24px, 2.3vw, 30px)"
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
  label:
    fontFamily: "Anuphan, IBM Plex Sans Thai, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
  hand:
    fontFamily: "Sriracha, Sarabun, cursive"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.3
  app-body:
    fontFamily: "IBM Plex Sans Thai Looped, system-ui, Segoe UI, sans-serif"
    fontSize: "15px"
    lineHeight: 1.5
  app-heading:
    fontFamily: "IBM Plex Sans Thai, system-ui, Segoe UI, sans-serif"
rounded:
  none: "0px"
  stamp-inner: "4px"
  stamp-outer: "8px"
  app-control: "9px"
  app-panel: "14px"
spacing:
  gutter: "clamp(16px, 5vw, 72px)"
  section: "clamp(56px, 7vw, 96px)"
  block: "28px"
  row: "14px"
  sheet-max: "1440px"
components:
  header-band:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    height: "76px"
  stamp-button:
    textColor: "{colors.stamp-red}"
    typography: "{typography.label}"
    rounded: "{rounded.stamp-outer}"
    padding: "5px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.pharmacy-green-ink}"
    rounded: "{rounded.none}"
    padding: "0 22px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
  nav-login:
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
    padding: "0 18px"
    height: "40px"
  nav-login-hover:
    backgroundColor: "{colors.envelope-paper}"
    textColor: "{colors.pharmacy-green-ink}"
  privacy-promise:
    backgroundColor: "{colors.pharmacy-green-ink}"
    textColor: "{colors.envelope-paper}"
    rounded: "{rounded.none}"
    padding: "18px 20px 20px"
  tick-box:
    rounded: "{rounded.none}"
    size: "26px"
  app-button-primary:
    backgroundColor: "{colors.app-accent}"
    textColor: "{colors.app-on-accent}"
    rounded: "{rounded.app-control}"
    padding: "0 16px"
    height: "42px"
  app-button-primary-hover:
    backgroundColor: "{colors.app-accent-fill}"
  app-panel:
    backgroundColor: "{colors.app-panel}"
    rounded: "{rounded.app-panel}"
---

# Design System: Camwell

## Overview

**Creative North Star: "The Office Medicine Envelope" (ซองยาประจำออฟฟิศ)**

Camwell's brand surface is one printed pharmacy envelope: a single sheet of paper, printed in one pharmacy-green ink, with a handful of marks someone made on it by hand. Every rule, box, band and letter is the same ink. The only other colours on the sheet are a ballpoint-blue pen (handwriting, tick strokes) and a red rubber stamp (the primary action, alerts that lasted). The envelope reads as care you take every day, not surveillance; information is laid out as instructions, a dosage table and a log, never as feature cards.

The system has two layers today, and they are not unified in code. The **Persuade layer** is the envelope world, shipped on the landing page (`/`) only; its tokens are the `--rx-*` custom properties scoped to `.rx`. The **Operate layer** is the incumbent app system in `frontend/src/index.css` (dashboard, camera, people, alerts, reports, gait, Dev Console, YOLO Console): a calm blue-accent panel UI on IBM Plex Sans Thai, with its own light and dark tokens on `:root`. New Persuade/brand surfaces take the envelope; new app screens keep the Operate tokens until a deliberate migration says otherwise.

Both layers share one theme mechanism: `<html data-theme="light|dark">`, set before first paint by an inline script in `index.html`, following the OS until the user toggles, then persisted in `localStorage` under `camwell:theme` (`useTheme.ts`). In the envelope, dark is a reverse print: the green ink becomes the ground and paper colour becomes the type.

**Key Characteristics:**
- One ink, one sheet: pharmacy green on near-white paper, with a faint paper-fibre noise texture.
- Hand marks in ballpoint blue: Sriracha handwriting and stroke-drawn SVG ticks, never icon-font glyphs.
- One red rubber stamp per screen as the primary action; red also marks alerts that lasted. Red never carries good news.
- Square printed rules and boxes; the stamp is the only rounded, rotated object.
- Thai-first typesetting: phrase-level non-breaking spans so Thai phrases never split mid-word.
- Dark theme is reverse print, not a dimmed palette.

## Colors

A single-ink print palette with two hand-applied accents; the Operate layer keeps a separate blue-accent panel palette.

### Primary
- **Pharmacy Green Ink** (`pharmacy-green-ink`): every printed element on the envelope: type, table borders, field rules, tick-box outlines, the header band (light theme), the dosage-table caption bar, the privacy promise panel, the secondary button. In dark theme it becomes the type colour's opposite: the ground shifts to Reverse Ground and the ink token takes the paper value.

### Secondary
- **Ballpoint Blue** (`ballpoint-blue`; `ballpoint-blue-reverse` in dark): hand marks only. Sriracha handwriting in filled-in fields, tick and strike strokes, the focus ring (3px outline, 3px offset), and the selection tint (28% mix).

### Tertiary
- **Stamp Red** (`stamp-red`; `stamp-red-reverse` in dark): the rubber stamp (primary action), the ring mark for an alert that lasted, and the last dosage row (falls, "ทันที").

### Neutral
- **Envelope Paper** (`envelope-paper`): the sheet's ground in light theme, overlaid by a 180px fractal-noise fibre texture at about 2.5% opacity (5% in dark). Also the header band's type in light theme and the band itself in dark.
- **Soft Rule** (`rule-soft`): 30% ink into paper. Perforations, the fold between the envelope's two sides, and row dividers inside checklists, logs and step lists. Recomputed from the live ink in dark theme.
- **Reverse Ground** (`reverse-ground`): the dark-theme paper; a deeper green than the ink so the reverse print still reads as the same envelope.

### Operate layer (incumbent app tokens)
- **App Accent** (`app-accent`) and **App Accent Fill** (`app-accent-fill`). The token file intends Accent Fill as the background under white text (4.5:1); the shipped primary button still fills with App Accent at rest and reaches the fill only on hover. Dark theme: both `#72a7ff`, on-accent `#0b1730`, focus ring `#a8c8ff`.
- **App neutrals**: `app-bg`, `app-panel`, `app-border`, `app-text`, `app-text-muted`. Dark: `#0f172a`, `#182235`, `#334155`, `#e5edf8`, `#9aa9bd`.
- **App status**: `app-good`, `app-warn`, `app-danger`. Dark: `#4ade80`, `#fb923c`, `#f87171`.

### Named Rules
**The One Ink Rule.** Everything printed on the envelope is the single ink token. A second printed colour, a tint ramp of the green, or a grey text tone breaks the envelope.

**The Two Hands Rule.** Blue is what a person wrote; red is what was stamped or must be heeded. Neither appears as decoration, and neither is used for printed structure.

**The Reverse Print Rule.** Dark theme swaps paper and ink (band becomes paper, its type becomes ground) and lifts the pen and stamp to their light reverse values. It never introduces new hues.

## Typography

**Display Font:** Anuphan 600/700 (with IBM Plex Sans Thai, system-ui)
**Body Font:** Sarabun 400/600 (with IBM Plex Sans Thai Looped, system-ui), the "form text" of the label
**Hand Font:** Sriracha 400 (with Sarabun, cursive), always in Ballpoint Blue
**Operate layer:** IBM Plex Sans Thai (headings) and IBM Plex Sans Thai Looped (body, 15px/1.5)

**Character:** Anuphan is the printed heading of a pharmacy label, firm and loopless; Sarabun is the looped Thai of official forms; Sriracha is the pharmacist's ballpoint filling in the blanks.

### Hierarchy
- **Display** (700, clamp 44–104px, 1.18, -0.01em; 40px under 400px wide): the one headline on the sheet.
- **Headline** (700, clamp 28–40px, 1.3): section headings, each sitting on a 2px ink rule.
- **Title** (700, clamp 24–30px, 1.3): sub-headings within a side of the envelope.
- **Lead** (400, clamp 18–21px, 1.7, max 34em): the single lead line under the display.
- **Body** (400, 17px, 1.65): running form text; secondary lines in tables at 15px/1.45.
- **Label** (Anuphan 600, 15–17px, 1.2): field labels ("ถึง", "วันที่"), nav, legend, table heads. Stamp face and dosage names step up to 700 at 20–28px.
- **Hand** (Sriracha 400, 20–26px): values written into fields, dosage doses, log results, step blanks.

### Named Rules
**The Phrase Break Rule.** Thai copy breaks only between phrases: each space-separated phrase is wrapped as a non-breaking span, and headings use `text-wrap: balance`, paragraphs `pretty`.

**The Written-In Rule.** Sriracha is reserved for values a person would fill in on the label. Printed labels, headings and instructions never use it.

## Layout

One continuous sheet, never a stack of cards. The envelope is a full-width column capped at 1440px with a fluid side gutter (16px at phone width up to 72px). A full-width header band carries the shop name and nav, followed by a dashed perforation (2px, Soft Rule) and then the sheet.

The first viewport is a two-column label: main column (fields, display, lead, actions) and a 340–460px side column (dosage table, fine print, privacy promise panel), split by a 2px ink rule. Sections below are separated by fluid section padding (56–96px) and open on a heading with a 2px ink rule and a 28px gap. The "two sides" section is a two-column grid split by a dashed fold. Lists, logs and steps are single-column rows divided by 1px Soft Rules with 14–20px vertical padding. The footer closes the sheet with a 6px double ink rule.

Breakpoints: at 1024px the hero stacks and the ink divider turns horizontal; at 760px the band shortens to 64px, tagline and text nav links hide, the sides stack with a horizontal dashed fold, and the log table becomes per-row grids; at 520px the dosage table becomes blocks; at 400px the display drops to 40px and the stamp face to 24px.

## Elevation & Depth

Flat. The envelope is printed paper: depth comes from ink weight (1px soft, 1.5px field, 2px structural, 3px stamp, 6px double at the foot) and the paper-fibre texture, never from resting shadows. The single exception is motion: during the stamp's entrance it hovers above the paper with a soft ink-tinted drop shadow (`0 14px 22px -10px`, 45% ink) that disappears as it presses down.

The Operate layer is different: its panels sit on a faint ambient shadow (`0 2px 4px rgba(22, 34, 57, 0.045)`) at a 14px radius.

### Named Rules
**The Printed Depth Rule.** Hierarchy is carried by rule weight and ink fill, not elevation. No surface on the sheet carries a box-shadow at rest.

## Shapes

Square, printed geometry: tick boxes, buttons, the privacy promise panel, tables and the theme toggle are all 0 radius. The rubber stamp is the one rounded and rotated object: a double border (3px outer at 8px radius, 1.5px inner at 4px radius), set at -3deg. Hand marks are hand-drawn SVG paths, not geometric glyphs: a slanted tick, a loose ring that overshoots its start, a short strike.

## Components

### Buttons
- **Stamp (primary):** red double-bordered rubber stamp, 5% red wash, Anuphan 700 28px face with an arrow. Rotated -3deg; on hover straightens to -1.5deg, sinks 1px and deepens to an 11% wash; on press sinks 2px and scales to 0.98. One per screen.
- **Secondary:** square 2px ink outline, 52px tall, Anuphan 600 19px. Hover fills solid ink with paper type. Optional trailing arrow nudges 3px on hover.
- **Nav login (in the band):** square 2px paper outline, 40px tall, Anuphan 700 16px. Hover fills paper with band-coloured type.
- **Inline link:** Anuphan 700 16px, 1.5px underline at 5px offset, trailing arrow that nudges 3px on hover; 40px minimum target.

### Tick Box (signature)
A 26px square with a 2px ink border, carrying one of four states, consistent everywhere they appear: **empty** (no alert), **tick** (blue, all good), **ring** (red, alert that lasted), **strike** (blue, resolved). Marks are stroke-drawn SVG; on the landing dosage table they draw in one by one (0.38s each, 0.14s stagger) before the stamp lands. Each box has a Thai `aria-label`, or is hidden when adjacent text already says it.

### Form Fields
Printed label + hand-written value on a 1.5px ink baseline ("ถึง: …", "วันที่: …", "ผู้ดูแล: …"). Fill-in blanks inside running text use a 2px dotted ink underline with the value in Sriracha.

### Dosage Table
2px ink frame, solid-ink caption bar with paper type, rows split by 1.5px ink rules, mark / name + what / hand-written dose. The fall row's dose is red.

### Privacy Promise
A square solid-ink panel with paper type (it reverses with the theme), a line-drawn padlock, and Anuphan 700 at 20–24px. It opens with the lead-in "ความเป็นส่วนตัว:" and carries the binding line "ประมวลผลบนเครื่องของคุณ — ไม่ส่งภาพวิดีโอขึ้นคลาวด์" verbatim. It is never red and never labelled "ข้อควรระวัง": the promise is good news, and red means action or an alert.

### Navigation
The header band: solid ink (paper in dark), 76px tall, CAMWELL in Anuphan 700 30px with 0.04em tracking, text links with a 2px underline that fades in on hover, a 40px square outlined theme toggle with a line-drawn sun/moon.

### Operate layer
App screens use the incumbent `index.css` / `App.css` system: panels on `app-panel` with `app-border` at a 14px radius, primary buttons 42px tall at a 9px radius with white type and a 650 weight, a 3px focus ring at 2px offset, and status colours for good / warn / danger. Its components are not documented here beyond these tokens.

## Do's and Don'ts

### Do:
- **Do** print every rule, box and letter of an envelope surface in the single ink token, and switch it through the reverse-print dark tokens rather than per-component overrides.
- **Do** keep blue for hand marks and focus, and red for the stamp and alerts that lasted. Never use red or a warning label for good news such as the privacy promise.
- **Do** use the four-state tick grammar (empty / tick / ring / strike) with the same meanings wherever status is shown.
- **Do** wrap Thai phrases in non-breaking spans so lines break between phrases.
- **Do** show real default thresholds from code on the label, and say they are defaults.
- **Do** honour `prefers-reduced-motion`: the stamp press and tick drawing are disabled, and hover transitions are removed.

### Don't:
- **Don't** add a second printed colour, green tints, or grey text to the envelope.
- **Don't** put a resting box-shadow on anything on the sheet; only the stamp's entrance shadow exists, and only in motion.
- **Don't** round or rotate anything on the envelope except the stamp.
- **Don't** use more than one stamp per screen.
- **Don't** use icon-font or emoji glyphs for status; marks are drawn SVG strokes.
- **Don't** apply the envelope tokens to app (Operate) screens, or the app's blue accent to envelope screens, until a migration decides it.
