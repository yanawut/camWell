"""Scores the detector, posture states and wellness alerts on labelled clips.

  python clip_eval.py                      # every clip in tests/clip_labels.json
  python clip_eval.py --clip c4 --sheet    # one clip, plus contact sheets of what was shown

YOLO + pose output is cached per clip and detector settings (data/eval_cache), so changing anything after
YoloRunner (states, falls, posture) re-scores in seconds. A label is a time span, an image rectangle and the
state of whoever stands in it: tracks change ids between settings, places in the picture do not.
"""
from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import math
import pickle
import sys
from collections import Counter
from dataclasses import asdict
from pathlib import Path

import cv2
import numpy as np

import room_analytics as ra
import wellness as wl

HERE = Path(__file__).resolve().parent
LABELS = HERE / "tests" / "clip_labels.json"
CACHE = HERE / "data" / "eval_cache"
DET_FIELDS = ("det_model", "pose_model", "conf", "track_conf", "nms_iou", "imgsz", "tracker", "pose_mode",
              "pose_imgsz", "same_person_overlap", "hold_frames", "box_follow", "settle_frames", "seat_leave_share",
              "seat_hold_frames", "held_yield_overlap", "held_replace_iou", "held_replace_share", "min_body_share",
              "floor_creep_px", "chair_iou", "chair_conf", "chair_memory")


def det_key(cfg: ra.Config, clip: Path) -> str:
    tracker = Path(cfg.tracker).read_text() if Path(cfg.tracker).exists() else cfg.tracker
    code = "".join(inspect.getsource(o) for o in (ra.YoloRunner, ra.PersonIdentities, ra.Identity, ra.feet_point,
                                                     ra.shared_shift, ra.overlap, ra.iou, ra.expand, ra.PersonDet))
    parts = {f: getattr(cfg, f) for f in DET_FIELDS} | {"tracker": tracker, "clip": clip.name, "runner": code}
    return hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:12]


def detect(clip: Path, cfg: ra.Config, log=print):
    """[(t, persons, objects)] for every frame, from the cache when the detector side is unchanged."""
    path = CACHE / f"{clip.stem.replace(' ', '_')}-{det_key(cfg, clip)}.pkl"
    if path.exists():
        with open(path, "rb") as fh:
            return pickle.load(fh)
    cap = cv2.VideoCapture(str(clip))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    runner, frames, i = ra.YoloRunner(cfg), [], 0
    while True:
        ok, image = cap.read()
        if not ok:
            break
        persons, objects = runner(image)
        frames.append((i / fps, persons, objects))
        i += 1
        if i % 250 == 0:
            log(f"  {clip.name}: frame {i}")
    cap.release()
    CACHE.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        pickle.dump((fps, frames), fh)
    return fps, frames


def frames_of(clip: Path):
    cap = cv2.VideoCapture(str(clip))
    while True:
        ok, image = cap.read()
        if not ok:
            break
        yield image
    cap.release()


def analyse(clip: Path, label: dict, cfg: ra.Config, fps, frames, wsettings=None, engine=None):
    """Runs Analytics and WellnessMonitor over cached detections. Returns rows and alerts."""
    w, h = label.get("size", (1280, 720))
    cfg.floor_img_pts = [(x * w, y * h) for x, y in label["floor_pts"]] if label.get("floor_pts") else None
    cfg.floor_size_m = tuple(label.get("floor_size_m", (8.0, 6.0)))
    an = ra.Analytics(cfg, fps, (w, h))
    mon = wl.WellnessMonitor(wsettings or wl.WellnessSettings(), engine=engine, sink=None, camera="eval",
                             session="eval", clock=lambda: 0.0)
    images = frames_of(clip) if engine is not None else None
    rows, alerts, seen_alerts = [], [], set()
    for i, (t, persons, objects) in enumerate(frames):
        image = next(images) if images is not None else None
        snap = an.update(persons, objects, t, i)
        states = {tr.id: tr.state for tr in snap["people"]}
        mon.update(image, persons, states, {}, t)
        held = {p.id: p.held for p in persons}
        for tr in snap["people"]:
            rows.append(dict(i=i, t=t, id=tr.id, state=tr.state, box=[float(v) for v in tr.box],
                             held=held.get(tr.id, False), speed=tr.speed))
        for a in [*mon.active()]:
            if a["id"] not in seen_alerts:
                seen_alerts.add(a["id"])
                alerts.append(dict(t=round(t, 2), type=a["type"], person=a["person"]))
    return rows, alerts, mon


