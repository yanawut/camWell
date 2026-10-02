# Camwell MVP1.1 — Agent Implementation Plan

Target repo: `C:\Users\WutGiiz\Desktop\camWell` (React 19 + TS 6 + Vite 8, base commit `1be4407`).
Goal: make the posture **measurement** pipeline correct and stable before any ML work. Work phase by phase; each phase is one branch, each step one commit.

**Verified code for every step** lives in [camwell-step-by-step-guide.md](camwell-step-by-step-guide.md) (same folder as this file) (Thai, find → replace format; verified against `1be4407`: every find-block matches the code, `tsc -b`, `oxlint`, `vite build` and 17 Vitest tests green). Read the matching section before each step and apply its final-state code. This file holds the order, the contracts, the gates, and the gotchas; when the guide and this file disagree on order, this file wins.

Scope: `src/` only. Leave `backend/` (separate Node project, identity/face matching) untouched.

---

## Gate

A step is done only when the gate is **green**:

```bash
npm run build      # tsc -b + vite build, 0 errors
npm run lint       # oxlint, 0 errors
npx vitest run     # all tests pass (from Step 0 onward)
```

Plus the step's own completion criterion below. Commit only on green.

---

## Gotchas (not discoverable from config alone)

- `tsconfig.app.json` has `verbatimModuleSyntax` → type-only imports must use `import type` / `import { type X }`.
- `erasableSyntaxOnly` → no `enum`, no constructor parameter properties. Declare class fields explicitly (pattern: `src/lib/tracker.ts`).
- `noUnusedLocals` / `noUnusedParameters` are errors: remove every import a change orphans.
- `CameraStage.detectFrame` runs inside a rAF loop and reads props/state through `propsRef.current` to avoid stale closures. **Every new prop or state value the loop reads must be added to `propsRef` in both places** (the `useRef({...})` initialiser and the `useEffect` that reassigns it).
- **One `CameraStage` per camera.** `App` renders one per `cameraSlots` entry (max 2); each owns its own pose model, tracker, refs and state. Anything per-camera (break timer, posture baseline) belongs inside `CameraStage`, keyed by its `cameraId` prop when persisted.
- **Two frame sources.** `source` is a `<video>` (local camera; new-frame check via `currentTime`) or an `<img>` (IP MJPEG; no new-frame signal, so before Phase 3 it runs pose on every rAF tick). Use `canvas.width/height` as the frame size; it is synced to the source each tick.
- MediaPipe landmarks come from the **unmirrored** frame (mirroring is CSS only): for a front camera the person's LEFT shoulder (index 11) has the LARGER x. Any left/right geometry must be orientation-independent.
- Time values can legitimately be `0` (tests start at `t=0`; `performance.now()` starts near 0). Check presence with `!== null`, never truthiness.
- **Fall detection** (`lib/fallDetection.ts` + the `// --- Fall detection` block) is edge-triggered and reads `torsoAngleDeg`. It must keep working through every refactor: feed it **raw** (unsmoothed) features, and treat a `null` torso angle as "cannot confirm horizontal".
- Mutable per-frame data lives in refs; `useState` only for what renders. Keep that split.
- `node_modules` already exists; `npm install -D vitest` (in the repo root, not `backend/`) is the only install needed.

---

## Step 0 — Test harness first

Install `vitest` as a devDependency (v5 supports Vite 8), add `"test": "vitest"` to `package.json` scripts.

Write `src/lib/sustainedAlertMachine.test.ts` (guide §5.2). Two of its three tests go **red** on the current code: `stepSustainedAlert` uses truthiness on `candidateSince`, `goodSince`, `lastSignalAt`. Fix all three to explicit `null` checks. Also add `src/lib/fallDetection.test.ts` (guide §5.5; green on current code).

**Done when:** gate green; 7 tests pass; the null-check fix is in the same commit as its test.

From here on, each step lands its tests with its code (guide §5.3, §5.4, §6.1 hold the verified test files; write each test when its subject exists).

---

## Phase 1 — Bugfixes (branch `phase-1-bugfix`)

