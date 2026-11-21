#!/usr/bin/env python3
"""
room_analytics.py  -  YOLOv8 Real-Time Room Analytics (proof of concept)

Detects and tracks, frame by frame:
  * people, with a posture state: sitting / standing / walking
  * chairs, tables, monitors (COCO "tv") and laptops
  * where everyone is on a floor plan (mini-map), which room/zone they are in,
    how long they have been there, chair utilisation and an occupancy heatmap

and renders a broadcast-style overlay (boxes, IDs, trajectories, stats panel,
mini-map, legend) onto the video.

A built-in simulator renders a synthetic office (people walk between desks,
sit, stand, meet) so the analytics and overlay can be tested without a camera;
it also reports how accurate the sitting/standing/walking classifier was.

Usage
  python room_analytics.py --simulate --seconds 30 --out sim.mp4
  python room_analytics.py --source office.mp4 --out result.mp4
  python room_analytics.py --source 0 --show            # webcam, live window
  python room_analytics.py --source office.mp4 --calibrate calib.png
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import shutil
import subprocess
import time
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field

import cv2
import numpy as np

# COCO class ids used by the object model
OBJECT_CLASSES = {56: "chair", 60: "table", 62: "monitor", 63: "laptop"}
STATES = ("sitting", "standing", "walking")

# --------------------------------------------------------------------- colours (BGR)
COL = {
    "sitting": (120, 220, 110),   # green
    "standing": (240, 200, 90),   # light blue
    "walking": (60, 170, 255),    # orange
    "chair": (220, 120, 230),     # pink / purple
    "table": (70, 205, 245),      # yellow
    "monitor": (255, 140, 120),   # violet-blue
    "laptop": (200, 200, 205),    # grey
}
PANEL_BG = (34, 30, 22)
CARD_BG = (46, 40, 30)
TEAL = (200, 210, 40)
WHITE = (245, 245, 245)
MUTED = (175, 170, 160)
FONT = cv2.FONT_HERSHEY_SIMPLEX


# --------------------------------------------------------------------- config
@dataclass
class Config:
    det_model: str = "yolov8s.pt"         # people + chair / table / monitor / laptop (tracked)
    pose_model: str = "yolov8s-pose.pt"   # 17 body keypoints for the sitting/standing decision
    conf: float = 0.30                    # shown once a person has reached this; furniture must reach it per frame
    track_conf: float = 0.10              # the tracker needs the faint boxes: ByteTrack's second stage reads them
    nms_iou: float = 0.50
    same_person_overlap: float = 0.60     # intersection / smaller box above which a new track is the same person
    hold_frames: int = 15                 # keep showing a person this long after the tracker stops seeing them
    box_follow: float = 0.50              # share of each new box taken per frame; the raw shape flips between frames
    settle_frames: int = 45               # staying put this long means seated: leaning or typing drops detection for a while
    seat_leave_share: float = 0.50        # last seen seated keeps the seat hold this close to the seat (box heights)
    seat_hold_frames: int = 450           # ...so someone seated is held far longer than someone on the move
    held_yield_overlap: float = 0.25      # a held box is only memory: it gives way to a seen box this far over it
    held_replace_iou: float = 0.30        # someone else this close over a held box, at about its size, is in its place
    held_replace_share: float = 0.40      # ...about its size: the smaller box is at least this share of the larger
    min_body_share: float = 0.10          # a box under this share of someone's size is a head or an arm, not them
    floor_creep_px: float = 0.50          # slower than walking, so finding a seated person's floor is not a walk
    chair_iou: float = 0.70               # a person box this close to a chair box is the chair, labelled both ways
    chair_conf: float = 0.15              # ...unless the chair box is fainter: someone behind a chair back gets one too
    chair_memory: int = 15                # frames a chair box keeps counting: a headrest is called a chair on and off
    imgsz: int = 960
    device: object = None                 # None = auto (GPU if available)
    tracker: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bytetrack_room.yaml")
    pose_mode: str = "crop"               # "crop" (accurate, small people OK) | "frame" (faster) | "off"
    pose_imgsz: int = 320                 # crop size for the pose model
    pose_max_people: int = 40
    # Floor calibration: 4 image points (pixels) of a rectangle on the floor, in the order
    # far-left, far-right, near-right, near-left  ->  floor (0,0), (W,0), (W,D), (0,D) metres.
    # None = a rough default trapezoid; calibrate for real measurements.
    floor_img_pts: list | None = None
    floor_size_m: tuple = (8.0, 6.0)      # (W = left-right, D = far-near) in metres
    zones: dict | None = None             # {"name": [(x, y), ...]} polygons in floor metres
    walk_speed: float = 0.45              # m/s above which a standing person counts as walking
    state_window: int = 9                 # frames of majority-vote smoothing for the state
    trail_len: int = 45                   # trajectory points kept per person
    obj_memory_s: float = 8.0             # keep furniture this long after it was last seen
    heat_cell: float = 0.25               # heatmap cell size (metres)
    title: str = "Room Analytics"
    object_labels: str = "minimal"        # "all" = tag every object, "minimal" = only occupied chairs, "none"


def default_floor_pts(w, h):
    return [(0.22 * w, 0.42 * h), (0.78 * w, 0.42 * h), (0.99 * w, 0.98 * h), (0.01 * w, 0.98 * h)]


def default_zones(W, D):
    return {
        "Zone A": [(0, 0), (W / 2, 0), (W / 2, D), (0, D)],
        "Zone B": [(W / 2, 0), (W, 0), (W, D), (W / 2, D)],
    }


# --------------------------------------------------------------------- detections
@dataclass
class PersonDet:
    id: int
    box: np.ndarray            # x1 y1 x2 y2
    conf: float
    kpts: np.ndarray | None = None   # (17, 3) x, y, conf  (COCO order)
    gt_state: str | None = None      # simulator ground truth
    ground: np.ndarray | None = None  # image point on the floor; None = bottom centre of the box
    held: bool = False               # shown from memory: nothing detected them this frame


@dataclass
class ObjDet:
    id: int
    cls: str
    box: np.ndarray
    conf: float


# --------------------------------------------------------------------- geometry helpers
def expand(box, f):
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    return (x1 - w * f, y1 - h * f, x2 + w * f, y2 + h * f)


def inside(pt, box):
    return box[0] <= pt[0] <= box[2] and box[1] <= pt[1] <= box[3]


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def overlap(a, b):
    """Intersection over the smaller box: 1.0 when one sits inside the other, however different their sizes."""
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return inter / smaller if smaller > 0 else 0.0


def shared_shift(old, new):
    """How far a box moved as a whole: on each axis, the part both opposite edges agree on.
    A box that only changes shape moves one edge of a pair, so it shifts by nothing."""
    def agreed(a, b):
        return 0.0 if a * b <= 0 else (a if abs(a) < abs(b) else b)
    return np.array([agreed(new[0] - old[0], new[2] - old[2]), agreed(new[1] - old[1], new[3] - old[3])], np.float32)


def feet_point(kpts):
    """Where visible ankles touch the floor, or None. The pose model also guesses ankles it cannot see."""
    if kpts is None:
        return None
    va, vb = kpts[15, 2] > 0.4, kpts[16, 2] > 0.4
    if va and vb:
        return np.array([(kpts[15, 0] + kpts[16, 0]) / 2, max(kpts[15, 1], kpts[16, 1])], np.float32)
    if va or vb:
        j = 15 if va else 16
        return np.array([kpts[j, 0], kpts[j, 1]], np.float32)
    return None


def angle_deg(a, b, c):
    ba, bc = a - b, c - b
    cosv = float(np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6))
    return math.degrees(math.acos(max(-1.0, min(1.0, cosv))))


class FloorMap:
    """Homography between the camera image and a metric floor plan."""

    def __init__(self, img_pts, size_m):
        self.W, self.D = float(size_m[0]), float(size_m[1])
        src = np.float32(img_pts)
        dst = np.float32([[0, 0], [self.W, 0], [self.W, self.D], [0, self.D]])
        self.H = cv2.getPerspectiveTransform(src, dst)
        self.Hinv = np.linalg.inv(self.H)

    def to_floor(self, pts):
        p = np.asarray(pts, np.float32).reshape(-1, 1, 2)
        return cv2.perspectiveTransform(p, self.H).reshape(-1, 2)

    def to_img(self, pts):
        p = np.asarray(pts, np.float32).reshape(-1, 1, 2)
        return cv2.perspectiveTransform(p, self.Hinv).reshape(-1, 2)

    def px_per_m(self, x, y):
        a, b = self.to_img([(x - 0.5, y), (x + 0.5, y)])
        return float(np.linalg.norm(b - a))


# --------------------------------------------------------------------- posture
def classify_posture(box, kpts, chairs, tables, kc=0.35):
    """Return ('sitting'|'standing', hip_point). Walking is decided later from speed.

    Votes from: thigh direction, knee angle, thigh foreshortening, sitting on a chair,
    box aspect ratio, and lower body hidden behind a table."""
    x1, y1, x2, y2 = box
    w, h = max(x2 - x1, 1.0), max(y2 - y1, 1.0)
    sit = stand = 0.0
    hip = None
    legs_seen = 0
    if kpts is not None:
        k = kpts
        v = k[:, 2] > kc
        if v[11] and v[12]:
            hip = (k[11, :2] + k[12, :2]) / 2
        elif v[11] or v[12]:
            hip = k[11, :2] if v[11] else k[12, :2]
        sh = (k[5, :2] + k[6, :2]) / 2 if (v[5] and v[6]) else None
        torso = float(np.linalg.norm(sh - hip)) if (sh is not None and hip is not None) else 0.0
        for hi, kn, an in ((11, 13, 15), (12, 14, 16)):
            if not (v[hi] and v[kn]):
                continue
            legs_seen += 1
            th = k[kn, :2] - k[hi, :2]
            L = float(np.linalg.norm(th)) + 1e-6
            vert = abs(th[1]) / L                 # 1.0 = thigh points straight down
            if vert < 0.55:
                sit += 1.0
            elif vert > 0.85:
                stand += 0.6
            if torso > 1:
                r = L / torso                     # thigh much shorter than torso = foreshortened
                if r < 0.45:
                    sit += 0.8
                elif r > 0.7:
                    stand += 0.3
            if v[an]:
                a = angle_deg(k[hi, :2], k[kn, :2], k[an, :2])
                if a < 125:
                    sit += 1.0
                elif a > 160:
                    stand += 0.6
    if hip is None:
        hip = np.array([(x1 + x2) / 2, y1 + 0.55 * h], np.float32)
    for c in chairs:
        if inside(hip, expand(c, 0.2)):
            sit += 1.2
            break
    ar = h / w
    if ar < 1.4:
        sit += 0.5
    elif ar > 2.3:
        stand += 0.5
    if legs_seen == 0:                            # legs hidden -> maybe behind a desk
        for tb in tables:
            if tb[1] < y2 < tb[3] + 0.1 * h and x1 < tb[2] and x2 > tb[0]:
                sit += 0.8
                break
    return ("sitting" if sit > stand + 0.2 else "standing"), hip


# --------------------------------------------------------------------- analytics
@dataclass
class Track:
    id: int
    hist: deque = field(default_factory=lambda: deque(maxlen=120))   # (t, x, y) floor, smoothed
    trail: deque = field(default_factory=lambda: deque(maxlen=45))   # image ground points
    raw: deque = field(default_factory=lambda: deque(maxlen=9))
    floor_trail: deque = field(default_factory=lambda: deque(maxlen=60))
    smooth: np.ndarray | None = None
    speed: float = 0.0
    state: str = "standing"
    zone: str | None = None
    zone_since: float = 0.0
    first_t: float = 0.0
    last_t: float = 0.0
    box: np.ndarray | None = None
    kpts: np.ndarray | None = None
    conf: float = 0.0
    hip: np.ndarray | None = None
    ground: np.ndarray | None = None


class Analytics:
    def __init__(self, cfg: Config, fps: float, frame_size):
        self.cfg = cfg
        self.fps = fps or 30.0
        w, h = frame_size
        if cfg.floor_img_pts is None:
            cfg.floor_img_pts = default_floor_pts(w, h)
        self.fm = FloorMap(cfg.floor_img_pts, cfg.floor_size_m)
        W, D = cfg.floor_size_m
        if cfg.zones is None:
            cfg.zones = default_zones(W, D)
        self.zones = {n: np.float32(p).reshape(-1, 1, 2) for n, p in cfg.zones.items()}
        self.tracks: dict[int, Track] = {}
        self.objects: dict[tuple, dict] = {}
        gw, gd = int(math.ceil(W / cfg.heat_cell)), int(math.ceil(D / cfg.heat_cell))
        self.heat = np.zeros((gd, gw), np.float32)
        self.zone_person_s = defaultdict(float)
        self.state_person_s = Counter()
        self.max_speed = 0.0
        self.unique_ids = set()
        self.records = []
        self.confusion = Counter()       # (gt, predicted) when ground truth is available
        self.peak_people = 0

    def _zone_of(self, p):
        for name, poly in self.zones.items():
            if cv2.pointPolygonTest(poly, (float(p[0]), float(p[1])), False) >= 0:
                return name
        return None

    def update(self, persons, objects, t, frame_idx=0):
        cfg, dt = self.cfg, 1.0 / self.fps
        W, D = cfg.floor_size_m

        # ---- furniture registry (kept a while after it disappears, e.g. a chair hidden by a person)
        for o in objects:
            key = (o.cls, o.id)
            fp = self.fm.to_floor([((o.box[0] + o.box[2]) / 2, o.box[3])])[0]
            self.objects[key] = dict(id=o.id, cls=o.cls, box=o.box, conf=o.conf, last_t=t, floor=fp,
                                     seen=True)
        for key in list(self.objects):
            ob = self.objects[key]
            if t - ob["last_t"] > cfg.obj_memory_s:
                del self.objects[key]
            elif ob["last_t"] < t:
                ob["seen"] = False
        chairs = [o["box"] for o in self.objects.values() if o["cls"] == "chair"]
        tables = [o["box"] for o in self.objects.values() if o["cls"] == "table"]

        # ---- people
        active = []
        for p in persons:
            tr = self.tracks.get(p.id)
            if tr is None:
                tr = Track(p.id, trail=deque(maxlen=cfg.trail_len), raw=deque(maxlen=cfg.state_window))
                tr.first_t = t
                self.tracks[p.id] = tr
            self.unique_ids.add(p.id)
            k = p.kpts
            x1, y1, x2, y2 = p.box
            gp = p.ground
            if gp is None:
                gp = feet_point(k)
            if gp is None:
                gp = np.array([(x1 + x2) / 2, y2], np.float32)
            f = self.fm.to_floor([gp])[0]
            f = np.clip(f, [-0.5, -0.5], [W + 0.5, D + 0.5])
            tr.smooth = f if tr.smooth is None else 0.65 * tr.smooth + 0.35 * f
            tr.hist.append((t, float(tr.smooth[0]), float(tr.smooth[1])))
            while tr.hist and t - tr.hist[0][0] > 1.5:
                tr.hist.popleft()
            # speed over ~0.6 s
            t0, x0, y0 = tr.hist[0]
            for e in tr.hist:
                if t - e[0] <= 0.6:
                    t0, x0, y0 = e
                    break
            sp = math.hypot(tr.smooth[0] - x0, tr.smooth[1] - y0) / (t - t0) if t - t0 >= 0.25 else 0.0
            tr.speed = 0.6 * tr.speed + 0.4 * sp

            posture, hip = classify_posture(p.box, k, chairs, tables)
            raw = "sitting" if posture == "sitting" else ("walking" if tr.speed > cfg.walk_speed else "standing")
            tr.raw.append(raw)
            cnt = Counter(tr.raw)
            best = max(cnt.values())
            tr.state = raw if cnt[raw] == best else cnt.most_common(1)[0][0]

            zone = self._zone_of(tr.smooth)
            if zone != tr.zone:
                tr.zone, tr.zone_since = zone, t
            tr.box, tr.kpts, tr.conf, tr.hip, tr.ground, tr.last_t = p.box, k, p.conf, hip, gp, t
            tr.trail.append((int(gp[0]), int(gp[1])))
            tr.floor_trail.append((float(tr.smooth[0]), float(tr.smooth[1])))

            gx, gy = int(tr.smooth[0] / cfg.heat_cell), int(tr.smooth[1] / cfg.heat_cell)
            if 0 <= gy < self.heat.shape[0] and 0 <= gx < self.heat.shape[1]:
                self.heat[gy, gx] += dt
            self.zone_person_s[zone or "Outside"] += dt
            self.state_person_s[tr.state] += dt
            if tr.state == "walking":
                self.max_speed = max(self.max_speed, tr.speed)
            if p.gt_state:
                self.confusion[(p.gt_state, tr.state)] += 1
            active.append(tr)
            self.records.append(dict(frame=frame_idx, t=round(t, 3), id=p.id, state=tr.state,
                                     x_m=round(float(tr.smooth[0]), 3), y_m=round(float(tr.smooth[1]), 3),
                                     zone=zone or "", speed_mps=round(tr.speed, 3), conf=round(p.conf, 3)))
        for tid in [i for i, tr in self.tracks.items() if t - tr.last_t > 3.0]:
            del self.tracks[tid]

        # ---- chair occupancy
        sitting = [tr for tr in active if tr.state == "sitting"]
        for o in self.objects.values():
            if o["cls"] != "chair":
                continue
            o["occupied"] = any(inside(tr.hip, expand(o["box"], 0.25)) or iou(tr.box, o["box"]) > 0.1
                                for tr in sitting)

        states = Counter(tr.state for tr in active)
        zone_counts = Counter(tr.zone or "Outside" for tr in active)
        n_chairs = sum(1 for o in self.objects.values() if o["cls"] == "chair")
        n_occ = sum(1 for o in self.objects.values() if o["cls"] == "chair" and o.get("occupied"))
        obj_counts = Counter(o["cls"] for o in self.objects.values())
        walk_speeds = [tr.speed for tr in active if tr.state == "walking"]
        dwell = [t - tr.zone_since for tr in active]
        self.peak_people = max(self.peak_people, len(active))
        return dict(
            t=t, frame=frame_idx, people=active, objects=list(self.objects.values()),
            states=states, zone_counts=zone_counts, chairs=(n_occ, n_chairs), obj_counts=obj_counts,
            cur_max_speed=max(walk_speeds) if walk_speeds else 0.0, max_speed=self.max_speed,
            avg_dwell=float(np.mean(dwell)) if dwell else 0.0, heat=self.heat,
            mean_conf=float(np.mean([tr.conf for tr in active])) if active else 0.0,
        )

    def summary(self):
        s = dict(unique_people=len(self.unique_ids), peak_people=self.peak_people,
                 person_seconds_by_state={k: round(v, 1) for k, v in self.state_person_s.items()},
                 person_seconds_by_zone={k: round(v, 1) for k, v in self.zone_person_s.items()},
                 max_walking_speed_mps=round(self.max_speed, 2))
        if self.confusion:
            total = sum(self.confusion.values())
            correct = sum(v for (g, p), v in self.confusion.items() if g == p)
            s["state_accuracy"] = round(correct / total, 4)
            s["confusion"] = {f"{g}->{p}": v for (g, p), v in sorted(self.confusion.items())}
        return s

    def write_csv(self, path):
        if not self.records:
            return
        with open(path, "w", newline="") as fh:
            wr = csv.DictWriter(fh, fieldnames=list(self.records[0].keys()))
            wr.writeheader()
            wr.writerows(self.records)


# --------------------------------------------------------------------- drawing helpers
def txt(img, s, org, scale, color=WHITE, thick=1, anchor="l"):
    (tw, th), _ = cv2.getTextSize(s, FONT, scale, thick)
    x, y = int(org[0]), int(org[1])
    if anchor == "r":
        x -= tw
    elif anchor == "c":
        x -= tw // 2
    cv2.putText(img, s, (x, y), FONT, scale, color, thick, cv2.LINE_AA)
    return tw, th


def rrect(img, x1, y1, x2, y2, r, color, alpha=1.0, border=None, bt=1):
    x1, y1, x2, y2, r = int(x1), int(y1), int(x2), int(y2), int(max(0, r))
    H, W = img.shape[:2]
    ax1, ay1, ax2, ay2 = max(0, x1), max(0, y1), min(W, x2), min(H, y2)
    if ax2 <= ax1 or ay2 <= ay1:
        return
    r = min(r, (x2 - x1) // 2, (y2 - y1) // 2)
    mask = np.zeros((y2 - y1, x2 - x1), np.uint8)
    cv2.rectangle(mask, (r, 0), (x2 - x1 - r, y2 - y1), 255, -1)
    cv2.rectangle(mask, (0, r), (x2 - x1, y2 - y1 - r), 255, -1)
    for cx, cy in ((r, r), (x2 - x1 - r - 1, r), (r, y2 - y1 - r - 1), (x2 - x1 - r - 1, y2 - y1 - r - 1)):
        cv2.circle(mask, (cx, cy), r, 255, -1, cv2.LINE_AA)
    m = mask[ay1 - y1:ay2 - y1, ax1 - x1:ax2 - x1].astype(np.float32)[..., None] / 255.0 * alpha
    roi = img[ay1:ay2, ax1:ax2].astype(np.float32)
    img[ay1:ay2, ax1:ax2] = (roi * (1 - m) + np.array(color, np.float32) * m).astype(np.uint8)
    if border is not None:
        pts = []
        for cx, cy, a0 in ((x2 - r, y1 + r, 270), (x2 - r, y2 - r, 0), (x1 + r, y2 - r, 90), (x1 + r, y1 + r, 180)):
            for a in range(a0, a0 + 91, 15):
                pts.append((cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))))
        cv2.polylines(img, [np.int32(pts)], True, border, bt, cv2.LINE_AA)


def dashed(img, pts, color, thick=2, every=2, fade=True):
    n = len(pts)
    for i in range(0, n - 1, every):
        a = 0.25 + 0.75 * (i / max(1, n - 1)) if fade else 1.0
        c = tuple(int(v * a) for v in color)
        cv2.circle(img, pts[i], max(1, thick), c, -1, cv2.LINE_AA)


# --------------------------------------------------------------------- renderer
class Renderer:
    """Draws boxes + labels on the frame and appends a stats panel on the right."""

    def __init__(self, cfg: Config, frame_size, min_height=720):
        self.cfg = cfg
        self.fw, self.fh = frame_size                    # native frame size (annotations)
        self.up = max(1.0, min_height / self.fh)         # small videos are upscaled for a readable panel
        self.w, self.h = int(round(self.fw * self.up)), int(round(self.fh * self.up))
        self.s = self.h / 1000.0                        # layout scale (designed at 1000 px height)
        self.pw = int(round(430 * self.s))              # panel width
        self.out_size = ((self.w + self.pw) // 2 * 2, self.h // 2 * 2)
        W, D = cfg.floor_size_m
        self.W, self.D = W, D

    def S(self, v):
        return int(round(v * self.s))

    # ---------------- on-frame annotations
    def _label(self, img, box, color, text, fs, thick):
        x1, y1, x2, y2 = [int(v) for v in box]
        cv2.rectangle(img, (x1, y1), (x2, y2), color, thick, cv2.LINE_AA)
        (tw, th), _ = cv2.getTextSize(text, FONT, fs, 1)
        pad = max(3, int(th * 0.45))
        ly2 = y1 - 4
        ly1 = ly2 - th - 2 * pad
        if ly1 < 0:
            ly1, ly2 = y1 + 4, y1 + 4 + th + 2 * pad
        lx1 = max(0, min(x1, img.shape[1] - tw - 2 * pad - 2))
        rrect(img, lx1, ly1, lx1 + tw + 2 * pad, ly2, pad, (25, 22, 18), 0.82, border=color, bt=1)
        cv2.putText(img, text, (lx1 + pad, ly2 - pad), FONT, fs, WHITE, 1, cv2.LINE_AA)

    def annotate(self, img, snap):
        fs = max(0.38, self.fh / 2100.0)
        thick = max(1, int(round(self.fh / 600)))
        for o in sorted(snap["objects"], key=lambda o: o["box"][3]):
            if not o.get("seen", True):
                continue
            c = COL[o["cls"]]
            mode = self.cfg.object_labels
            occ = o["cls"] == "chair" and o.get("occupied")
            if mode == "all" or (mode == "minimal" and occ):
                tag = f"chair #{o['id']:02d} occupied" if occ else f"{o['cls']} #{o['id']:02d} {o['conf']:.2f}"
                self._label(img, o["box"], c, tag, fs * 0.85, 1)
            else:
                x1, y1, x2, y2 = [int(v) for v in o["box"]]
                cv2.rectangle(img, (x1, y1), (x2, y2), c, 1, cv2.LINE_AA)
        for tr in sorted(snap["people"], key=lambda t: t.box[3]):
            c = COL[tr.state]
            pts = list(tr.trail)
            if len(pts) > 2:
                dashed(img, pts, c, thick=max(1, thick), every=2)
            self._label(img, tr.box, c, f"person #{tr.id:02d} {tr.state} {tr.conf:.2f}", fs, thick + 1)
            if tr.ground is not None:
                cv2.ellipse(img, (int(tr.ground[0]), int(tr.ground[1])),
                            (max(6, int((tr.box[2] - tr.box[0]) * 0.35)), max(3, int((tr.box[2] - tr.box[0]) * 0.1))),
                            0, 0, 360, c, 1, cv2.LINE_AA)

    def scoreboard(self, img, snap):
        s = self.s * 1.15
        S = lambda v: int(round(v * s))
        x, y = S(30), S(26)
        n = len(snap["people"])
        seated = snap["states"].get("sitting", 0)
        blocks = [("PEOPLE", str(n), (190, 120, 40)), ("SEATED", str(seated), (60, 130, 40))]
        bw, bh = S(150), S(52)
        for i, (lab, val, col) in enumerate(blocks):
            bx = x + i * (bw + S(4))
            rrect(img, bx, y, bx + bw, y + bh, S(8), col, 0.92)
            txt(img, lab, (bx + S(12), y + S(33)), 0.62 * s, WHITE, 2)
            txt(img, val, (bx + bw - S(14), y + S(37)), 1.05 * s, WHITE, 2, anchor="r")
        t = snap["t"]
        clock = f"{int(t // 60):02d}:{int(t % 60):02d}"
        cx = x + bw + S(2)
        rrect(img, cx - S(70), y + bh + S(2), cx + S(70), y + bh + S(40), S(6), (30, 26, 20), 0.88)
        txt(img, clock, (cx, y + bh + S(31)), 0.85 * s, WHITE, 2, anchor="c")

    def bottom_bar(self, img, info, snap):
        s = self.s * 1.1
        S = lambda v: int(round(v * s))
        bw, bh = min(self.w - S(60), S(1000)), S(76)
        x, y = S(30), self.h - bh - S(26)
        rrect(img, x, y, x + bw, y + bh, S(12), (30, 26, 20), 0.88, border=(90, 90, 70), bt=1)
        cx, cy = x + S(42), y + bh // 2
        cv2.circle(img, (cx, cy), S(16), TEAL, max(1, S(2)), cv2.LINE_AA)
        cv2.circle(img, (cx, cy), S(5), TEAL, -1, cv2.LINE_AA)
        txt(img, info.get("model", "YOLOv8"), (x + S(78), y + S(33)), 0.75 * s, WHITE, 2)
        txt(img, info.get("subtitle", "Real-Time Detection, Tracking & Analytics"), (x + S(78), y + S(60)),
            0.55 * s, MUTED, 1)
        cols = [("FPS", f"{info.get('fps', 0):.1f}"), ("Mean conf", f"{snap['mean_conf']:.2f}"),
                ("Tracking ID", f"Active ({len(snap['people']) + sum(1 for o in snap['objects'] if o.get('seen'))})")]
        col_x = x + int(bw * 0.52)
        step = int(bw * 0.16)
        for i, (lab, val) in enumerate(cols):
            px = col_x + i * step
            cv2.line(img, (px - S(14), y + S(14)), (px - S(14), y + bh - S(14)), (90, 90, 70), 1)
            txt(img, lab, (px, y + S(30)), 0.5 * s, MUTED, 1)
            txt(img, val, (px, y + S(60)), 0.78 * s if i < 2 else 0.62 * s, TEAL if i < 2 else (110, 220, 120), 2)

    # ---------------- floor-plan helpers
    def _fit(self, x1, y1, x2, y2):
        sc = min((x2 - x1) / self.W, (y2 - y1) / self.D)
        ox = x1 + ((x2 - x1) - self.W * sc) / 2
        oy = y1 + ((y2 - y1) - self.D * sc) / 2
        return lambda p: (int(ox + p[0] * sc), int(oy + p[1] * sc)), sc, (int(ox), int(oy),
                                                                           int(ox + self.W * sc), int(oy + self.D * sc))

    def heatmap(self, pan, heat, x1, y1, x2, y2):
        f, sc, (fx1, fy1, fx2, fy2) = self._fit(x1, y1, x2, y2)
        cv2.rectangle(pan, (fx1, fy1), (fx2, fy2), (60, 55, 45), -1)
        if heat.max() > 0:
            hm = cv2.GaussianBlur(heat, (0, 0), 1.2)
            hm = (np.clip(hm / (hm.max() + 1e-6), 0, 1) ** 0.6 * 255).astype(np.uint8)
            hm = cv2.resize(hm, (fx2 - fx1, fy2 - fy1), interpolation=cv2.INTER_CUBIC)
            col = cv2.applyColorMap(hm, cv2.COLORMAP_INFERNO)
            a = (hm.astype(np.float32) / 255.0)[..., None] * 0.9
            roi = pan[fy1:fy2, fx1:fx2].astype(np.float32)
            pan[fy1:fy2, fx1:fx2] = (roi * (1 - a) + col.astype(np.float32) * a).astype(np.uint8)
        for name, poly in self.cfg.zones.items():
            cv2.polylines(pan, [np.int32([f(p) for p in poly])], True, (150, 150, 140), 1, cv2.LINE_AA)
        cv2.rectangle(pan, (fx1, fy1), (fx2, fy2), (200, 200, 190), 1)

    def minimap(self, pan, snap, x1, y1, x2, y2):
        f, sc, (fx1, fy1, fx2, fy2) = self._fit(x1, y1, x2, y2)
        cv2.rectangle(pan, (fx1, fy1), (fx2, fy2), (52, 62, 48), -1)
        for gx in range(1, int(self.W) + 1):
            cv2.line(pan, f((gx, 0)), f((gx, self.D)), (62, 74, 58), 1)
        for gy in range(1, int(self.D) + 1):
            cv2.line(pan, f((0, gy)), f((self.W, gy)), (62, 74, 58), 1)
        fs = 0.36 * self.s * 1.15
        for name, poly in self.cfg.zones.items():
            pts = np.int32([f(p) for p in poly])
            cv2.polylines(pan, [pts], True, (200, 210, 190), 1, cv2.LINE_AA)
            n = snap["zone_counts"].get(name, 0)
            mx, my = pts[:, 0].min(), pts[:, 1].min()
            txt(pan, f"{name} ({n})", (mx + self.S(4), my + self.S(14)), fs, (215, 220, 210), 1)
        cv2.rectangle(pan, (fx1, fy1), (fx2, fy2), (220, 225, 215), 1)
        size = {"table": 0.30, "chair": 0.14, "monitor": 0.10, "laptop": 0.10}
        for o in snap["objects"]:
            c = COL[o["cls"]]
            p = f(np.clip(o["floor"], [0, 0], [self.W, self.D]))
            r = max(2, int(size[o["cls"]] * sc))
            if o["cls"] == "chair" and o.get("occupied"):
                cv2.rectangle(pan, (p[0] - r, p[1] - r), (p[0] + r, p[1] + r), c, -1)
            else:
                cv2.rectangle(pan, (p[0] - r, p[1] - r), (p[0] + r, p[1] + r), c, 1)
        for tr in snap["people"]:
            c = COL[tr.state]
            ft = [f(p) for p in list(tr.floor_trail)[::3]]
            for i in range(1, len(ft)):
                cv2.line(pan, ft[i - 1], ft[i], tuple(int(v * 0.6) for v in c), 1, cv2.LINE_AA)
            p = f(np.clip(tr.smooth, [0, 0], [self.W, self.D]))
            cv2.circle(pan, p, max(4, self.S(7)), c, -1, cv2.LINE_AA)
            cv2.circle(pan, p, max(4, self.S(7)), (20, 20, 20), 1, cv2.LINE_AA)
            txt(pan, str(tr.id), (p[0] + self.S(8), p[1] - self.S(6)), 0.33 * self.s * 1.2, WHITE, 1)

    def panel(self, snap, info):
        S, s = self.S, self.s
        pan = np.full((self.h, self.pw, 3), PANEL_BG, np.uint8)
        m = S(14)
        # header
        cx, cy = m + S(26), S(58)
        cv2.circle(pan, (cx, cy), S(18), TEAL, max(1, S(2)), cv2.LINE_AA)
        cv2.circle(pan, (cx, cy), S(6), TEAL, -1, cv2.LINE_AA)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cv2.line(pan, (cx + dx * S(22), cy + dy * S(22)), (cx + dx * S(28), cy + dy * S(28)), TEAL, max(1, S(2)))
        txt(pan, "YOLO Real-Time", (m + S(62), S(46)), 0.72 * s, WHITE, 2)
        txt(pan, self.cfg.title, (m + S(62), S(74)), 0.72 * s, WHITE, 2)
        txt(pan, "Proof of Concept", (m + S(62), S(99)), 0.55 * s, TEAL, 1)
        live = info.get("badge", "LIVE")
        bx2 = self.pw - m
        rrect(pan, bx2 - S(78), S(22), bx2, S(48), S(6), (40, 50, 35), 1.0, border=(110, 220, 120))
        cv2.circle(pan, (bx2 - S(62), S(35)), S(5), (110, 220, 120), -1, cv2.LINE_AA)
        txt(pan, live, (bx2 - S(52), S(41)), 0.45 * s, WHITE, 1)

        # stats card
        y0 = S(118)
        rows_h = S(33)
        st = snap["states"]
        occ, nch = snap["chairs"]
        oc = snap["obj_counts"]
        busiest = max(snap["zone_counts"].items(), key=lambda kv: kv[1]) if snap["zone_counts"] else ("-", 0)
        rows = [
            ("People detected", f"{len(snap['people'])}", TEAL),
            ("Sitting / Standing / Walking", f"{st.get('sitting', 0)} / {st.get('standing', 0)} / {st.get('walking', 0)}", WHITE),
            ("Chair utilisation", f"{occ}/{nch}", TEAL),
            ("Tables / Monitors / Laptops", f"{oc.get('table', 0)} / {oc.get('monitor', 0)} / {oc.get('laptop', 0)}", WHITE),
            ("Walking speed (max)", f"{snap['max_speed']:.2f} m/s", TEAL),
            ("Busiest zone", f"{busiest[0]} ({busiest[1]})", WHITE),
            ("Avg dwell in zone", f"{snap['avg_dwell']:.0f} s", TEAL),
        ]
        card_h = S(12) + rows_h * len(rows) + S(14) + S(26) + S(120) + S(12)
        rrect(pan, m, y0, self.pw - m, y0 + card_h, S(10), CARD_BG, 1.0, border=(80, 75, 60))
        fs = 0.47 * s
        y = y0 + S(12)
        icons = ["person", "state", "chair", "desk", "speed", "zone", "time"]
        for i, (lab, val, vc) in enumerate(rows):
            yc = y + rows_h // 2
            ix = m + S(20)
            ic = (200, 200, 190)
            if icons[i] == "person":
                cv2.circle(pan, (ix, yc - S(4)), S(4), ic, 1, cv2.LINE_AA)
                cv2.ellipse(pan, (ix, yc + S(7)), (S(7), S(5)), 0, 180, 360, ic, 1, cv2.LINE_AA)
            elif icons[i] == "state":
                for j, sname in enumerate(STATES):
                    cv2.circle(pan, (ix - S(7) + j * S(7), yc), S(3), COL[sname], -1, cv2.LINE_AA)
            elif icons[i] == "chair":
                cv2.rectangle(pan, (ix - S(6), yc), (ix + S(6), yc + S(3)), ic, 1)
                cv2.line(pan, (ix - S(6), yc), (ix - S(6), yc - S(9)), ic, 1)
            elif icons[i] == "desk":
                cv2.rectangle(pan, (ix - S(8), yc - S(8)), (ix + S(8), yc + S(3)), ic, 1)
                cv2.line(pan, (ix, yc + S(3)), (ix, yc + S(8)), ic, 1)
            elif icons[i] == "speed":
                cv2.line(pan, (ix + S(3), yc - S(9)), (ix - S(4), yc + S(1)), ic, 1, cv2.LINE_AA)
                cv2.line(pan, (ix - S(4), yc + S(1)), (ix + S(4), yc - S(1)), ic, 1, cv2.LINE_AA)
                cv2.line(pan, (ix + S(4), yc - S(1)), (ix - S(3), yc + S(9)), ic, 1, cv2.LINE_AA)
            elif icons[i] == "zone":
                cv2.rectangle(pan, (ix - S(8), yc - S(7)), (ix + S(8), yc + S(7)), ic, 1)
                cv2.line(pan, (ix, yc - S(7)), (ix, yc + S(7)), ic, 1)
            else:
                cv2.circle(pan, (ix, yc), S(8), ic, 1, cv2.LINE_AA)
                cv2.line(pan, (ix, yc), (ix, yc - S(5)), ic, 1)
                cv2.line(pan, (ix, yc), (ix + S(4), yc), ic, 1)
            txt(pan, lab, (m + S(40), yc + S(6)), fs, WHITE, 1)
            txt(pan, val, (self.pw - m - S(14), yc + S(6)), fs * 1.05, vc, 2, anchor="r")
            if lab == "Chair utilisation":
                ratio = occ / nch if nch else 0.0
                bx1, bx2b = m + S(40), self.pw - m - S(14)
                by = yc + S(13)
                cv2.line(pan, (bx1, by), (bx2b, by), (70, 70, 60), max(2, S(4)), cv2.LINE_AA)
                cv2.line(pan, (bx1, by), (bx1 + int((bx2b - bx1) * ratio), by), TEAL, max(2, S(4)), cv2.LINE_AA)
            if i < len(rows) - 1:
                cv2.line(pan, (m + S(12), y + rows_h), (self.pw - m - S(12), y + rows_h), (70, 66, 54), 1)
            y += rows_h
        y += S(14)
        txt(pan, "Occupancy heatmap", (m + S(20), y + S(14)), fs, WHITE, 1)
        y += S(26)
        self.heatmap(pan, snap["heat"], m + S(40), y, self.pw - m - S(40), y + S(118))

        # mini-map card
        y1 = y0 + card_h + S(12)
        y2 = y1 + S(300)
        rrect(pan, m, y1, self.pw - m, y2, S(10), CARD_BG, 1.0, border=(80, 75, 60))
        tw, _ = txt(pan, "Floor Plan", (m + S(16), y1 + S(28)), 0.55 * s, WHITE, 2)
        txt(pan, "(Live Tracking)", (m + S(26) + tw, y1 + S(28)), 0.48 * s, MUTED, 1)
        self.minimap(pan, snap, m + S(14), y1 + S(42), self.pw - m - S(14), y2 - S(12))

        # legend card
        l1 = y2 + S(12)
        l2 = self.h - S(14)
        rrect(pan, m, l1, self.pw - m, l2, S(10), CARD_BG, 1.0, border=(80, 75, 60))
        txt(pan, "Legend", (m + S(16), l1 + S(28)), 0.55 * s, WHITE, 2)
        items = [("Person - sitting", "sitting"), ("Person - standing", "standing"),
                 ("Person - walking", "walking"), ("Chair", "chair"), ("Table", "table"),
                 ("Monitor", "monitor"), ("Laptop", "laptop"), ("Trajectory / Tracking", None)]
        avail = (l2 - l1) - S(44)
        half = (len(items) + 1) // 2
        lh = min(S(26), avail // half)
        colw = (self.pw - 2 * m) // 2
        for i, (lab, key) in enumerate(items):
            col, row = i // half, i % half
            lx = m + S(16) + col * colw
            ly = l1 + S(44) + row * lh
            if key:
                cv2.rectangle(pan, (lx, ly - S(6)), (lx + S(22), ly + S(6)), COL[key], max(1, S(2)))
            else:
                for dx in range(0, S(22), max(3, S(6))):
                    cv2.circle(pan, (lx + dx, ly), max(1, S(2)), WHITE, -1)
            txt(pan, lab, (lx + S(30), ly + S(5)), 0.42 * s, WHITE, 1)
        return pan

    def render(self, frame, snap, info):
        img = frame.copy()
        self.annotate(img, snap)
        if self.up > 1.0:
            img = cv2.resize(img, (self.w, self.h), interpolation=cv2.INTER_LINEAR)
        self.scoreboard(img, snap)
        self.bottom_bar(img, info, snap)
        out = np.hstack([img, self.panel(snap, info)])
        return out[: self.out_size[1], : self.out_size[0]]


# --------------------------------------------------------------------- YOLO runner
@dataclass
class Identity:
    id: int
    box: np.ndarray       # eased, for display
    detected: np.ndarray  # last raw box, to measure movement against
    ground: np.ndarray
    conf: float
    last_frame: int
    confirmed: bool = False      # a track that reached min_conf has driven this identity
    travel: np.ndarray = field(default_factory=lambda: np.zeros(2, np.float32))  # from the box alone, never pose
    still_anchor: np.ndarray = field(default_factory=lambda: np.zeros(2, np.float32))
    still_since: int = 0
    still_h: float = 0.0  # box height when they started keeping still
    since: int = 0               # frame it was created: when two turn out to be one person, the older id stays
    apart: set = field(default_factory=set)  # ids seen in the same frame clear of this one: someone else
    tracks: set = field(default_factory=set)  # tracks decided to be this person: theirs wherever the box goes
    seat: np.ndarray | None = None  # where their last seated stretch began, and the box height then
    seat_h: float = 0.0


class PersonIdentities:
    """Decides which person each ByteTrack track belongs to. YOLO gives a partly hidden person several box
    shapes, each of which can start its own track, so tracks and people are not one to one."""

    def __init__(self, min_conf, same_person_overlap, hold_frames, box_follow, settle_frames, seat_hold_frames,
                 held_yield_overlap, min_body_share, floor_creep_px, chair_iou, chair_conf, chair_memory,
                 seat_leave_share, held_replace_iou, held_replace_share):
        self.min_conf, self.same_person_overlap, self.hold_frames = min_conf, same_person_overlap, hold_frames
        self.box_follow, self.settle_frames, self.seat_hold_frames = box_follow, settle_frames, seat_hold_frames
        self.held_yield_overlap, self.min_body_share = held_yield_overlap, min_body_share
        self.floor_creep_px, self.seat_leave_share = floor_creep_px, seat_leave_share
        self.held_replace_iou, self.held_replace_share = held_replace_iou, held_replace_share
        self.chair_iou, self.chair_conf, self.chair_memory = chair_iou, chair_conf, chair_memory
        self.chairs: list[tuple[int, np.ndarray]] = []  # (frame, box) of chairs detected recently
        self.on_chairs: list[int] = []  # tracks dropped this frame as the chair they sit on
        self.frame = 0
        self.people: dict[int, Identity] = {}
        self.owner: dict[int, int] = {}  # track id -> person id
        self.track_peak: dict[int, float] = {}

    def _person_of(self, track_id, box, conf):
        person = self.people.get(self.owner.get(track_id))
        if person and (track_id in person.tracks or overlap(box, person.box) >= self.same_person_overlap):
            return person
        matches = [p for p in self.people.values() if overlap(box, p.box) >= self.same_person_overlap]
        person = max(matches, key=lambda p: overlap(box, p.box), default=None)
        if person is None:
            ground = np.array([(box[0] + box[2]) / 2, box[3]], np.float32)
            person = self.people[track_id] = Identity(track_id, box, box, ground, conf, self.frame, since=self.frame,
                                                      tracks={track_id})
        self.owner[track_id] = person.id
        return person

    def _see(self, person, candidates):
        """A faint box around someone (a chair back, say) must not win over the person detected inside it."""
        if person.confirmed:
            candidates = [c for c in candidates if self._is_body(c[0], person.box)]
            if not candidates:
                return
        strong = [c for c in candidates if c[1] >= self.min_conf] or candidates
        box, person.conf = max(strong, key=lambda c: iou(c[0], person.box))
        if person.confirmed:
            shift = shared_shift(person.detected, box)
            person.ground = person.ground + shift
            person.travel = person.travel + shift
            person.box = person.box + self.box_follow * (box - person.box)
        else:
            person.confirmed, person.box = True, box
            person.ground = np.array([(box[0] + box[2]) / 2, box[3]], np.float32)
            person.still_since, person.still_h = self.frame, box[3] - box[1]
        person.detected = box
        person.last_frame = self.frame
        if np.hypot(*(person.travel - person.still_anchor)) > 0.15 * (box[3] - box[1]):
            person.still_anchor, person.still_since, person.still_h = person.travel, self.frame, box[3] - box[1]
        elif self._settled(person) and box[3] > person.ground[1]:
            # a hidden person's box is cut short, never too long, so the lowest bottom seen is nearest the floor
            lower = min(box[3], person.ground[1] + self.floor_creep_px)
            person.ground = np.array([person.ground[0], lower], np.float32)
        if self._settled(person):
            person.seat, person.seat_h = person.still_anchor, person.still_h

    def _is_body(self, box, of):
        return (box[2] - box[0]) * (box[3] - box[1]) >= self.min_body_share * (of[2] - of[0]) * (of[3] - of[1])

    def _settled(self, person):
        return person.confirmed and person.last_frame - person.still_since >= self.settle_frames

    def place_feet(self, person_id, feet):
        """The floor point after pose. Legs under a desk still get ankles, guessed and moving with the arms,
        so only someone on the move is placed by them."""
        person = self.people[person_id]
        if feet is not None and not self._settled(person):
            person.ground = feet
        return person.ground

    def _note_apart(self):
        """People seen in the same frame clear of each other are two people, wherever their boxes go later."""
        seen = [p for p in self.people.values() if p.confirmed and p.last_frame == self.frame]
        for a in seen:
            a.apart.update(b.id for b in seen if b is not a and overlap(a.box, b.box) < self.held_yield_overlap)

    def _in_place_of(self, person, held):
        """Someone else over a held box at about its size now stands where the held person was. A walker in front
        of someone seated is bigger than them, so does not count."""
        a, b = [(box[2] - box[0]) * (box[3] - box[1]) for box in (person.box, held.box)]
        return iou(person.box, held.box) >= self.held_replace_iou and min(a, b) >= self.held_replace_share * max(a, b)

    def _merge_onto_held(self):
        """A held person and a newly seen box on the same spot are one person, under the older id. Someone seen
        clear of the held person is someone else, such as a person walking in front of them; but once they are in
        the held person's place, the held box is stale and goes."""
        confirmed = [p for p in self.people.values() if p.confirmed]
        seen = [p for p in confirmed if p.last_frame == self.frame]
        for held in (p for p in confirmed if p.last_frame < self.frame):
            twin = next((p for p in seen if p.id in self.people
                         and overlap(p.box, held.box) >= self.held_yield_overlap
                         and (p.id not in held.apart or self._in_place_of(p, held))), None)
            if twin is None:
                continue
            if twin.id in held.apart:
                del self.people[held.id]
                self.owner = {t: p for t, p in self.owner.items() if p != held.id}
                continue
            if self._is_body(twin.box, held.box) and twin.since < held.since:
                twin.tracks |= held.tracks
                self.owner = {t: twin.id if p == held.id else p for t, p in self.owner.items()}
                del self.people[held.id]
                continue
            if self._is_body(twin.box, held.box):
                if not self._settled(held):
                    held.ground = twin.ground
                held.box, held.detected, held.conf = twin.box, twin.detected, twin.conf
                held.last_frame = self.frame
            held.tracks |= twin.tracks
            self.owner = {t: held.id if p == twin.id else p for t, p in self.owner.items()}
            del self.people[twin.id]

    def _hold(self, person):
        """Someone last seen seated keeps the long hold while near their seat: a lean or a reach is not leaving."""
        near_seat = person.seat is not None and (
            np.hypot(*(person.travel - person.seat)) <= self.seat_leave_share * person.seat_h)
        return self.seat_hold_frames if self._settled(person) or near_seat else self.hold_frames

    def _on_chair(self, track_id, box):
        """A box that matches a chair box is the chair, unless it is someone confirmed, on their track or squarely
        on them: a person sitting behind a chair back, or pulling their chair as they stand, can match it too."""
        person = self.people.get(self.owner.get(track_id))
        if person is not None and person.confirmed:
            return False
        if any(p.confirmed and overlap(box, p.box) >= self.same_person_overlap for p in self.people.values()):
            return False
        return any(iou(box, chair) >= self.chair_iou for _, chair in self.chairs)

    def update(self, tracks, chairs=()):
        """tracks: (track id, box, conf) this frame; chairs: (box, conf) of chairs detected this frame.
        Returns the people to show, as PersonDet."""
        self.frame += 1
        self.chairs = [(f, b) for f, b in self.chairs if self.frame - f <= self.chair_memory]
        self.chairs += [(self.frame, b) for b, conf in chairs if conf >= self.chair_conf]
        self.on_chairs = [t[0] for t in tracks if self._on_chair(t[0], t[1])]
        boxes = defaultdict(list)
        for track_id, box, conf in sorted(tracks, key=lambda t: -t[2]):
            if track_id in self.on_chairs:
                continue
            self.track_peak[track_id] = max(self.track_peak.get(track_id, 0.0), conf)
            person = self._person_of(track_id, box, conf)
            if self.track_peak[track_id] >= self.min_conf:
                boxes[person.id].append((box, conf))
        for person_id, candidates in boxes.items():
            self._see(self.people[person_id], candidates)
        self._note_apart()
        self._merge_onto_held()
        gone = [p.id for p in self.people.values() if self.frame - p.last_frame > self._hold(p)]
        for person_id in gone:
            del self.people[person_id]
        if gone:
            self.owner = {t: p for t, p in self.owner.items() if p in self.people}
            self.track_peak = {t: c for t, c in self.track_peak.items() if t in self.owner}
        for p in self.people.values():
            p.apart &= self.people.keys()
        return [PersonDet(p.id, p.box, p.conf, ground=p.ground, held=p.last_frame < self.frame)
                for p in self.people.values() if p.confirmed]