def at(person, t):
    """(x, y, state) of a labelled person at time t, or None outside their keys."""
    keys = person["keys"]
    if not keys[0][0] <= t <= keys[-1][0]:
        return None
    for (t0, x0, y0), (t1, x1, y1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            a = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
            x, y = x0 + a * (x1 - x0), y0 + a * (y1 - y0)
            break
    else:
        x, y = keys[-1][1:]
    state = next((s for s0, s1, s in person["states"] if s0 <= t < s1), "ignore")
    return x, y, state


def centre(box):
    return (box[0] + box[2]) / 2, (box[1] + box[3]) / 2


def match(people_now, shown):
    """Pairs labelled people with shown boxes, nearest centres first. A box matches within max(50 px, 0.6 of its
    height) of the labelled point."""
    pairs = []
    for name, (x, y, _) in people_now.items():
        for k, r in enumerate(shown):
            cx, cy = centre(r["box"])
            d = math.hypot(cx - x, cy - y)
            if d <= max(50.0, 0.6 * (r["box"][3] - r["box"][1])):
                pairs.append((r["held"], d, name, k))
    out, used_names, used_rows = {}, set(), set()
    for _, _, name, k in sorted(pairs):
        if name not in used_names and k not in used_rows:
            out[name] = shown[k]
            used_names.add(name)
            used_rows.add(k)
    return out, [r for k, r in enumerate(shown) if k not in used_rows]


def score(rows, alerts, label):
    """State accuracy against the labelled people, labelled frames with nobody shown (missing), boxes shown where
    nobody is labelled (false), and fall alerts that should not be there."""
    confusion, by_person = Counter(), Counter()
    false_frames = 0
    by_frame: dict[int, list] = {}
    for r in rows:
        by_frame.setdefault(r["i"], []).append(r)
    fps, people = label["fps"], label["people"]
    n_frames = max(by_frame) + 1 if by_frame else 0
    for i in range(n_frames):
        t = i / fps
        now = {n: p for n, p in ((n, at(person, t)) for n, person in people.items()) if p is not None}
        matched, extra = match(now, by_frame.get(i, []))
        false_frames += sum(1 for r in extra if not r["held"])
        for name, (_, _, state) in now.items():
            if state == "ignore":
                continue
            r = matched.get(name)
            confusion[(state, r["state"] if r else "missing")] += 1
            by_person[(name, state, r["state"] if r else "missing")] += 1
    total = sum(v for (g, p), v in confusion.items() if p != "missing")
    correct = sum(v for (g, p), v in confusion.items() if g == p)
    missing = sum(v for (g, p), v in confusion.items() if p == "missing")
    per_state = {}
    for s in ra.STATES:
        n = sum(v for (g, p), v in confusion.items() if g == s and p != "missing")
        per_state[s] = round(sum(v for (g, p), v in confusion.items() if g == s and p == s) / n, 3) if n else None
    got = Counter(a["type"] for a in alerts)
    unexpected = [a for a in alerts if a["type"] in ("fall", "fall_vanish") and not any(
        e["type"] == a["type"] and abs(e["t"] - a["t"]) <= 2 for e in label.get("alerts", []))]
    return dict(accuracy=round(correct / total, 4) if total else None, frames_scored=total,
                missing=missing, false_frames=false_frames, per_state=per_state,
                confusion={f"{g}->{p}": v for (g, p), v in sorted(confusion.items())},
                errors={f"{n} {g}->{p}": v for (n, g, p), v in sorted(by_person.items()) if g != p},
                alerts=dict(got), false_falls=unexpected)


def sheet(clip: Path, rows, label, out: Path, every=2.0, cols=4):
    """Contact sheet: every `every` seconds, boxes with id/state, and the labelled rectangles."""
    fps = label["fps"]
    by_frame: dict[int, list] = {}
    for r in rows:
        by_frame.setdefault(r["i"], []).append(r)
    tiles = []
    step = int(every * fps)
    for i, image in enumerate(frames_of(clip)):
        if i % step:
            continue
        t = i / fps
        for name, person in label["people"].items():
            now = at(person, t)
            if now is not None:
                x, y, state = now
                cv2.circle(image, (int(x), int(y)), 9, (255, 255, 255), -1)
                cv2.putText(image, f"{name[:6]} {state[:4]}", (int(x) + 10, int(y) + 25), 0, 0.6, (255, 255, 255), 2)
        for r in by_frame.get(i, []):
            x1, y1, x2, y2 = (int(v) for v in r["box"])
            c = ra.COL[r["state"]]
            cv2.rectangle(image, (x1, y1), (x2, y2), c, 1 if r["held"] else 3)
            cv2.putText(image, f"{r['id']} {r['state'][:4]} {r['speed']:.2f}", (x1, max(15, y1 - 5)), 0, 0.7, c, 2)
        cv2.putText(image, f"{t:.1f}s", (10, 40), 0, 1.3, (0, 0, 255), 3)
        tiles.append(cv2.resize(image, (640, 360)))
    pages = []
    per_page = cols * 4
    for p in range(0, len(tiles), per_page):
        chunk = tiles[p:p + per_page]
        while len(chunk) % cols:
            chunk.append(np.zeros_like(tiles[0]))
        page = np.vstack([np.hstack(chunk[k:k + cols]) for k in range(0, len(chunk), cols)])
        path = out.with_name(f"{out.stem}-{p // per_page:02d}.jpg")
        cv2.imwrite(str(path), page)
        pages.append(path)
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", nargs="*", help="label keys; default all")
    ap.add_argument("--sheet", type=Path, help="write contact sheets with this path prefix")
    ap.add_argument("--every", type=float, default=2.0)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    labels = json.loads(LABELS.read_text(encoding="utf-8"))
    results = {}
    for key, label in labels.items():
        if args.clip and key not in args.clip:
            continue
        clip = (HERE / label["path"]).resolve()
        cfg = ra.Config(det_model=str(HERE / "yolov8m.pt"), pose_model=str(HERE / "yolov8m-pose.pt"))
        fps, frames = detect(clip, cfg, log=lambda m: print(m, file=sys.stderr))
        label["fps"] = fps
        rows, alerts, _ = analyse(clip, label, cfg, fps, frames)
        results[key] = score(rows, alerts, label)
        if args.sheet:
            sheet(clip, rows, label, args.sheet.with_name(f"{args.sheet.name}-{key}"), args.every)
    if args.json:
        print(json.dumps(results, indent=1, ensure_ascii=False))
        return
    for key, r in results.items():
        print(f"{key}: accuracy {r['accuracy']} on {r['frames_scored']} frames, missing {r['missing']}, "
              f"false {r['false_frames']}, per state {r['per_state']}")
        print(f"   errors {r['errors']}")
        print(f"   alerts {r['alerts']} false falls {r['false_falls']}")


if __name__ == "__main__":
    main()
