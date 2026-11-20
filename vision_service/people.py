"""Which person each ByteTrack track belongs to, and who to show.

Started as a copy of Cam-Well-YoLo-ByteTrack backend/room_analytics.py at 9bc5f9b (PersonIdentities and the
helpers it uses): one box per person, the same ID while someone sits still, held through short detection gaps, and
no chair counted as a person. That project is paused, so this file is now the one to change. Check a change on
recorded clips with tools/eval_clips.py (replay takes seconds) before trusting it; see docs/vision/next-steps.md.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field, fields

import numpy as np


@dataclass
class PersonSettings:
    """PersonIdentities' tuning, as tuned on the office camera (room_analytics.Config)."""
    min_conf: float = 0.30                # shown once a person has reached this; furniture must reach it per frame
    same_person_overlap: float = 0.60     # intersection / smaller box above which a new track is the same person
    hold_frames: int = 15                 # keep showing a person this long after the tracker stops seeing them
    box_follow: float = 0.50              # share of each new box taken per frame; the raw shape flips between frames
    settle_frames: int = 45               # staying put this long means seated: leaning or typing drops detection for a while
    seat_hold_frames: int = 450           # ...so someone seated is held far longer than someone on the move
    held_yield_overlap: float = 0.25      # a held box is only memory: it gives way to a seen box this far over it
    min_body_share: float = 0.10          # a box under this share of someone's size is a head or an arm, not them
    floor_creep_px: float = 0.50          # slower than walking, so finding a seated person's floor is not a walk
    chair_iou: float = 0.70               # a person box this close to a chair box is the chair, labelled both ways
    chair_conf: float = 0.15              # ...unless the chair box is fainter: someone behind a chair back gets one too
    chair_memory: int = 15                # frames a chair box keeps counting: a headrest is called a chair on and off
    seat_leave_share: float = 0.50        # last seen seated keeps the seat hold this close to the seat (box heights)
    held_replace_iou: float = 0.30        # someone else this close over a held box, at about its size, is in its place
    held_replace_share: float = 0.40      # ...about its size: the smaller box is at least this share of the larger


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


def person_identities(settings: PersonSettings | None = None) -> PersonIdentities:
    settings = settings or PersonSettings()
    return PersonIdentities(**{f.name: getattr(settings, f.name) for f in fields(settings)})