class YoloRunner:
    """One detection model tracks people + furniture (ByteTrack). A pose model then adds
    17 keypoints to every tracked person: on person crops (pose_mode="crop", best for small /
    distant people), on the whole frame ("frame", faster with few large people) or not at all."""

    def __init__(self, cfg: Config):
        from ultralytics import YOLO
        try:
            import torch
            cuda = torch.cuda.is_available()
        except Exception:
            cuda = False
        self.cfg = cfg
        self.device = cfg.device if cfg.device is not None else (0 if cuda else "cpu")
        self.det = YOLO(cfg.det_model)
        self.pose = YOLO(cfg.pose_model) if cfg.pose_mode != "off" else None
        self.identities = PersonIdentities(cfg.conf, cfg.same_person_overlap, cfg.hold_frames, cfg.box_follow,
                                           cfg.settle_frames, cfg.seat_hold_frames, cfg.held_yield_overlap,
                                           cfg.min_body_share, cfg.floor_creep_px, cfg.chair_iou, cfg.chair_conf,
                                           cfg.chair_memory, cfg.seat_leave_share, cfg.held_replace_iou,
                                           cfg.held_replace_share)
        self.det.add_callback("on_predict_postprocess_end", self._keep_detections)  # runs before the tracker's
        self.detections, self.chairs = [], []
        self.layers = dict(dets=[], tracks=[], shown=[])
        self.n = 0
        self.model_name = os.path.splitext(os.path.basename(cfg.det_model))[0]

    def _pose_crops(self, frame, boxes):
        H, W = frame.shape[:2]
        crops, offs = [], []
        for b in boxes[: self.cfg.pose_max_people]:
            x1, y1, x2, y2 = expand(b, 0.12)
            x1, y1, x2, y2 = int(max(0, x1)), int(max(0, y1)), int(min(W, x2)), int(min(H, y2))
            if x2 - x1 < 8 or y2 - y1 < 16:
                crops.append(None)
                offs.append(None)
                continue
            crops.append(frame[y1:y2, x1:x2])
            offs.append((x1, y1, x2, y2))
        valid = [c for c in crops if c is not None]
        out = [None] * len(boxes)
        if not valid:
            return out
        res = self.pose.predict(valid, conf=0.15, imgsz=self.cfg.pose_imgsz, device=self.device, verbose=False)
        it = iter(res)
        for i, c in enumerate(crops):
            if c is None:
                continue
            r = next(it)
            if r.keypoints is None or r.boxes is None or len(r.boxes) == 0:
                continue
            ox1, oy1, ox2, oy2 = offs[i]
            cw, ch = ox2 - ox1, oy2 - oy1
            bx = r.boxes.xyxy.cpu().numpy()
            cf = r.boxes.conf.cpu().numpy()
            # the person the crop was made for: biggest overlap with the crop centre region
            centre = np.array([cw * 0.12 / 1.24, ch * 0.12 / 1.24, cw * 1.12 / 1.24, ch * 1.12 / 1.24])
            score = [iou(bx[j], centre) * 0.7 + cf[j] * 0.3 for j in range(len(bx))]
            j = int(np.argmax(score))
            if iou(bx[j], centre) < 0.3:
                continue
            kp = r.keypoints.data.cpu().numpy()[j].copy()
            kp[:, 0] += ox1
            kp[:, 1] += oy1
            out[i] = kp
        return out

    def _pose_frame(self, frame, boxes):
        out = [None] * len(boxes)
        r = self.pose.predict(frame, conf=0.2, imgsz=self.cfg.imgsz, device=self.device, verbose=False)[0]
        if r.keypoints is None or r.boxes is None or len(r.boxes) == 0:
            return out
        pb = r.boxes.xyxy.cpu().numpy()
        kps = r.keypoints.data.cpu().numpy()
        for i, b in enumerate(boxes):
            ious = [iou(b, q) for q in pb]
            j = int(np.argmax(ious))
            if ious[j] > 0.4:
                out[i] = kps[j]
        return out

    def _keep_detections(self, predictor):
        boxes = predictor.results[0].boxes
        found = list(zip(boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist()))
        self.detections = [[round(v, 1) for v in box] + [round(conf, 3)] for box, conf, cls in found if cls == 0]
        self.chairs = [(np.array(box, np.float32), conf) for box, conf, cls in found
                       if OBJECT_CLASSES.get(int(cls)) == "chair"]

    def __call__(self, frame):
        cfg = self.cfg
        r = self.det.track(frame, persist=True, tracker=cfg.tracker, conf=cfg.track_conf, iou=cfg.nms_iou,
                           imgsz=cfg.imgsz, classes=[0] + list(OBJECT_CLASSES), device=self.device, verbose=False)[0]
        tracks, objects = [], []
        if r.boxes is not None and r.boxes.id is not None:
            xyxy = r.boxes.xyxy.cpu().numpy()
            ids = r.boxes.id.int().cpu().numpy()
            cf = r.boxes.conf.cpu().numpy()
            cl = r.boxes.cls.int().cpu().numpy()
            for i in range(len(ids)):
                c = int(cl[i])
                if c == 0:
                    tracks.append((int(ids[i]), xyxy[i], float(cf[i])))
                elif c in OBJECT_CLASSES and cf[i] >= cfg.conf:
                    objects.append(ObjDet(int(ids[i]), OBJECT_CLASSES[c], xyxy[i], float(cf[i])))
        persons = self.identities.update(tracks, self.chairs)
        self.layers = dict(
            dets=self.detections,
            tracks=[[t, *(round(float(v), 1) for v in b), round(c, 3)] for t, b, c in tracks],
            on_chairs=self.identities.on_chairs,
            shown=[[p.id, *(round(float(v), 1) for v in p.box), round(p.conf, 3), p.held] for p in persons])
        if self.pose is not None and persons:
            boxes = [p.box for p in persons]
            kps = self._pose_crops(frame, boxes) if cfg.pose_mode == "crop" else self._pose_frame(frame, boxes)
            for p, k in zip(persons, kps):
                p.kpts = k
                p.ground = self.identities.place_feet(p.id, feet_point(k))
        self.n += 1
        return persons, objects