| Step | Change | Done when |
|---|---|---|
| 1.1 | Delete `src/lib/alertStateMachine.ts`, `src/components/PostureMonitor.tsx` (stubs, zero importers; grep to confirm). Rename the `/* --- PostureMonitor --- */` comment in `App.css`; keep its rules (still used). | gate green; grep for both names returns nothing in `src/` |
| 1.2 | `faceFeaturesEnabled` defaults `false` (face features now also require the backend running). Per-camera people list in `App.tsx` renders regardless of face toggle. Move the break-reminder sliders out of the face-only block in `SettingsPanel.tsx` and add a `breakResetMs` slider (minutes, 1–15). | gate green; no posture/break UI is gated on `faceFeaturesEnabled` |
| 1.3 | Skeleton flicker: store each pose result in `latestPoseResultRef` (inside the existing `try`); `drawOverlay` always draws the ref; reset the ref to `null` in the camera-source-changed block. | gate green; `drawOverlay` never receives a per-tick `null` |
| 1.4 | Break timer. Add `lastPresentAtMs` to `BreakReminderState`. `stepBreakReminder(prev, isPresent, now, thresholds)` resets only after absence ≥ `breakResetMs`. Remove `breakState` from `PersonState`; keep one per-camera `deskBreakStateRef` stepped once per pose frame with `isPresent = matches.length > 0`; label `'คุณ'`, or `` `คนที่นั่งหน้า${p.cameraLabel}` `` in multi-camera mode. | gate green; `src/lib/breakReminder.test.ts` (guide §5.3) passes: 10 s absence keeps session, 4 min absence resets, reminder fires once |
| 1.5 | `fall_suspected_left_frame` can never fire with defaults: the check runs at track removal (≥ `POSE_TRACK_STALE_MS` = 4 s after last sighting) against `now`, but `disappearGraceMs` defaults to 2.5 s. Add `lastSeenAt` to `PersonState` (set on every match and at creation) and compare `person.lastSeenAt - person.lastRapidDropAt <= disappearGraceMs`. | gate green; the condition no longer references `now` |

---

## Phase 2 — Quality gate (branch `phase-2-quality-gate`)

The guide's §2.1 is a manual camera experiment for the human; substitute tests for it.

| Step | Change | Done when |
|---|---|---|
| 2.1 | `shoulderTilt` uses `Math.abs` on both dx and dy (result in 0–90°). | test: level shoulders with left at larger x → `shoulderTiltDeg ≈ 0` |
| 2.2 | Hips become optional. Head + shoulders required, else no person. Report `quality: 'full_body' \| 'upper_body'`; `torsoAngleDeg: number \| null`; skip slouch check when null. UI label appends `(เห็นแค่ช่วงบน)` for upper body. Fall block: `isNearHorizontal` is false when the torso angle is null; metrics use `?? 0`. | test: pose with ears + shoulders only yields `quality === 'upper_body'`, `torsoAngleDeg === null` |

If Phase 4 will run in the same session, 2.2 may be implemented directly in the Phase 4 shape (`extractPostureFeatures` returning `null` for no person) to skip the interim `analyzePosture` rewrite.

---

## Phase 3 — Performance (branch `phase-3-performance`)

| Step | Change | Done when |
|---|---|---|
| 3.1 | `DetectionMode = 'workstation' \| 'multi'` and `maxPeopleFor(mode)` in `src/lib/multiPerson.ts` (workstation → 1, multi → 4). `usePoseLandmarker(numPoses)` with `[numPoses]` effect deps. Mode state in `App` (default `'workstation'`, shared by all cameras), radio in `SettingsPanel`, prop + `propsRef` in `CameraStage`; face results sliced to `maxPeopleFor(mode)`. | gate green; no remaining reference to `MAX_TRACKED_PEOPLE` outside `multiPerson.ts` |
| 3.2 | Add `perfNow - lastPoseRunAtRef.current >= POSE_INTERVAL_MS` (`1000 / 12`) to `shouldProcessPose`, covering both source kinds; pass `perfNow` to `detectForVideo`. This is the only rate limit for IP cameras. | gate green |
| 3.3 | Measure inference time (EMA, 0.9/0.1) in `poseInferenceMsRef`; surface it in the existing 500 ms summary tick, rendered beside the people count. | gate green; value renders in the status line |

---

## Phase 4 — Calibration + smoothing (branch `phase-4-calibration`)

Contracts (full code in guide §4.1–4.5):

```ts
// types/posture.ts
type PoseQuality = 'full_body' | 'upper_body'
interface PostureFeatures { quality; neckAngleDeg: number; torsoAngleDeg: number | null; shoulderTiltDeg: number; headHeightRatio: number | null }
interface PostureBaseline { neckAngleDeg; torsoAngleDeg: number | null; shoulderTiltDeg; headHeightRatio: number | null; createdAt: number }
// PostureThresholds gains headDropThreshold (default 0.15)

// lib/postureAnalysis.ts — replaces analyzePosture
extractPostureFeatures(landmarks, frame: { width; height }, minVisibility): PostureFeatures | null
classifyPosture(features, thresholds, baseline: PostureBaseline | null)  // Phase 4: single issue; Phase 6: PostureProblem[]

// lib/smoothing.ts
ema(prev: number | null, cur, alpha); smoothFeatures(prev | null, cur, alpha)

// lib/postureCalibration.ts
median(values): number | null; computeBaseline(samples, now): PostureBaseline | null  // needs ≥ 12 samples

// services/postureBaselineStore.ts — key 'camwell:posture-baseline:v1:' + cameraId
loadPostureBaseline(cameraId) / savePostureBaseline(cameraId, b) / clearPostureBaseline(cameraId)
```

