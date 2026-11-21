"""Office wellness alerts for each tracked person: posture, screen distance, sitting time, fatigue and falls.

Runs after YoloRunner (+ face_id) on every analysed frame. Inputs per person: the YOLO pose keypoints and
box, the sitting/standing state from Analytics, and — when a face engine is there — face landmarks measured
on the top of the person box. Durations use the source's time `t`, so a paused or slow video does not
count as minutes passing; the times stored for the history use the wall clock.

An alert is an episode: it starts when a condition holds long enough, carries the worst values seen, and
ends when the condition clears or the person leaves. Falls and yawning are moments: they end as they start
but stay on the live panel for a while. Every start and end goes to `sink` (app.alerts.AlertStore), and so
does a presence record per person, so the history and the daily report can be built from disk.

Nothing here imports the web app.
"""
from __future__ import annotations

import math
import time
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field, fields

import numpy as np

import face_id

CATEGORIES = ("posture", "distance", "break", "fatigue", "fall")
CATEGORY_TEXT = {"posture": "ท่านั่ง", "distance": "ระยะจอ", "break": "เวลานั่ง", "fatigue": "ความล้า",
                 "fall": "การล้ม"}
TYPE_TEXT = {
    "neck": "ก้มคอ/ยื่นคอ",
    "hunch": "หลังค่อม/โน้มตัว",
    "lean": "นั่งเอียงข้าง",
    "close": "นั่งใกล้จอเกินไป",
    "sit_long": "นั่งต่อเนื่องนานไม่ลุก",
    "eyes_closed": "หลับตานาน/ง่วง",
    "yawn": "หาวบ่อย",
    "fall": "ตรวจพบการหกล้ม/ตกจากเก้าอี้",
    "fall_vanish": "สงสัยหกล้ม: ร่วงแล้วหายจากภาพ",
}
TYPE_CATEGORY = {"neck": "posture", "hunch": "posture", "lean": "posture", "close": "distance",
                 "sit_long": "break", "eyes_closed": "fatigue", "yawn": "fatigue", "fall": "fall",
                 "fall_vanish": "fall"}
MOMENTS = {"fall", "fall_vanish", "yawn"}  # no duration: they end as they start

# COCO keypoints from the YOLO pose model
NOSE, L_EAR, R_EAR, L_SHO, R_SHO, L_HIP, R_HIP = 0, 3, 4, 5, 6, 11, 12
# insightface 2d106: the two eye outlines and the mouth
EYE_A, EYE_B, MOUTH = list(range(33, 43)), list(range(87, 97)), list(range(52, 72))


@dataclass
class WellnessSettings:
    posture_on: bool = True
    distance_on: bool = True
    break_on: bool = True
    fatigue_on: bool = True
    fall_on: bool = True
    # posture: judged while sitting
    posture_seconds: float = 30.0     # bad posture this long (most of the time) starts an alert
    neck_angle: float = 30.0          # side view: ear this many degrees forward of straight above the shoulder
    head_drop: float = 0.25           # front view: nose above the shoulders by less than this share of their width
    torso_angle: float = 20.0         # side view: shoulders this many degrees forward of straight above the hips
    shoulder_tilt: float = 10.0       # front view: shoulder line this many degrees off level
    side_lean: float = 15.0           # front view: shoulders this many degrees sideways of the hips
    # screen distance: from face size against the person's own usual size
    distance_ratio: float = 1.25      # face this much bigger than usual = closer to the screen
    distance_seconds: float = 30.0
    distance_learn_seconds: float = 120.0  # seated time used to learn the usual face size
    # sitting time
    sit_minutes: float = 45.0
    break_seconds: float = 60.0       # standing or away this long counts as a break and resets the clock
    # fatigue: from face landmarks
    eye_ratio: float = 0.6            # eyes open less than this share of the person's usual = closed
    eye_closed_seconds: float = 2.0
    yawn_ratio: float = 0.7           # mouth height / width
    yawn_seconds: float = 1.5
    yawn_count: int = 3
    yawn_window_minutes: float = 10.0
    # falls
    fall_drop: float = 0.30           # body centre falls this share of the body height...
    fall_window: float = 1.0          # ...within this many seconds
    fall_angle: float = 60.0          # and the torso ends this far from upright (or the box is wider than tall)
    vanish_drop: float = 0.35         # a drop this big in 0.6 s, then gone from view within 1.5 s
    # face measurements
    min_face_px: int = 60             # narrower faces are too small to read eyes, mouth or size from
    measure_hz: float = 8.0
    max_faces_per_frame: int = 4
    moment_show_seconds: float = 120.0  # a fall stays on the live panel this long at most...
    recovered_seconds: float = 3.0      # ...or until the person has been upright again this long

    @classmethod
    def from_dict(cls, data: dict | None) -> "WellnessSettings":
        names = {f.name: f.type for f in fields(cls)}
        clean = {}
        for k, v in (data or {}).items():
            if k in names:
                clean[k] = bool(v) if names[k] in ("bool", bool) else (int(v) if names[k] in ("int", int) else float(v))
        return cls(**clean)

    def to_dict(self) -> dict:
        return asdict(self)

    def on(self, category: str) -> bool:
        return getattr(self, f"{category}_on")