# --------------------------------------------------------------------- simulator
class OfficeSim:
    """Synthetic office seen by a fixed camera: desks, chairs, monitors, laptops, a meeting
    table and a lounge. Agents sit at their desk, stand up, walk to meetings / the lounge /
    a colleague's desk and come back. Produces frames plus 'detections' (with keypoints and
    ground-truth state) in the same format the YOLO runner returns."""

    W, D = 10.0, 7.0

    def __init__(self, n_people=7, size=(1280, 720), fps=25, seed=7, det_noise=True):
        self.rng = random.Random(seed)
        self.nrng = np.random.default_rng(seed)
        self.w, self.h = size
        self.fps = fps
        self.t = 0.0
        self.frame_idx = 0
        self.det_noise = det_noise
        w, h = size
        self.img_pts = [(0.20 * w, 0.30 * h), (0.80 * w, 0.30 * h), (0.99 * w, 0.985 * h), (0.01 * w, 0.985 * h)]
        self.fm = FloorMap(self.img_pts, (self.W, self.D))
        self.zones = {
            "Desk area": [(0, 0), (6.0, 0), (6.0, 7.0), (0, 7.0)],
            "Meeting": [(6.0, 0), (10.0, 0), (10.0, 3.6), (6.0, 3.6)],
            "Lounge": [(6.0, 3.6), (10.0, 3.6), (10.0, 7.0), (6.0, 7.0)],
        }
        self._build_furniture()
        self._build_agents(min(n_people, len(self.desk_seats)))
        self.bg = self._background()

    # ---- config for the analytics side
    def config(self, base: Config | None = None):
        cfg = base or Config()
        cfg.floor_img_pts = self.img_pts
        cfg.floor_size_m = (self.W, self.D)
        cfg.zones = self.zones
        cfg.title = "Room Analytics"
        return cfg

    # ---- projection
    def P(self, pts3):
        pts3 = np.asarray(pts3, np.float32).reshape(-1, 3)
        img = self.fm.to_img(pts3[:, :2])
        k = np.array([self.fm.px_per_m(x, y) for x, y in pts3[:, :2]], np.float32)
        img[:, 1] -= pts3[:, 2] * k * 0.95
        return img

    # ---- scene
    def _build_furniture(self):
        self.tables, self.seats, self.monitors, self.laptops = [], [], [], []
        oid = iter(range(1, 999))
        for x0, x1 in ((2.0, 2.7), (4.3, 5.0)):
            for y0, y1 in ((0.9, 2.1), (2.8, 4.0), (4.7, 5.9)):
                self.tables.append(dict(id=next(oid), x0=x0, x1=x1, y0=y0, y1=y1, z=0.74))
                yc = (y0 + y1) / 2
                for side in (-1, 1):
                    cx = x0 - 0.42 if side < 0 else x1 + 0.42
                    face = np.array([1.0, 0.0]) if side < 0 else np.array([-1.0, 0.0])
                    seat = dict(id=next(oid), pos=np.array([cx, yc]), face=face, kind="desk",
                                taken=None)
                    self.seats.append(seat)
                    mx = x0 + 0.16 if side < 0 else x1 - 0.16
                    if len(self.seats) % 3 == 0:
                        lx = x0 + 0.24 if side < 0 else x1 - 0.24
                        self.laptops.append(dict(id=next(oid), x=lx, y=yc, face=face))
                    else:
                        self.monitors.append(dict(id=next(oid), x=mx, y=yc, span="y", w=0.55, z0=0.80, z1=1.16))
        self.desk_seats = [s for s in self.seats if s["kind"] == "desk"]
        # meeting room
        self.tables.append(dict(id=next(oid), x0=7.2, x1=8.8, y0=1.1, y1=2.7, z=0.74))
        for sx, face in ((6.78, (1.0, 0.0)), (9.22, (-1.0, 0.0))):
            for sy in (1.5, 2.3):
                self.seats.append(dict(id=next(oid), pos=np.array([sx, sy]), face=np.array(face), kind="meet",
                                       taken=None))
        self.laptops.append(dict(id=next(oid), x=7.45, y=1.5, face=np.array([1.0, 0.0])))
        self.laptops.append(dict(id=next(oid), x=8.55, y=2.3, face=np.array([-1.0, 0.0])))
        self.monitors.append(dict(id=next(oid), x=8.0, y=0.08, span="x", w=1.3, z0=1.15, z1=1.85))  # wall screen
        # lounge: high standing table
        self.tables.append(dict(id=next(oid), x0=7.7, x1=8.4, y0=4.9, y1=5.6, z=1.05))

    def _build_agents(self, n):
        shirts = [(180, 120, 60), (60, 60, 180), (70, 150, 70), (40, 140, 200), (150, 80, 150),
                  (120, 120, 120), (200, 170, 90), (90, 60, 40), (60, 170, 170), (30, 90, 160),
                  (170, 170, 60), (100, 50, 120)]
        seats = self.rng.sample(self.desk_seats, n)
        self.agents = []
        for i, seat in enumerate(seats):
            seat["taken"] = i + 1
            a = dict(id=i + 1, home=seat, pos=seat["pos"].copy(), face=seat["face"].copy(), state="sitting",
                     queue=[], timer=self.rng.uniform(3, 25), seat=seat, phase=0.0,
                     speed=self.rng.uniform(0.9, 1.35), shirt=shirts[i % len(shirts)],
                     pants=(60, 45, 35) if i % 2 else (45, 40, 40), hs=self.rng.uniform(0.94, 1.06),
                     skin=(120, 160, 200) if i % 3 else (90, 130, 175))
            a["queue"] = [("sit", seat, a["timer"])]
            self.agents.append(a)
        for a in self.rng.sample(self.agents, max(1, n // 3)):
            a["queue"] = [("sit", a["seat"], self.rng.uniform(0.3, 1.0))]

    @staticmethod
    def _approach(seat):
        return seat["pos"] - seat["face"] * 0.42

    def _path(self, a_pt, b_pt, a_seat=None, b_seat=None):
        aisle_y = 6.5
        pts = []
        if a_seat is not None:
            pts.append(self._approach(a_seat))
        start = pts[-1] if pts else a_pt
        end_app = self._approach(b_seat) if b_seat is not None else b_pt
        pts.append(np.array([start[0], aisle_y]))
        if end_app[0] > 6.0 and start[0] < 6.0:
            pts.append(np.array([6.3, aisle_y]))
        pts.append(np.array([end_app[0], aisle_y]))
        pts.append(end_app)
        if b_seat is not None:
            pts.append(b_seat["pos"].copy())
        out = []
        for p in pts:
            if not out or np.linalg.norm(out[-1] - p) > 0.05:
                out.append(np.array(p, float))
        return out

    def _plan(self, a):
        r = self.rng.random()
        home = a["home"]
        q = [("stand", self.rng.uniform(1.0, 2.2))]
        free_meet = [s for s in self.seats if s["kind"] == "meet" and s["taken"] is None]
        if r < 0.4 and free_meet:
            ms = self.rng.choice(free_meet)
            ms["taken"] = a["id"]
            q += [("walk", p) for p in self._path(a["pos"], ms["pos"], home, ms)]
            q += [("sit", ms, self.rng.uniform(6, 14)), ("stand", self.rng.uniform(0.8, 1.6)),
                  ("release", ms)]
            back_from = ms
        elif r < 0.75:
            dest = np.array([self.rng.uniform(6.6, 9.6), self.rng.uniform(4.2, 6.8)])
            q += [("walk", p) for p in self._path(a["pos"], dest, home, None)]
            q += [("stand", self.rng.uniform(3, 8))]
            back_from = None
            a["_from_pt"] = dest
        else:
            other = self.rng.choice([s for s in self.desk_seats if s is not home])
            dest = self._approach(other) - other["face"] * 0.25
            q += [("walk", p) for p in self._path(a["pos"], dest, home, None)]
            q += [("face", other["pos"]), ("stand", self.rng.uniform(3, 7))]
            back_from = None
            a["_from_pt"] = dest
        q += [("walk_back", back_from)]
        q += [("sit", home, self.rng.uniform(14, 35))]
        a["queue"] = q

    def _step_agent(self, a, dt):
        if a.get("action") is None:
            if not a["queue"]:
                self._plan(a)
            act = a["queue"].pop(0)
            kind = act[0]
            if kind == "sit":
                a["seat"] = act[1]
                a["pos"] = act[1]["pos"].copy()
                a["face"] = act[1]["face"].copy()
                a["state"] = "sitting"
                a["action"] = ("wait", act[2])
            elif kind == "stand":
                a["state"] = "standing"
                a["action"] = ("wait", act[1])
            elif kind == "walk":
                a["action"] = ("walk", act[1])
            elif kind == "face":
                d = act[1] - a["pos"]
                a["face"] = d / (np.linalg.norm(d) + 1e-6)
                return
            elif kind == "release":
                act[1]["taken"] = None
                return
            elif kind == "walk_back":
                src_seat = act[1]
                path = self._path(a["pos"], a["home"]["pos"], src_seat, a["home"])
                a["queue"] = [("walk", p) for p in path] + a["queue"]
                return
        kind, arg = a["action"]
        if kind == "wait":
            a["phase"] = 0.0
            remaining = arg - dt
            a["action"] = ("wait", remaining) if remaining > 0 else None
            if a["state"] == "standing":
                a["pos"] = a["pos"] + self.nrng.normal(0, 0.004, 2)
        else:
            a["state"] = "walking"
            a["seat"] = None
            d = arg - a["pos"]
            dist = float(np.linalg.norm(d))
            step = a["speed"] * dt
            if dist > 1e-6:
                a["face"] = 0.7 * a["face"] + 0.3 * d / dist
                a["face"] /= np.linalg.norm(a["face"]) + 1e-6
            if dist <= step:
                a["pos"] = np.array(arg, float)
                a["action"] = None
            else:
                a["pos"] = a["pos"] + d / dist * step
            a["phase"] += step * 2 * math.pi / 1.3

    def _joints(self, a):
        x, y = a["pos"]
        f = np.array([a["face"][0], a["face"][1], 0.0])
        pp = np.array([-a["face"][1], a["face"][0], 0.0])
        base = np.array([x, y, 0.0])
        hs = a["hs"]
        Z = lambda z: np.array([0, 0, z * hs])
        J = {}
        if a["state"] == "sitting":
            for side, sgn in (("l", 1), ("r", -1)):
                hip = base + pp * 0.11 * sgn + Z(0.50)
                knee = hip + f * 0.45 + Z(0.02)
                ank = knee + f * 0.06 - Z(0.44)
                sh = base - f * 0.06 + pp * 0.19 * sgn + Z(1.02)
                el = sh + f * 0.12 - Z(0.26) + pp * 0.03 * sgn
                wr = el + f * 0.28 + Z(0.02)
                J.update({f"{side}_hip": hip, f"{side}_knee": knee, f"{side}_ank": ank,
                          f"{side}_sh": sh, f"{side}_el": el, f"{side}_wr": wr})
            head = base - f * 0.04 + Z(1.22)
        else:
            swing = 0.30 * math.sin(a["phase"]) if a["state"] == "walking" else 0.0
            for side, sgn, sw in (("l", 1, swing), ("r", -1, -swing)):
                hip = base + pp * 0.11 * sgn + Z(0.95)
                knee = base + pp * 0.10 * sgn + f * sw * 0.55 + Z(0.50 + 0.04 * abs(sw))
                ank = base + pp * 0.10 * sgn + f * sw + Z(0.08 + 0.1 * max(0, sw))
                sh = base + pp * 0.19 * sgn + Z(1.45)
                el = sh + pp * 0.04 * sgn - f * sw * 0.5 - Z(0.29)
                wr = el - f * sw * 0.5 - Z(0.27)
                J.update({f"{side}_hip": hip, f"{side}_knee": knee, f"{side}_ank": ank,
                          f"{side}_sh": sh, f"{side}_el": el, f"{side}_wr": wr})
            head = base + Z(1.62)
        J["head"] = head
        J["nose"] = head + f * 0.1 - Z(0.02)
        J["l_eye"] = head + f * 0.08 + pp * 0.035 + Z(0.02)
        J["r_eye"] = head + f * 0.08 - pp * 0.035 + Z(0.02)
        J["l_ear"] = head + pp * 0.08
        J["r_ear"] = head - pp * 0.08
        return J

    COCO = ["nose", "l_eye", "r_eye", "l_ear", "r_ear", "l_sh", "r_sh", "l_el", "r_el", "l_wr", "r_wr",
            "l_hip", "r_hip", "l_knee", "r_knee", "l_ank", "r_ank"]

    def _background(self):
        w, h = self.w, self.h
        img = np.zeros((h, w, 3), np.uint8)
        far_y = int(self.img_pts[0][1])
        for yy in range(h):
            if yy < far_y:
                v = 150 + 35 * yy / max(1, far_y)
                img[yy] = (v - 8, v - 2, v + 2)
            else:
                img[yy] = (66, 70, 74)
        fl = np.int32(self.fm.to_img([(0, 0), (self.W, 0), (self.W, self.D), (0, self.D)]))
        cv2.fillPoly(img, [fl], (92, 98, 104))
        carpet = np.int32(self.fm.to_img([(6.0, 0), (10, 0), (10, 3.6), (6.0, 3.6)]))
        cv2.fillPoly(img, [carpet], (110, 92, 78))
        for gx in np.arange(0, self.W + 0.01, 0.5):
            a, b = self.fm.to_img([(gx, 0), (gx, self.D)])
            cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (102, 108, 114), 1, cv2.LINE_AA)
        for gy in np.arange(0, self.D + 0.01, 0.5):
            a, b = self.fm.to_img([(0, gy), (self.W, gy)])
            cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (102, 108, 114), 1, cv2.LINE_AA)
        cv2.line(img, (0, far_y), (w, far_y), (70, 75, 80), 3)
        # side walls
        cv2.line(img, tuple(np.int32(fl[0])), (0, h), (120, 125, 130), 2)
        cv2.line(img, tuple(np.int32(fl[1])), (w, h), (120, 125, 130), 2)
        # windows on the back wall
        for wx in (1.0, 3.2, 5.4):
            q = np.int32(self.P([(wx, 0.0, 1.0), (wx + 1.4, 0.0, 1.0), (wx + 1.4, 0.0, 2.3), (wx, 0.0, 2.3)]))
            cv2.fillPoly(img, [q], (215, 200, 170))
            cv2.polylines(img, [q], True, (90, 90, 90), 2)
        return img

    def _quad(self, img, pts3, fill, edge=(30, 30, 30)):
        q = np.int32(self.P(pts3))
        cv2.fillPoly(img, [q], fill, cv2.LINE_AA)
        cv2.polylines(img, [q], True, edge, 1, cv2.LINE_AA)
        return q

    def _draw_table(self, img, t):
        x0, x1, y0, y1, z = t["x0"], t["x1"], t["y0"], t["y1"], t["z"]
        allp = []
        for lx, ly in ((x0 + 0.05, y0 + 0.05), (x1 - 0.05, y0 + 0.05), (x1 - 0.05, y1 - 0.05), (x0 + 0.05, y1 - 0.05)):
            a, b = self.P([(lx, ly, 0), (lx, ly, z)])
            cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (40, 50, 60), max(2, int(self.h / 300)), cv2.LINE_AA)
            allp += [a, b]
        self._quad(img, [(x0, y1, z), (x1, y1, z), (x1, y1, z - 0.05), (x0, y1, z - 0.05)], (60, 90, 120))
        q = self._quad(img, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], (95, 140, 180))
        allp += list(q)
        return np.float32(allp)

    def _draw_chair(self, img, s, occupied):
        x, y = s["pos"]
        fx, fy = s["face"]
        px, py = -fy, fx
        r = 0.22
        corners = [(x + dx * r * fx + dy * r * px, y + dx * r * fy + dy * r * py) for dx, dy in
                   ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        allp = []
        for cx, cy in corners:
            a, b = self.P([(cx, cy, 0.0), (cx, cy, 0.45)])
            cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (35, 35, 35), max(1, int(self.h / 400)), cv2.LINE_AA)
            allp += [a, b]
        allp += list(self._quad(img, [(cx, cy, 0.45) for cx, cy in corners], (70, 70, 80)))
        bx = [corners[0], corners[3]]
        back = [(bx[0][0], bx[0][1], 0.5), (bx[1][0], bx[1][1], 0.5), (bx[1][0], bx[1][1], 0.95), (bx[0][0], bx[0][1], 0.95)]
        allp += list(self._quad(img, back, (55, 55, 65)))
        return np.float32(allp)

    def _draw_monitor(self, img, m):
        x, y, hw = m["x"], m["y"], m["w"] / 2
        if m["span"] == "y":
            pts = [(x, y - hw, m["z0"]), (x, y + hw, m["z0"]), (x, y + hw, m["z1"]), (x, y - hw, m["z1"])]
            stand = [(x, y, 0.74), (x, y, m["z0"])]
        else:
            pts = [(x - hw, y, m["z0"]), (x + hw, y, m["z0"]), (x + hw, y, m["z1"]), (x - hw, y, m["z1"])]
            stand = None
        if stand:
            a, b = self.P(stand)
            cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (30, 30, 30), 2)
        q = self._quad(img, pts, (25, 25, 25))
        inner = q.mean(0) + (q - q.mean(0)) * 0.85
        cv2.fillPoly(img, [np.int32(inner)], (150, 110, 60) if m["span"] == "y" else (170, 120, 70), cv2.LINE_AA)
        return np.float32(q)

    def _draw_laptop(self, img, l):
        x, y = l["x"], l["y"]
        fx, fy = l["face"]
        px, py = -fy, fx
        base = [(x + a * 0.12 * fx + b * 0.17 * px, y + a * 0.12 * fy + b * 0.17 * py, 0.76) for a, b in
                ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        q1 = self._quad(img, base, (170, 170, 175))
        bxp = [base[0], base[3]]
        scr = [(bxp[0][0], bxp[0][1], 0.76), (bxp[1][0], bxp[1][1], 0.76), (bxp[1][0], bxp[1][1], 0.98),
               (bxp[0][0], bxp[0][1], 0.98)]
        q2 = self._quad(img, scr, (60, 60, 65))
        return np.float32(list(q1) + list(q2))

    def _draw_person(self, img, a, J):
        names = list(J)
        P2 = dict(zip(names, self.P([J[n] for n in names])))
        k = self.fm.px_per_m(*a["pos"])
        lw = max(2, int(0.12 * k))
        aw = max(2, int(0.07 * k))
        ip = lambda n: tuple(np.int32(P2[n]))
        for side in ("r", "l"):
            cv2.line(img, ip(f"{side}_hip"), ip(f"{side}_knee"), a["pants"], lw, cv2.LINE_AA)
            cv2.line(img, ip(f"{side}_knee"), ip(f"{side}_ank"), a["pants"], lw, cv2.LINE_AA)
            cv2.circle(img, ip(f"{side}_ank"), max(2, lw // 2), (25, 25, 25), -1, cv2.LINE_AA)
        torso = np.int32([P2["l_sh"], P2["r_sh"], P2["r_hip"], P2["l_hip"]])
        cv2.fillPoly(img, [cv2.convexHull(torso)], a["shirt"], cv2.LINE_AA)
        dark = tuple(int(c * 0.75) for c in a["shirt"])
        for side in ("r", "l"):
            cv2.line(img, ip(f"{side}_sh"), ip(f"{side}_el"), dark, aw, cv2.LINE_AA)
            cv2.line(img, ip(f"{side}_el"), ip(f"{side}_wr"), a["skin"], max(2, aw - 1), cv2.LINE_AA)
        hr = max(3, int(0.11 * k))
        cv2.circle(img, ip("head"), hr, a["skin"], -1, cv2.LINE_AA)
        cv2.ellipse(img, ip("head"), (hr, hr), 0, 180, 360, (30, 35, 45), -1, cv2.LINE_AA)
        pts = np.float32([P2[n] for n in names])
        x1, y1 = pts.min(0) - [lw, hr]
        x2, y2 = pts.max(0) + [lw, lw]
        kp = np.zeros((17, 3), np.float32)
        for i, n in enumerate(self.COCO):
            kp[i, :2] = P2[n]
            kp[i, 2] = self.rng.uniform(0.8, 0.98)
        return np.array([x1, y1, x2, y2], np.float32), kp

    def step(self):
        dt = 1.0 / self.fps
        for a in self.agents:
            self._step_agent(a, dt)
        img = self.bg.copy()
        occupied = {a["seat"]["id"] for a in self.agents if a["state"] == "sitting" and a["seat"] is not None}
        draw = []
        for t in self.tables:
            draw.append((t["y1"] - 0.3, 1, "table", t))
        for s in self.seats:
            draw.append((s["pos"][1] - 0.02, 0, "chair", s))
        for m in self.monitors:
            draw.append((m["y"] + (0.0 if m["span"] == "y" else -5), 2, "monitor", m))
        for l in self.laptops:
            draw.append((l["y"] + 0.001, 2, "laptop", l))
        for a in self.agents:
            draw.append((a["pos"][1] + (0.01 if a["state"] == "sitting" else 0.0), 3, "person", a))
        draw.sort(key=lambda d: (d[0], d[1]))
        persons, objects = [], []
        noise = (lambda b, s: b + self.nrng.normal(0, s, 4).astype(np.float32)) if self.det_noise else (lambda b, s: b)
        for _, _, kind, o in draw:
            if kind == "person":
                box, kp = self._draw_person(img, o, self._joints(o))
                hgt = box[3] - box[1]
                kp[:, :2] += self.nrng.normal(0, 0.012 * hgt, (17, 2))
                persons.append(PersonDet(o["id"], noise(box, 0.01 * hgt), self.rng.uniform(0.86, 0.97), kp,
                                         gt_state=o["state"]))
            else:
                pts = {"table": self._draw_table, "monitor": self._draw_monitor,
                       "laptop": self._draw_laptop}.get(kind)
                pts = self._draw_chair(img, o, o["id"] in occupied) if kind == "chair" else pts(img, o)
                box = np.array([*pts.min(0), *pts.max(0)], np.float32)
                drop = 0.35 if (kind == "chair" and o["id"] in occupied) else 0.04
                if self.rng.random() > drop:
                    objects.append(ObjDet(o["id"], kind, noise(box, 0.8), self.rng.uniform(0.78, 0.95)))
        img = cv2.GaussianBlur(img, (3, 3), 0)
        t = self.t
        self.t += dt
        self.frame_idx += 1
        return img, persons, objects, t


# --------------------------------------------------------------------- video IO
class VideoOut:
    def __init__(self, path, fps):
        self.path, self.fps = path, fps
        self.tmp = os.path.splitext(path)[0] + "_raw.mp4"
        self.vw = None

    def write(self, img):
        if self.vw is None:
            h, w = img.shape[:2]
            self.vw = cv2.VideoWriter(self.tmp, cv2.VideoWriter_fourcc(*"mp4v"), self.fps, (w, h))
        self.vw.write(img)

    def close(self, h264=True):
        if self.vw is None:
            return None
        self.vw.release()
        if h264 and shutil.which("ffmpeg"):
            r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", self.tmp, "-c:v", "libx264",
                                "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                                "-movflags", "+faststart", self.path])
            if r.returncode == 0:
                os.remove(self.tmp)
                return self.path
        os.replace(self.tmp, self.path)
        return self.path


def _finish(analytics, out, out_path, csv_path, verbose=True):
    path = out.close()
    if csv_path:
        analytics.write_csv(csv_path)
    summ = analytics.summary()
    if verbose:
        print(json.dumps(summ, indent=2))
        if path:
            print("video ->", path)
        if csv_path:
            print("tracks ->", csv_path)
    return summ


# --------------------------------------------------------------------- runners
def run_video(source, out_path="result.mp4", cfg: Config | None = None, max_frames=None, show=False,
              csv_path="tracks.csv", save_frame=None):
    cfg = cfg or Config()
    src = int(source) if str(source).isdigit() else source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        raise SystemExit(f"cannot open source: {source}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if fps < 1 or fps > 240:
        fps = 30.0
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    runner = YoloRunner(cfg)
    an = Analytics(cfg, fps, (w, h))
    rd = Renderer(cfg, (w, h))
    out = VideoOut(out_path, fps) if out_path else None
    info = dict(model=f"YOLOv8 ({runner.model_name})", fps=0.0)
    i, fps_ema, t_start = 0, 0.0, time.time()
    while True:
        ok, frame = cap.read()
        if not ok or (max_frames and i >= max_frames):
            break
        t0 = time.time()
        persons, objects = runner(frame)
        snap = an.update(persons, objects, i / fps, i)
        dtp = time.time() - t0
        fps_ema = (1 / max(dtp, 1e-6)) if fps_ema == 0 else 0.9 * fps_ema + 0.1 / max(dtp, 1e-6)
        info["fps"] = fps_ema
        img = rd.render(frame, snap, info)
        if out:
            out.write(img)
        if save_frame and i in save_frame:
            cv2.imwrite(save_frame[i], img)
        if show:
            cv2.imshow("Room Analytics", img)
            if cv2.waitKey(1) & 0xFF in (27, ord("q")):
                break
        i += 1
        if i % 50 == 0:
            el = time.time() - t_start
            print(f"frame {i}/{total or '?'}  {i / el:.1f} fps  people={len(snap['people'])}", flush=True)
    cap.release()
    if show:
        cv2.destroyAllWindows()
    return _finish(an, out or VideoOut(os.devnull, fps), out_path, csv_path)


def run_simulation(out_path="sim.mp4", seconds=30, n_people=7, size=(1280, 720), fps=25, seed=7,
                   csv_path="sim_tracks.csv", save_frame=None, cfg: Config | None = None):
    sim = OfficeSim(n_people, size, fps, seed)
    cfg = sim.config(cfg)
    an = Analytics(cfg, fps, size)
    rd = Renderer(cfg, size)
    out = VideoOut(out_path, fps)
    info = dict(model="Simulator", subtitle="Synthetic office scene - same analytics pipeline", fps=0.0,
                badge="SIM")
    n = int(seconds * fps)
    fps_ema = 0.0
    for i in range(n):
        frame, persons, objects, t = sim.step()
        t0 = time.time()
        snap = an.update(persons, objects, t, i)
        img = rd.render(frame, snap, info)
        dtp = time.time() - t0
        fps_ema = (1 / max(dtp, 1e-6)) if fps_ema == 0 else 0.9 * fps_ema + 0.1 / max(dtp, 1e-6)
        info["fps"] = fps_ema
        out.write(img)
        if save_frame and i in save_frame:
            cv2.imwrite(save_frame[i], img)
        if (i + 1) % 100 == 0:
            print(f"sim frame {i + 1}/{n}", flush=True)
    return _finish(an, out, out_path, csv_path)


def calibration_preview(source, out_png="calibration.png", cfg: Config | None = None):
    """Draw the floor rectangle + a 1 m grid on the first frame, with a pixel ruler,
    so you can pick the 4 floor points for Config.floor_img_pts."""
    cfg = cfg or Config()
    src = int(source) if str(source).isdigit() else source
    cap = cv2.VideoCapture(src)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("cannot read a frame")
    h, w = frame.shape[:2]
    pts = cfg.floor_img_pts or default_floor_pts(w, h)
    fm = FloorMap(pts, cfg.floor_size_m)
    img = frame.copy()
    W, D = cfg.floor_size_m
    for gx in range(0, int(W) + 1):
        a, b = fm.to_img([(gx, 0), (gx, D)])
        cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (0, 255, 255), 1, cv2.LINE_AA)
    for gy in range(0, int(D) + 1):
        a, b = fm.to_img([(0, gy), (W, gy)])
        cv2.line(img, tuple(np.int32(a)), tuple(np.int32(b)), (0, 255, 255), 1, cv2.LINE_AA)
    for i, (p, lab) in enumerate(zip(pts, ["1 far-left (0,0)", f"2 far-right ({W:g},0)",
                                          f"3 near-right ({W:g},{D:g})", f"4 near-left (0,{D:g})"])):
        cv2.circle(img, (int(p[0]), int(p[1])), 7, (0, 0, 255), -1)
        txt(img, lab, (min(int(p[0]) + 10, w - 200), max(20, int(p[1]) - 10)), 0.55, (0, 0, 255), 2)
    step = 100
    for x in range(0, w, step):
        cv2.line(img, (x, 0), (x, 12), WHITE, 1)
        txt(img, str(x), (x + 2, 26), 0.4, WHITE, 1)
    for y in range(0, h, step):
        cv2.line(img, (0, y), (12, y), WHITE, 1)
        txt(img, str(y), (14, y + 4), 0.4, WHITE, 1)
    cv2.imwrite(out_png, img)
    return out_png


# --------------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description="YOLOv8 real-time room analytics")
    ap.add_argument("--source", help="video path, URL or webcam index (0)")
    ap.add_argument("--out", default="result.mp4")
    ap.add_argument("--csv", default="tracks.csv")
    ap.add_argument("--simulate", action="store_true", help="run the synthetic office simulator")
    ap.add_argument("--seconds", type=float, default=30)
    ap.add_argument("--people", type=int, default=7)
    ap.add_argument("--max-frames", type=int)
    ap.add_argument("--show", action="store_true", help="show a live window (local machine)")
    ap.add_argument("--calibrate", metavar="PNG", help="write a floor-calibration preview and exit")
    ap.add_argument("--det-model", default="yolov8s.pt")
    ap.add_argument("--pose-model", default="yolov8s-pose.pt")
    ap.add_argument("--imgsz", type=int, default=960)
    ap.add_argument("--conf", type=float, default=0.30)
    ap.add_argument("--pose-mode", default="crop", choices=["crop", "frame", "off"])
    ap.add_argument("--floor-pts", help='JSON: [[x,y],[x,y],[x,y],[x,y]] far-left, far-right, near-right, near-left')
    ap.add_argument("--floor-size", help="W,D in metres, e.g. 8,6")
    ap.add_argument("--zones", help='JSON: {"Desk": [[0,0],[4,0],[4,6],[0,6]], ...} in metres')
    a = ap.parse_args()
    cfg = Config(det_model=a.det_model, pose_model=a.pose_model, imgsz=a.imgsz, conf=a.conf,
                 pose_mode=a.pose_mode)
    if a.floor_pts:
        cfg.floor_img_pts = json.loads(a.floor_pts)
    if a.floor_size:
        cfg.floor_size_m = tuple(float(v) for v in a.floor_size.split(","))
    if a.zones:
        cfg.zones = json.loads(a.zones)
    if a.simulate:
        run_simulation(a.out, a.seconds, a.people, csv_path=a.csv)
    elif a.source is None:
        ap.error("--source or --simulate is required")
    elif a.calibrate:
        print(calibration_preview(a.source, a.calibrate, cfg))
    else:
        run_video(a.source, a.out if a.out != "none" else None, cfg, a.max_frames, a.show, a.csv)


if __name__ == "__main__":
    main()