Rules the code must satisfy:

- All geometry in **pixel space** (`x * width`, `y * height`) before any `atan2`.
- `headHeightRatio = (shoulderMid.y − head.y) / shoulderWidthPx`; only when both shoulders are visible.
- With a baseline, compare deviations (`current − baseline`); `headDrop = 1 − current.headHeightRatio / baseline.headHeightRatio` triggers `forward_head` at ≥ `headDropThreshold`.
- Per-frame order in `CameraStage`: extract → (collect raw sample if calibrating and exactly one person) → `smoothFeatures` (alpha 0.3, stored on `PersonState.smoothedFeatures`) → classify → posture state machine. Fall detection reads the **raw** `features.torsoAngleDeg`.
- Baseline is **per camera and owned by `CameraStage`**: `useState(() => loadPostureBaseline(cameraId))`; add `cameraId` and `postureBaseline` to `propsRef`. `App.tsx` is not touched in this phase.
- Calibration: button sets `calibrationRef = { endsAt: now + 3000, samples: [] }`; on expiry compute the baseline, `savePostureBaseline(p.cameraId, …)`, set state, show a success or failure message.
- Add a `headDropThreshold` slider (5–40 %).

**Done when:** gate green; `src/lib/postureAnalysis.test.ts` (guide §5.4) passes: level shoulders ≈ 0°, upper-body quality, no shoulders → `null`, `good`, `leaning`, calibrated head drop → `forward_head`; no reference to `analyzePosture` or `analysis.` remains in `CameraStage.tsx`.

---

## Phase 5.6 — Optional refactor (branch `phase-5-engine`)

Extract the per-frame logic from `CameraStage.detectFrame` (tracker → features → smoothing → classify → state machines → fall detection → break timer) into a React-free module in `src/lib/` that takes landmarks, frame size, `now` and settings, and returns started/ended events, fall events, and break-due. `CameraStage` keeps camera/source handling, drawing, sound and callbacks.

**Done when:** gate green; engine-level tests drive (a) 10 s of synthetic bad posture → exactly one posture start event, (b) a rapid shoulder drop then 5 s of absence → exactly one `fall_suspected_left_frame`; `CameraStage` has no direct `stepSustainedAlert` calls for posture. Do this phase only when the user asks for it.

---

## Phase 6 — Multi-issue + dataset (branch `phase-6-issues-dataset`)

| Step | Change | Done when |
|---|---|---|
| 6.1 | `PostureProblem = 'forward_head' \| 'slouching' \| 'leaning'`, `POSTURE_PROBLEMS`. `classifyPosture` returns `PostureProblem[]` (empty = good). `PersonState.postureStates: Record<PostureProblem, SustainedAlertState>`; step each machine with `issues.includes(p) ? p : 'good'`. Update `recomputeAlertUi` and track-removal cleanup to iterate all three. The state machine itself and fall detection stay unchanged. | gate green; 17 tests: updated ones use `toEqual([])` / `toEqual(['leaning'])`, and a new test gets both `forward_head` and `leaning` from one pose |
| 6.2 | `src/services/datasetRecorder.ts` (module singleton: start/stop/isRecording/add/count/clear/exportJson, labels `GOOD FORWARD_HEAD SLOUCH LEAN_LEFT LEAN_RIGHT`; each sample carries `cameraId`, since every camera records into the one singleton) and `src/components/DatasetRecorderPanel.tsx`, rendered in `App` only when `import.meta.env.DEV`. Carry `worldLandmarks[i]` through the tracker data; record a sample per frame while recording and exactly one person is matched. Numbers only, no images. | gate green; production build contains no recorder panel |

---

## Hand-off

Finish with a report to the user listing, per phase: commits made, gate result (paste the test summary line), and the **human checks** still owed, since they need a real camera:

- 1.3 skeleton steady while moving; switching camera source leaves no stale skeleton
- 1.4 break reminder continues across a short absence
- 1.5 crouching fast out of the bottom of the frame and staying out ~5 s raises the left-frame fall banner; walking out normally does not
- 2.x a laptop-webcam seat (no hips) shows `(เห็นแค่ช่วงบน)` and is not reported as `leaning` while sitting straight
- 3.x inference ms in workstation vs multi mode, and with 1 vs 2 cameras; IP camera CPU use drops
- 4.x calibration succeeds, persists across reload under `camwell:posture-baseline:v1:<cameraId>`; a second camera starts uncalibrated; looking down at a phone for 8 s alerts `forward_head`
- 6.x simultaneous lean + head drop yields two alerts; exported JSON opens and carries `cameraId`

Report any step that was skipped or left red as exactly that.
