"""Measures the vision service on recorded clips, so a change to tracking or speed can be judged on real footage.

Run from the project root with the vision service's Python:

  vision_service\\.venv\\Scripts\\python.exe vision_service\\tools\\eval_clips.py run <clip.mp4> [<clip.mp4> ...] --logs <dir>
      Runs CameraRunner on each clip at the live rate (11 analysed frames per second of video), saves a JSONL log
      per clip and prints the scores. Takes about as long as YOLO does: ~70 ms per analysed frame on an RTX 2060.
  vision_service\\.venv\\Scripts\\python.exe vision_service\\tools\\eval_clips.py replay <log.jsonl> [...]
      Feeds the tracks and chair boxes saved in a log through a fresh PersonIdentities, without YOLO. Takes seconds,
      so it is the way to try a change to people.py. It cannot know whether pose would find keypoints, so it scores
      people seen in the frame instead of people with keypoints.

Scores per clip:
  ms           mean inference time per frame (run only)
  on_screen    mean people the frontend shows per frame: posture engine people, seen with keypoints in the last 4 s
  slots        distinct IDs that reached the frontend: each one is a new "คนที่ N" whose timers start over
  duplicates   frames where two shown boxes cover one body (IoU >= 0.4)
  on_chair     shown person-frames whose box matches a chair box (IoU >= 0.7, chair conf >= 0.15)
  held         share of returned people that were held, not detected, in that frame
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
from people import iou, person_identities  # noqa: E402

RATE = 11.0           # frames analysed per second of video, as the live service manages
ENGINE_WINDOW = 44    # postureEngine's POSE_TRACK_STALE_MS (4000) at RATE


def score(frames, ms=None):
    """frames: per frame, a list of (id, box, held, has_keypoints) and the chair boxes [(box, conf)]."""
    last, on_screen, slots, duplicates, on_chair, held, total = {}, [], set(), 0, 0, 0, 0
    for k, (people, chairs) in enumerate(frames):
        visible = [p for p in people if p[3]]
        for pid, *_ in visible:
            last[pid] = k
            slots.add(pid)
        on_screen.append(sum(1 for t in last.values() if k - t <= ENGINE_WINDOW))
        boxes = [p[1] for p in visible]
        duplicates += any(iou(boxes[a], boxes[b]) >= 0.4 for a in range(len(boxes)) for b in range(a + 1, len(boxes)))
        on_chair += sum(any(iou(b, c) >= 0.7 and conf >= 0.15 for c, conf in chairs) for b in boxes)
        held += sum(p[2] for p in people)
        total += len(people)
    out = dict(frames=len(frames), on_screen=round(float(np.mean(on_screen)), 2), slots=len(slots),
               duplicates=duplicates, on_chair=on_chair, held=f"{held / max(total, 1):.0%}")
    if ms:
        out = dict(ms=round(float(np.mean(ms[20:] or ms)), 1), **out)
    return out


def run(clips, logs):
    os.chdir(HERE.parent)  # the models are found relative to the project root
    import app as vision
    logs.mkdir(parents=True, exist_ok=True)
    for clip in clips:
        runner = vision.CameraRunner.create()
        seen_inputs = {}
        update = runner.people.update

        def recording_update(tracks, chairs=()):
            seen_inputs["tracks"] = [[int(t), *[round(float(v), 1) for v in b], round(float(c), 3)] for t, b, c in tracks]
            seen_inputs["chairs"] = [[*[round(float(v), 1) for v in b], round(float(c), 3)] for b, c in chairs]
            return update(tracks, chairs)

        runner.people.update = recording_update
        cap = cv2.VideoCapture(str(clip))
        step, i, nxt, frames, ms = cap.get(cv2.CAP_PROP_FPS) / RATE, 0, 0.0, [], []
        out = logs / (Path(clip).stem + ".jsonl")
        with out.open("w", encoding="utf-8") as f:
            while True:
                ok, image = cap.read()
                if not ok:
                    break
                if i >= nxt:
                    nxt += step
                    t = time.perf_counter()
                    result = runner.infer(image)
                    ms.append((time.perf_counter() - t) * 1000)
                    people = [(p["id"], p["box"], p["held"], "keypoints" in p) for p in result["people"]]
                    chairs = [(c[:4], c[4]) for c in seen_inputs["chairs"]]
                    frames.append((people, chairs))
                    f.write(json.dumps(dict(src=i, shown=people, **seen_inputs)) + "\n")
                i += 1
        print(f"{Path(clip).name}: {score(frames, ms)}  log: {out}")


def replay(log_paths):
    for path in log_paths:
        people, frames = person_identities(), []
        for line in open(path, encoding="utf-8"):
            f = json.loads(line)
            tracks = [(t[0], np.array(t[1:5], np.float32), t[5]) for t in f["tracks"]]
            chairs = [(np.array(c[:4], np.float32), c[4]) for c in f["chairs"]]
            shown = people.update(tracks, chairs)
            frames.append(([(p.id, p.box, p.held, not p.held) for p in shown], chairs))
        print(f"{Path(path).name}: {score(frames)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="mode", required=True)
    r = sub.add_parser("run")
    r.add_argument("clips", nargs="+", type=Path)
    r.add_argument("--logs", type=Path, default=Path("vision_service/tools/logs"))
    p = sub.add_parser("replay")
    p.add_argument("logs", nargs="+", type=Path)
    a = ap.parse_args()
    run(a.clips, a.logs) if a.mode == "run" else replay(a.logs)