@dataclass
class Alert:
    id: str
    category: str
    type: str
    person: int
    name: str | None
    camera: str
    session: str
    start_t: float
    started_at: float          # wall clock, epoch seconds
    text: str
    worst: dict = field(default_factory=dict)
    end_t: float | None = None
    ended_at: float | None = None
    show_until: float = 0.0    # source time; moments stay on the live panel until then

    def record(self) -> dict:
        return dict(kind="alert", id=self.id, session=self.session, camera=self.camera, person=self.person,
                    name=self.name, category=self.category, type=self.type, text=self.text,
                    started_at=round(self.started_at, 3),
                    ended_at=None if self.ended_at is None else round(self.ended_at, 3),
                    seconds=None if self.end_t is None else round(self.end_t - self.start_t, 1),
                    worst={k: round(v, 3) if isinstance(v, float) else v for k, v in self.worst.items()})


class Sustained:
    """A yes/no condition sampled now and then. On once it held for most of `on_seconds`,
    off once it was mostly false for `off_seconds`."""

    def __init__(self, on_frac=0.7, off_seconds=10.0, off_frac=0.3):
        self.samples: deque = deque()
        self.on_frac, self.off_seconds, self.off_frac = on_frac, off_seconds, off_frac

    def add(self, t, value: bool, keep: float):
        self.samples.append((t, value))
        while self.samples and t - self.samples[0][0] > keep:
            self.samples.popleft()

    def _frac(self, t, seconds):
        window = [v for ts, v in self.samples if t - ts <= seconds]
        if not window:
            return None, 0.0
        first = next(ts for ts, _ in self.samples if t - ts <= seconds)
        return sum(window) / len(window), t - first

    def should_start(self, t, on_seconds) -> bool:
        frac, span = self._frac(t, on_seconds)
        return frac is not None and span >= 0.8 * on_seconds and frac >= self.on_frac

    def should_end(self, t) -> bool:
        frac, span = self._frac(t, self.off_seconds)
        return frac is not None and span >= 0.5 * self.off_seconds and frac < self.off_frac

    def clear(self):
        self.samples.clear()


# --------------------------------------------------------------------- measurements
def _pt(kpts, i, min_conf=0.3):
    if kpts is None or kpts[i, 2] < min_conf:
        return None
    return kpts[i, :2].astype(np.float64)


def _from_vertical(v) -> float:
    """Degrees between vector v (image coordinates, y down) and straight up."""
    return math.degrees(math.atan2(abs(v[0]), max(-v[1], 1e-6)))


