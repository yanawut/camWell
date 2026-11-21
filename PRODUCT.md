# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: HR and team leads** at a company that has deployed Camwell to its own office. They watch the wellbeing of a whole team from a dashboard. They react to alerts (a fall, posture that stays bad, fatigue, missed breaks) and read daily reports. They are not ML specialists, and they check in between other work rather than staring at the screen all day.

**Secondary (confirmed by the code, not by an interview):**
- Employees on camera. They are the people being monitored. Their consent and right to erasure are part of the product (see Constraints). The per-desk camera page gives on-screen and audible nudges to the person at that desk.
- Developers and admins tune thresholds, record datasets, calibrate floors and zones, and check service health through the Dev Console (`/?console`) and the YOLO Console (`/?yolo-console`).

## Product Purpose

Camwell watches office workers through cameras and raises an alert when a health or safety problem lasts long enough to matter. Its goal is to cut office-syndrome risk and to catch falls quickly, without turning the office into a surveillance space. Success means HR sees the alerts that matter, false alarms don't drown them, and employees trust that the footage stays in-house.

## Positioning

**Privacy-first and on-premise.** Video never leaves the office. Per-desk detection (posture, falls, fatigue, screen distance, breaks) runs in the browser through MediaPipe and face-api over WebAssembly or TensorFlow.js. Whole-room analytics run on a local `yolo-backend` server, not in a cloud. Face data stays as descriptors in the local camwell-backend SQLite database and is never sent back to browsers. Every future surface and claim must keep this promise; a feature that would send footage off-site conflicts with the product.

## Operating Context

- An internal company deployment. The UI is in **Thai**, with technical terms (Pose, Skeleton, Calibrate, model names) left in English.
- Cameras: built-in or USB webcams, IP cameras over MJPEG, video files and go2rtc streams. Up to 2 cameras on the per-desk page. Workstation mode tracks 1 person and multi-person mode tracks up to 4 per camera. YOLO analyses a whole room.
- Rituals: a 3-second "Calibrate ท่านั่ง" baseline per camera; floor calibration (drag 4 corners) and zone setup for room analytics; daily reports; reviewing and exporting events.
- Surfaces (current routes): landing `/`, pixel-art office dashboard (`/?dashboard`), camera and settings (`/?camera`), alerts, people, reports, gait assessment, Dev Console, YOLO Console.

## Capabilities and Constraints

- Detection: sitting posture (forward head, slouching, leaning), standing posture, falls (triggered at once), fatigue (EAR/MAR), screen distance, break reminders, gait, attendance and presence. Alerts for lasting problems go through a central state machine with hysteresis so they don't flicker.
- Room analytics (yolo-backend): person and object tracks, paths, heatmaps, floor plan and zones, per-session reports with `tracks.csv` export.
- Face features (fatigue, distance, identification) are **off by default**.
- Only Apache 2.0 or MIT model licenses are allowed in the browser stack, because the product may ship closed-source.
- **Undecided / not built yet:** access control for the consoles; LINE Official Account alerts; sending the alert log to the backend fully, with employee and camera IDs; thresholds tuned on a real multi-person dataset.

## Brand Commitments

- Name: **Camwell**.
- Voice: plain, reassuring Thai about looking after people ("ดูแล"), not watching them. The landing page reads "นั่งทำงานอย่างสุขภาพดี ด้วยกล้องที่คอยดูแลคุณ".
- The line "ประมวลผลบนเครื่องของคุณ — ไม่ส่งภาพวิดีโอขึ้นคลาวด์" is a binding promise, not decoration.

## Evidence on Hand

- Working detection pipelines with unit tests (`frontend/src/lib/*.test.ts`, `yolo-backend/tests/`).
- Design prototypes from Claude Design: `docs/camWell/project/Camwell Dev Console.dc.html` and `Camwell Current.dc.html`.
- Performance and verification notes: `docs/performance/`.
- **Absent, so never fabricate:** customer names, testimonials, accuracy or benchmark figures, PDPA certification, and pricing. The README says the consent flow is not yet a fully lawful process.

## Product Principles

1. **Video stays in the office.** No design, feature or copy may suggest that footage goes to a cloud.
2. **Care, not surveillance.** Frame every alert and metric around the employee's health, never around productivity or discipline.
3. **An alert must earn attention.** Show a problem only after it has lasted; a fall is the one instant exception. Noise wears away HR's trust.
4. **Consent is visible.** Biometric features stay opt-in, explicit and deletable, and the UI makes that state clear.
5. **Tell the truth about limits.** Say plainly what a camera angle or model cannot see, rather than suggest certainty.

## Accessibility & Inclusion

- Thai-first typography and copy. Text must render Thai script well, and labels must hold up when Thai runs longer than English.
- Alerts use both colour (red frames and banners) and sound. Never rely on colour alone, and keep the sound mutable.
- No formal WCAG level has been chosen yet.
