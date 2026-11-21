"""Fall alerts on the UR Fall Detection Dataset: 30 falls and 40 everyday activities (sitting down, bending,
lying on a bed, picking things up).

  python fall_eval.py              # front camera: falls caught and everyday clips that raised a false alarm
  python fall_eval.py --cam 1      # the ceiling camera (falls only)

The dataset (B. Kwolek, M. Kepski, CC BY-NC-SA 4.0, non-commercial use) is downloaded on first use into
data/eval_cache/urfd. Each video is a depth image beside the RGB one; only the RGB half is used. YOLO + pose output
is cached per video and detector settings, as in clip_eval.py. The clips end moments after the fall, so the last
picture is held 2 s more, everyday clips included.
"""
from __future__ import annotations

import argparse
import pickle
import sys
import urllib.request
from pathlib import Path

import cv2

import clip_eval as ce
import room_analytics as ra
import wellness as wl

URL = "http://fenix.ur.edu.pl/~mkepski/ds/data/{}"
DIR = ce.CACHE / "urfd"


def clips(cam):
    falls = [f"fall-{i:02d}-cam{cam}.mp4" for i in range(1, 31)]
    return falls + ([f"adl-{i:02d}-cam0.mp4" for i in range(1, 41)] if cam == 0 else [])


def fetch(name):
    path = DIR / name
    if not path.exists():
        DIR.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(URL.format(name), path)
    return path


def detect(path: Path, cfg: ra.Config):
    cache = DIR / f"{path.stem}-{ce.det_key(cfg, path)}.pkl"
    if cache.exists():
        with open(cache, "rb") as fh:
            return pickle.load(fh)
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    runner, frames, i = ra.YoloRunner(cfg), [], 0
    while True:
        ok, image = cap.read()
        if not ok:
            break
        persons, objects = runner(image[:, image.shape[1] // 2:])
        frames.append((i / fps, persons, objects))
        i += 1
    cap.release()
    with open(cache, "wb") as fh:
        pickle.dump((fps, frames), fh)
    return fps, frames


def alerts(fps, frames, settings: wl.WellnessSettings):
    mon = wl.WellnessMonitor(settings, sink=None, camera="urfd", session="urfd", clock=lambda: 0.0)
    an = ra.Analytics(ra.Config(), fps, (320, 240))
    out, seen = [], set()
    t_end, last, last_objects = frames[-1]
    # the clips stop moments after the fall: hold the last picture 2 s, as someone on the floor stays there
    hold = [(t_end + k / fps, last, last_objects) for k in range(1, int(2 * fps) + 1)]
    for i, (t, persons, objects) in enumerate(frames + hold):
        snap = an.update(persons, objects, t, i)
        mon.update(None, persons, {tr.id: tr.state for tr in snap["people"]}, {}, t)
        for a in mon.active():
            if a["id"] not in seen and a["type"] in ("fall", "fall_vanish"):
                seen.add(a["id"])
                out.append((round(t, 1), a["type"]))
    mon.close()
    return out


def evaluate(cam=0, cfg: ra.Config | None = None, settings: wl.WellnessSettings | None = None, log=print):
    cfg = cfg or ra.Config(det_model=str(ce.HERE / "yolov8m.pt"), pose_model=str(ce.HERE / "yolov8m-pose.pt"))
    settings = settings or wl.WellnessSettings()
    res = {}
    for name in clips(cam):
        fps, frames = detect(fetch(name), cfg)
        res[name] = alerts(fps, frames, settings)
        log(f"  {name}: {res[name]}")
    falls = [n for n in res if n.startswith("fall")]
    adls = [n for n in res if n.startswith("adl")]
    return dict(caught=sum(bool(res[n]) for n in falls), falls=len(falls),
                false_alarms=sum(bool(res[n]) for n in adls), adl=len(adls),
                missed=[n for n in falls if not res[n]], false=[(n, res[n]) for n in adls if res[n]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cam", type=int, default=0)
    ap.add_argument("-v", action="store_true")
    args = ap.parse_args()
    r = evaluate(args.cam, log=print if args.v else (lambda m: None))
    print(f"falls caught {r['caught']}/{r['falls']}, everyday clips with a false alarm {r['false_alarms']}/{r['adl']}")
    print(f"  missed {r['missed']}")
    print(f"  false {r['false']}")


if __name__ == "__main__":
    sys.exit(main())
