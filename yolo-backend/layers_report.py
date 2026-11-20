"""Says which layer lost a person, from the layers.jsonl a run leaves in its report folder.

  python layers_report.py data\\reports\\<id>            totals, and where sure detections went missing
  python layers_report.py data\\reports\\<id> --at 105   every layer around second 105 of the run
"""
import argparse
import json
from collections import Counter
from pathlib import Path

from room_analytics import Config, iou, overlap


def losses(frame, min_conf):
    """Sure detections with no shown box on them, as (layer that dropped it, detection). "chair" is not a loss
    but a decision: identities took the box for the chair it sits on."""
    lost = []
    for det in frame["dets"]:
        box = det[:4]
        if det[4] < min_conf:
            continue
        if any(overlap(box, s[1:5]) >= 0.5 for s in frame["shown"]):
            continue
        tracked = [t[0] for t in frame["tracks"] if iou(box, t[1:5]) >= 0.5]
        chairs = frame.get("on_chairs", [])
        where = "tracker" if not tracked else "chair" if all(t in chairs for t in tracked) else "identities"
        lost.append((where, det))
    return lost


def detector_gaps(frame, min_conf):
    """People on screen from memory because no sure detection covers them this frame."""
    sure = [d[:4] for d in frame["dets"] if d[4] >= min_conf]
    return [s[0] for s in frame["shown"] if s[6] and not any(iou(s[1:5], box) >= 0.3 for box in sure)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("report", type=Path)
    ap.add_argument("--at", type=float, help="print every layer around this second of the run")
    ap.add_argument("--window", type=float, default=1.0)
    a = ap.parse_args()
    min_conf = Config.conf
    frames = [json.loads(line) for line in (a.report / "layers.jsonl").open(encoding="utf-8")]
    if a.at is not None:
        for f in frames:
            if abs(f["t"] - a.at) <= a.window:
                print(f"t={f['t']}")
                print("  detector", [(round(d[4], 2), [round(v) for v in d[:4]]) for d in f["dets"]])
                print("  tracker ", [(t[0], round(t[5], 2), [round(v) for v in t[1:5]]) for t in f["tracks"]])
                print("  shown   ", [(s[0], round(s[5], 2), [round(v) for v in s[1:5]], "held" if s[6] else "seen") for s in f["shown"]])
        return
    lost = Counter(where for f in frames for where, _ in losses(f, min_conf))
    sure = sum(d[4] >= min_conf for f in frames for d in f["dets"])
    held = sum(s[6] for f in frames for s in f["shown"])
    print(f"frames {len(frames)}  sure detections {sure}  lost at tracker {lost['tracker']}  "
          f"lost at identities {lost['identities']}  dropped as chairs {lost['chair']}")
    print(f"person-frames held from memory {held}  frames with nobody shown {sum(not f['shown'] for f in frames)}")
    for f in frames:
        for where, det in losses(f, min_conf):
            print(f"t={f['t']} {where} conf={det[4]} box={[round(v) for v in det[:4]]}")


if __name__ == "__main__":
    main()