def posture_metrics(kpts, box) -> dict:
    """Angles from the pose keypoints. Front view (both shoulders wide apart) and side view see different
    things: the side shows a forward head and a hunched back, the front shows a bowed head and leaning."""
    ls, rs = _pt(kpts, L_SHO), _pt(kpts, R_SHO)
    if ls is None and rs is None:
        return {}
    bw = float(box[2] - box[0]) or 1.0
    sh = np.mean([p for p in (ls, rs) if p is not None], axis=0)
    sw = abs(ls[0] - rs[0]) if ls is not None and rs is not None else 0.0
    frontal = sw >= 0.35 * bw
    m = dict(frontal=frontal)
    hips = [p for p in (_pt(kpts, L_HIP), _pt(kpts, R_HIP)) if p is not None]
    if hips:
        m["torso"] = float(_from_vertical(sh - np.mean(hips, axis=0)))
    if frontal:
        m["tilt"] = math.degrees(math.atan2(abs(ls[1] - rs[1]), abs(ls[0] - rs[0])))
        nose = _pt(kpts, NOSE)
        if nose is not None:
            m["head_drop"] = float((sh[1] - nose[1]) / sw)
    else:
        sides = [(kpts[ear, 2], _pt(kpts, ear), shoulder)
                 for ear, shoulder in ((L_EAR, ls), (R_EAR, rs)) if shoulder is not None]
        sides = [(c, e, s) for c, e, s in sides if e is not None]
        if sides:
            _, ear, shoulder = max(sides, key=lambda x: x[0])
            m["neck"] = _from_vertical(ear - shoulder)
    return m


def bad_posture(m: dict, s: WellnessSettings) -> dict:
    """{type: is it bad} for the types this view can judge."""
    out = {}
    if "neck" in m:
        out["neck"] = m["neck"] > s.neck_angle
    if "head_drop" in m:
        out["neck"] = out.get("neck", False) or m["head_drop"] < s.head_drop
    if m.get("frontal"):
        lean = None
        if "tilt" in m:
            lean = m["tilt"] > s.shoulder_tilt
        if "torso" in m:
            lean = bool(lean) or m["torso"] > s.side_lean
        if lean is not None:
            out["lean"] = lean
    elif "torso" in m:
        out["hunch"] = m["torso"] > s.torso_angle
    return out


def _openness(points):
    """Height / width of a landmark outline, measured along its own long axis."""
    p = points - points.mean(axis=0)
    _, _, vt = np.linalg.svd(p, full_matrices=False)
    along, across = p @ vt[0], p @ vt[1]
    width = along.max() - along.min()
    return float((across.max() - across.min()) / width) if width > 1e-6 else None


def face_metrics(face: face_id.Face) -> dict:
    """eye_dist (px, between the eyes), yaw, and from 106 landmarks: eye openness and mouth openness."""
    yaw, _ = face_id.face_pose(face.kps)
    m = dict(eye_dist=float(np.linalg.norm(face.kps[0] - face.kps[1])), yaw=yaw,
             width=float(face.box[2] - face.box[0]))
    if face.landmarks is not None and len(face.landmarks) >= 106:
        eyes = [_openness(face.landmarks[idx]) for idx in (EYE_A, EYE_B)]
        eyes = [e for e in eyes if e is not None]
        if eyes:
            m["eye"] = float(np.mean(eyes))
        mouth = _openness(face.landmarks[MOUTH])
        if mouth is not None:
            m["mouth"] = mouth
    return m


# --------------------------------------------------------------------- per person
@dataclass
class PersonWell:
    pid: int
    first_t: float
    first_at: float
    last_t: float = 0.0
    last_at: float = 0.0
    name: str | None = None
    state: str = "standing"
    present_s: float = 0.0
    sitting_s: float = 0.0
    sit_start: float | None = None
    away_since: float | None = None
    posture: dict = field(default_factory=lambda: {k: Sustained() for k in ("neck", "hunch", "lean")})
    posture_now: dict = field(default_factory=dict)
    posture_seen: float = -1e9   # last time posture could be judged
    distance: Sustained = field(default_factory=Sustained)
    eye_dists: deque = field(default_factory=lambda: deque(maxlen=16))
    learn: list = field(default_factory=list)  # eye_dist while seated, until the usual size is known
    baseline: float | None = None
    closed: Sustained = field(default_factory=lambda: Sustained(on_frac=0.85, off_seconds=1.0, off_frac=0.5))
    eye_hist: deque = field(default_factory=deque)  # (t, openness) for the usual openness
    mouth_open_since: float | None = None
    yawns: deque = field(default_factory=deque)
    last_yawn_alert: float = -1e9
    face_t: float = -1e9         # last measurement attempt
    face_seen: float = -1e9      # last time a usable face was measured
    face_reason: str = "ยังไม่ได้วัดหน้า"  # why the last measurement found no usable face
    metrics: dict = field(default_factory=dict)
    hist: deque = field(default_factory=lambda: deque(maxlen=90))  # (t, centre y, height, aspect, torso)
    drop_t: float | None = None
    last_fall: float = -1e9
    held: bool = False
    box_x: tuple = (0.0, 0.0)
    upright_since: float | None = None  # for clearing a fall from the live panel once they are up again
    lying: bool = False
    bad_since: dict = field(default_factory=dict)  # posture type -> start of the current bad stretch
    alerts: dict = field(default_factory=dict)  # type -> Alert, active episodes and recent moments
    flushed_t: float = 0.0


