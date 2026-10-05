repo: yanawut/camWell
branch: improve-app-performance

## Last sync
date: 2026-10-05T15:37:18Z

### Updated in this project
- Recreated current single-page app (Camwell Current)
- New dev/admin console: monitor, thresholds, events, face data, dataset recorder

## Screen map
| Screen | Repo files |
|---|---|
| Camwell Current.dc.html | src/App.tsx, src/App.css, src/index.css, src/components/CameraSourceSelector.tsx, src/components/CameraStage.tsx, src/components/SettingsPanel.tsx, src/components/EnrollmentPanel.tsx, src/components/EventLog.tsx, src/components/DatasetRecorderPanel.tsx |
| Camwell Dev Console.dc.html | above + src/types/*.ts, src/lib/poseThrottle.ts, src/lib/inferenceTiming.ts, src/lib/multiPerson.ts, src/hooks/usePoseLandmarker.ts, src/services/datasetRecorder.ts, src/services/apiConfig.ts, docs/performance/17-hitl-camera-verification.md |