class WellnessMonitor:
    def __init__(self, settings: WellnessSettings | None = None, engine=None, sink=None, camera="",
                 session: str | None = None, clock=time.time, baselines: dict | None = None):
        self.s = settings or WellnessSettings()
        self.engine, self.sink, self.camera = engine, sink, camera
        self.session = session or uuid.uuid4().hex[:8]
        self.clock = clock
        self.people: dict[int, PersonWell] = {}
        self.carry: dict[str, tuple[float, float]] = {}  # name -> (sitting since, last seen): survives a new id
        self.baselines = baselines if baselines is not None else {}  # name -> usual eye distance on this camera
        self.t = 0.0
        self._new_settings: WellnessSettings | None = None
        self.gone: list = []  # (t, box, name) of upright people who just stopped being seen
        self.lingering: list[Alert] = []  # falls of people no longer in view: they stay on the live panel

    def set_settings(self, settings: WellnessSettings):
        self._new_settings = settings

    # ------------------------------------------------------------ frame
    def update(self, frame, persons, states: dict, names: dict, t: float):
        if self._new_settings is not None:
            self.s, self._new_settings = self._new_settings, None
            for p in self.people.values():  # switched off: close what is open
                for a in list(p.alerts.values()):
                    if not self.s.on(a.category):
                        self._end(p, a, t)
        dt = max(0.0, t - self.t) if self.t else 0.0
        self.t = t
        now = self.clock()
        present = {p.id for p in persons}
        for pid in [pid for pid in self.people if pid not in present]:
            self._leave(self.people[pid], t, now)
        measured = 0
        for det in sorted(persons, key=lambda d: self.people.get(d.id).face_t if d.id in self.people else -1e9):
            p = self.people.get(det.id)
            if p is None:
                p = self.people[det.id] = PersonWell(det.id, t, now, t, now)
            p.last_t, p.last_at = t, now
            p.present_s += dt
            if names.get(det.id) and names[det.id] != p.name:
                self._named(p, names[det.id], t)
            p.state = states.get(det.id, p.state)
            if p.state == "sitting":
                p.sitting_s += dt
            if det.held and not p.held:
                self._went(p, t)
            p.held = det.held
            if not det.held:
                self._fall(p, det, t)
                self._posture(p, det, t)
                if frame is not None and self.engine is not None and measured < self.s.max_faces_per_frame \
                        and t - p.face_t >= 1.0 / self.s.measure_hz:
                    measured += 1
                    self._face(p, det, frame, t)
            elif p.drop_t is not None and t - p.drop_t <= 1.5:
                self._moment(p, "fall_vanish", t, dict(drop=p.metrics.get("drop", 0.0)))
                p.drop_t = None
            self._sitting(p, t)
            for a in list(p.alerts.values()):
                if a.type in MOMENTS and a.end_t is not None and t > a.show_until:
                    del p.alerts[a.type]
            if t - p.flushed_t >= 60:
                self._presence(p)
                p.flushed_t = t

    def close(self):
        now = self.clock()
        for p in list(self.people.values()):
            self._leave(p, self.t, now)

    # ------------------------------------------------------------ categories
    def _posture(self, p, det, t):
        p.posture_now = {}
        if not self.s.posture_on or p.state != "sitting" or p.lying:  # someone on the floor has no sitting posture
            p.bad_since.clear()
            for kind, rule in p.posture.items():  # stood up or switched off: posture episodes are over
                if kind in p.alerts:
                    self._end(p, p.alerts[kind], t)
                rule.clear()
            return
        if det.kpts is None:
            return
        m = posture_metrics(det.kpts, det.box)
        bad = bad_posture(m, self.s)
        if not bad:
            return
        p.posture_seen = t
        p.metrics.update({k: round(v, 3) for k, v in m.items() if isinstance(v, float)})
        p.posture_now = bad
        for kind, is_bad in bad.items():
            if is_bad:
                p.bad_since.setdefault(kind, t)
            else:
                p.bad_since.pop(kind, None)
            rule = p.posture[kind]
            rule.add(t, is_bad, keep=max(self.s.posture_seconds, 10) + 5)
            worst = {k: v for k, v in m.items() if isinstance(v, float)}
            if kind in p.alerts:
                self._worse(p.alerts[kind], worst, kind)
                if rule.should_end(t):
                    self._end(p, p.alerts[kind], t)
                    rule.clear()  # the next episode needs a fresh stretch of bad posture
            elif rule.should_start(t, self.s.posture_seconds):
                self._start(p, kind, t - self.s.posture_seconds, t, worst)

    def _sitting(self, p, t):
        if p.state == "sitting":
            p.away_since = None
            if p.sit_start is None:
                p.sit_start = t
        elif p.sit_start is not None:
            p.away_since = p.away_since if p.away_since is not None else t
            if t - p.away_since >= self.s.break_seconds:
                p.sit_start = p.away_since = None
                if "sit_long" in p.alerts:
                    self._end(p, p.alerts["sit_long"], t)
        minutes = (t - p.sit_start) / 60 if p.sit_start is not None else 0.0
        if "sit_long" in p.alerts:
            a = p.alerts["sit_long"]
            a.worst["minutes"] = round(minutes, 1)
            a.text = f"นั่งต่อเนื่อง {int(minutes)} นาที ไม่ลุก"
        elif self.s.break_on and p.sit_start is not None and minutes >= self.s.sit_minutes:
            self._start(p, "sit_long", p.sit_start + self.s.sit_minutes * 60, t, dict(minutes=round(minutes, 1)),
                        text=f"นั่งต่อเนื่อง {int(minutes)} นาที ไม่ลุก")

    def _face(self, p, det, frame, t):
        p.face_t = t
        cut = face_id.upper_crop(frame, det.box, min_px=self.s.min_face_px)
        if cut is None:
            p.face_reason = "ตัวคนในภาพเล็กเกินไป"
            return
        crop, scale, offset = cut
        faces = [face_id.to_frame(f, scale, offset) for f in self.engine.measure(crop)]
        faces = [f for f in faces if f.score >= 0.6 and det.box[0] <= (f.box[0] + f.box[2]) / 2 <= det.box[2]]
        faces.sort(key=lambda f: -(f.box[2] - f.box[0]))
        if not faces:
            p.face_reason = "ไม่เห็นหน้า (หันหลังหรือก้มมาก)"
            return
        width = faces[0].box[2] - faces[0].box[0]
        if width < self.s.min_face_px:
            p.face_reason = f"หน้าเล็กไป {int(width)} px (ต้องการ {self.s.min_face_px} px)"
            return
        if len(faces) > 1 and faces[1].box[2] - faces[1].box[0] >= 0.6 * width:
            p.face_reason = "มีหลายหน้าในกรอบเดียว"
            return  # two people in one box
        m = face_metrics(faces[0])
        p.face_seen = t
        p.metrics.update({k: round(v, 3) for k, v in m.items()})
        self._distance(p, m, t)
        self._fatigue(p, m, t)

    def _distance(self, p, m, t):
        if not self.s.distance_on:
            return
        if abs(m["yaw"]) > 0.35:
            p.metrics["distance_note"] = 1.0  # turned too far to compare sizes
            return
        p.metrics.pop("distance_note", None)
        p.eye_dists.append(m["eye_dist"])
        size = float(np.median(p.eye_dists))
        key = self._baseline_key(p)
        if p.baseline is None and key in self.baselines:
            p.baseline = self.baselines[key]
        if p.baseline is None:
            if p.state == "sitting":
                p.learn.append((t, m["eye_dist"]))
                if p.learn[-1][0] - p.learn[0][0] >= self.s.distance_learn_seconds and len(p.learn) >= 20:
                    p.baseline = float(np.median([v for _, v in p.learn]))
                    if key:
                        self.baselines[key] = p.baseline
            return
        ratio = size / p.baseline
        p.metrics["distance_ratio"] = round(ratio, 3)
        p.distance.add(t, ratio >= self.s.distance_ratio, keep=self.s.distance_seconds + 5)
        if "close" in p.alerts:
            self._worse(p.alerts["close"], dict(ratio=ratio), "close")
            if p.distance.should_end(t):
                self._end(p, p.alerts["close"], t)
                p.distance.clear()
        elif p.distance.should_start(t, self.s.distance_seconds):
            self._start(p, "close", t - self.s.distance_seconds, t, dict(ratio=ratio))

    def _fatigue(self, p, m, t):
        if not self.s.fatigue_on:
            return
        if "eye" in m:
            p.eye_hist.append((t, m["eye"]))
            while p.eye_hist and t - p.eye_hist[0][0] > 60:
                p.eye_hist.popleft()
            if len(p.eye_hist) >= 20:
                usual = float(np.percentile([v for _, v in p.eye_hist], 80))
                closed = m["eye"] < usual * self.s.eye_ratio
                p.metrics["eye_usual"] = round(usual, 3)
                p.closed.add(t, closed, keep=self.s.eye_closed_seconds + 2)
                if "eyes_closed" in p.alerts:
                    a = p.alerts["eyes_closed"]
                    a.worst["seconds"] = round(t - a.start_t, 1)
                    if p.closed.should_end(t):
                        self._end(p, a, t)
                        p.closed.clear()
                elif p.closed.should_start(t, self.s.eye_closed_seconds):
                    self._start(p, "eyes_closed", t - self.s.eye_closed_seconds, t,
                                dict(eye=m["eye"], usual=usual, seconds=self.s.eye_closed_seconds))
        if "mouth" in m:
            if m["mouth"] >= self.s.yawn_ratio:
                p.mouth_open_since = p.mouth_open_since if p.mouth_open_since is not None else t
            elif p.mouth_open_since is not None:
                if t - p.mouth_open_since >= self.s.yawn_seconds:
                    p.yawns.append(t)
                p.mouth_open_since = None
            window = self.s.yawn_window_minutes * 60
            while p.yawns and t - p.yawns[0] > window:
                p.yawns.popleft()
            if len(p.yawns) >= self.s.yawn_count and t - p.last_yawn_alert >= window:
                p.last_yawn_alert = t
                self._moment(p, "yawn", t, dict(yawns=len(p.yawns), minutes=self.s.yawn_window_minutes),
                             text=f"หาว {len(p.yawns)} ครั้งใน {int(self.s.yawn_window_minutes)} นาที")

    def _fall(self, p, det, t):
        x1, y1, x2, y2 = (float(v) for v in det.box)
        h, w = max(y2 - y1, 1.0), x2 - x1
        torso = posture_metrics(det.kpts, det.box).get("torso") if det.kpts is not None else None
        cy = (y1 + y2) / 2
        p.hist.append((t, cy, h, w / h, torso))
        p.box_x = (x1, x2)
        self.gone = [g for g in self.gone if t - g[0] <= 2.0]
        lying = (torso is not None and torso >= self.s.fall_angle) or w / h >= 1.2
        p.lying = lying
        if lying:
            p.upright_since = None
        elif p.upright_since is None:
            p.upright_since = t
        for kind in ("fall", "fall_vanish"):
            a = p.alerts.get(kind)
            if a is not None and p.upright_since is not None and p.upright_since > a.start_t \
                    and t - p.upright_since >= self.s.recovered_seconds:
                del p.alerts[kind]  # up again: off the live panel, still in the history
        if not self.s.fall_on or t - p.last_fall < 30:
            return
        if lying and t - p.first_t <= 1.0:
            # the tracker often gives a fallen body a new id: the box changed shape too much to match
            for g in self.gone:
                gt, gcy, gh, (gx1, gx2), gname = g
                overlap = min(x2, gx2) - max(x1, gx1)
                drop = (cy - gcy) / gh
                if overlap >= 0.3 * min(w, gx2 - gx1) and drop >= 0.5 * self.s.fall_drop:
                    if gname and not p.name:
                        p.name = gname
                    self._moment(p, "fall", t, dict(drop=drop, torso=torso if torso is not None else -1.0,
                                                    aspect=w / h, new_track=1.0))
                    self.gone.remove(g)
                    return
        for ts, cy0, h0, aspect0, torso0 in p.hist:
            if t - ts > self.s.fall_window:
                continue
            drop = (cy - cy0) / h0
            upright_before = aspect0 < 1.0 and (torso0 is None or torso0 < self.s.fall_angle)
            if drop >= self.s.fall_drop and lying and upright_before:
                self._moment(p, "fall", t, dict(drop=drop, torso=torso if torso is not None else -1.0,
                                                aspect=w / h))
                p.last_fall, p.drop_t = t, None
                return
            if drop >= self.s.vanish_drop and t - ts <= 0.6 and upright_before:
                p.drop_t = t
                p.metrics["drop"] = round(drop, 3)

    # ------------------------------------------------------------ episodes
    def _start(self, p, kind, start_t, t, worst, text=None):
        a = Alert(uuid.uuid4().hex[:12], TYPE_CATEGORY[kind], kind, p.pid, p.name, self.camera, self.session,
                  start_t, self.clock() - (t - start_t), text or TYPE_TEXT[kind], dict(worst))
        p.alerts[kind] = a
        self._write(a)
        return a

    def _moment(self, p, kind, t, worst, text=None):
        if not self.s.on(TYPE_CATEGORY[kind]):
            return
        if kind in ("fall", "fall_vanish"):
            p.last_fall = t
        a = self._start(p, kind, t, t, worst, text)
        a.end_t, a.ended_at = t, a.started_at
        a.show_until = t + (self.s.moment_show_seconds if kind != "yawn" else 60)
        self._write(a)

    def _end(self, p, a, t):
        if a.type not in MOMENTS:
            a.end_t, a.ended_at = t, self.clock()
            self._write(a)
        p.alerts.pop(a.type, None)

    @staticmethod
    def _worse(a, values, kind):
        for k, v in values.items():
            if not isinstance(v, float):
                continue
            if kind == "neck" and k == "head_drop":
                a.worst[k] = min(a.worst.get(k, v), v)
            else:
                a.worst[k] = max(a.worst.get(k, v), v)

    def _named(self, p, name, t):
        p.name = name
        for a in p.alerts.values():
            a.name = name
            self._write(a)
        carried = self.carry.get(name)
        if carried and t - carried[1] <= self.s.break_seconds:  # same person, new track id: the clock goes on
            p.sit_start = carried[0] if p.sit_start is None else min(p.sit_start, carried[0])
        if p.baseline is None and self._baseline_key(p) in self.baselines:
            p.baseline = self.baselines[self._baseline_key(p)]

    def _baseline_key(self, p):
        return f"{p.name}|{self.camera}" if p.name else None

    def _went(self, p, t):
        """An upright person just stopped being seen: someone lying there next may be them, fallen."""
        if p.hist:
            ts, cy, h, aspect, torso = p.hist[-1]
            if aspect < 1.0 and (torso is None or torso < self.s.fall_angle):
                self.gone.append((t, cy, h, p.box_x, p.name))

    def _leave(self, p, t, now):
        if not p.held:
            self._went(p, t)
        for a in list(p.alerts.values()):
            if a.type not in MOMENTS:
                self._end(p, a, t)
        if p.drop_t is not None and t - p.drop_t <= 1.5:
            self._moment(p, "fall_vanish", t, dict(drop=p.metrics.get("drop", 0.0)))
        if p.name and p.sit_start is not None:
            self.carry[p.name] = (p.sit_start, t)
        self.lingering += [a for a in p.alerts.values() if a.category == "fall" and a.show_until > t]
        self._presence(p)
        self.people.pop(p.pid, None)

    def _presence(self, p):
        if self.sink is None:
            return
        self.sink.write(dict(kind="presence", id=f"{self.session}-{p.pid}", session=self.session,
                             camera=self.camera, person=p.pid, name=p.name, started_at=round(p.first_at, 3),
                             last_at=round(p.last_at, 3), seconds=round(p.present_s, 1),
                             sitting_seconds=round(p.sitting_s, 1)))

    def _write(self, a):
        if self.sink is not None:
            self.sink.write(a.record())

    # ------------------------------------------------------------ for the live view
    def status(self, pid) -> dict | None:
        p = self.people.get(pid)
        if p is None:
            return None
        t = self.t
        face_ok = self.engine is not None and t - p.face_seen <= 3.0
        checks, notes = {}, {}
        for cat in CATEGORIES:
            if not self.s.on(cat):
                checks[cat] = "off"
            elif any(a.category == cat for a in p.alerts.values()):
                checks[cat] = "alert"
            else:
                checks[cat] = "ok"
        if checks["posture"] == "ok" and (p.state != "sitting" or p.lying or t - p.posture_seen > 3.0):
            checks["posture"], notes["posture"] = "na", (
                "นอนอยู่" if p.lying else "ไม่ได้นั่ง" if p.state != "sitting" else "มองไม่เห็นไหล่/ศีรษะ")
        for cat in ("distance", "fatigue"):
            if checks[cat] == "ok" and not face_ok:
                checks[cat] = "na"
                notes[cat] = "ไม่มีโมเดลใบหน้า (ติดตั้ง insightface)" if self.engine is None else p.face_reason
        if checks["distance"] == "ok" and p.baseline is None:
            learnt = p.learn[-1][0] - p.learn[0][0] if p.learn else 0.0
            left = max(0, int(self.s.distance_learn_seconds - learnt))
            checks["distance"], notes["distance"] = "na", f"กำลังเรียนรู้ระยะปกติ อีกราว {left} วินาทีที่นั่งหันหน้าเข้าจอ"
        if checks["fatigue"] == "ok" and "eye" not in p.metrics:
            checks["fatigue"], notes["fatigue"] = "na", "อ่านตาไม่ได้ (โมเดลไม่มีจุดบนใบหน้า)"
        elif checks["fatigue"] == "ok" and len(p.eye_hist) < 20:
            checks["fatigue"], notes["fatigue"] = "na", "กำลังเรียนรู้การลืมตาปกติ"
        if checks["distance"] == "na" and p.metrics.get("distance_note") and notes.get("distance", "").startswith("กำลัง"):
            notes["distance"] += " (ตอนนี้หันหน้าออกจากกล้อง)"
        return dict(
            checks=checks, notes=notes,
            alerts=[self._live(a, t) for a in p.alerts.values()],
            sitMinutes=round((t - p.sit_start) / 60, 1) if p.sit_start is not None else None,
            metrics=p.metrics,
            badFor={k: round(t - since, 1) for k, since in p.bad_since.items() if k not in p.alerts and t - since >= 1},
            faceAge=round(t - p.face_seen, 1) if p.face_seen > -1e8 else None,
        )

    def active(self) -> list[dict]:
        self.lingering = [a for a in self.lingering if a.show_until > self.t]
        return [self._live(a, self.t) for a in self.lingering] + \
            [self._live(a, self.t) for p in self.people.values() for a in p.alerts.values()]

    @staticmethod
    def _live(a, t):
        return dict(id=a.id, category=a.category, type=a.type, text=a.text, person=a.person, name=a.name,
                    startedAt=round(a.started_at, 3), seconds=round((a.end_t if a.end_t is not None else t) - a.start_t, 1),
                    moment=a.type in MOMENTS)
