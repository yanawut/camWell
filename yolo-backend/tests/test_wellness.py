"""wellness.WellnessMonitor on synthetic people: keypoints, boxes and face landmarks built by hand."""
from types import SimpleNamespace

import numpy as np
import pytest

import face_id as fi
import wellness as wl


class Sink:
    def __init__(self):
        self.records = []

    def write(self, rec):
        self.records.append(dict(rec))

    def alerts(self):
        last = {}
        for r in self.records:
            if r["kind"] == "alert":
                last[r["id"]] = r
        return list(last.values())


def kpts(points):
    k = np.zeros((17, 3), np.float32)
    for i, (x, y) in points.items():
        k[i] = (x, y, 0.9)
    return k


FRONT_GOOD = {wl.NOSE: (140, 150), wl.L_SHO: (100, 200), wl.R_SHO: (180, 200), wl.L_HIP: (110, 300),
              wl.R_HIP: (170, 300)}
FRONT_BOWED = {**FRONT_GOOD, wl.NOSE: (140, 190)}
FRONT_TILTED = {**FRONT_GOOD, wl.L_SHO: (100, 190), wl.R_SHO: (180, 210)}
SIDE_GOOD = {wl.L_EAR: (140, 150), wl.L_SHO: (140, 200), wl.R_SHO: (145, 202), wl.L_HIP: (140, 300)}
SIDE_FORWARD_HEAD = {**SIDE_GOOD, wl.L_EAR: (170, 160)}
SIDE_HUNCHED = {**SIDE_GOOD, wl.L_SHO: (180, 200), wl.R_SHO: (185, 202), wl.L_EAR: (180, 150)}
BOX = np.array([80, 120, 200, 420], np.float32)


def person(pid=1, box=BOX, points=FRONT_GOOD, held=False, cut=frozenset()):
    return SimpleNamespace(id=pid, box=np.asarray(box, np.float32), kpts=kpts(points) if points else None, held=held,
                           cut=cut)


class Clock:
    def __init__(self):
        self.now = 1_700_000_000.0

    def __call__(self):
        return self.now


def run(mon, clock, seconds, make, fps=5, state="sitting", names=None, start=None, frame=None):
    t0 = mon.t if start is None else start
    n = int(seconds * fps)
    for i in range(1, n + 1):
        t = t0 + i / fps
        clock.now += 1 / fps
        persons = make(t)
        mon.update(frame, persons, {p.id: state for p in persons}, names or {}, t)
    return mon


def monitor(**settings):
    clock, sink = Clock(), Sink()
    mon = wl.WellnessMonitor(wl.WellnessSettings(**settings), sink=sink, camera="cam", session="s1", clock=clock)
    return mon, clock, sink


# ---------------------------------------------------------------- posture
@pytest.mark.parametrize("points, kind", [
    (FRONT_BOWED, "neck"), (FRONT_TILTED, "lean"), (SIDE_FORWARD_HEAD, "neck"), (SIDE_HUNCHED, "hunch")])
def test_bad_posture_for_30_seconds_starts_an_alert_and_good_posture_ends_it(points, kind):
    mon, clock, sink = monitor()
    run(mon, clock, 20, lambda t: [person(points=points)])
    assert mon.status(1)["checks"]["posture"] == "ok"  # not long enough yet
    run(mon, clock, 15, lambda t: [person(points=points)])
    assert mon.status(1)["checks"]["posture"] == "alert"
    assert [a["type"] for a in mon.active()] == [kind]
    run(mon, clock, 12, lambda t: [person(points=FRONT_GOOD if points is not SIDE_HUNCHED else SIDE_GOOD)])
    assert mon.active() == []
    (rec,) = sink.alerts()
    assert rec["category"] == "posture" and rec["type"] == kind and 35 <= rec["seconds"] <= 50 and rec["worst"]


def test_good_posture_and_standing_never_alert():
    mon, clock, sink = monitor()
    run(mon, clock, 60, lambda t: [person(points=SIDE_GOOD)])
    run(mon, clock, 60, lambda t: [person(points=FRONT_BOWED)], state="standing")
    assert sink.alerts() == []
    assert mon.status(1)["checks"]["posture"] == "na"


# ---------------------------------------------------------------- sitting time
def test_sitting_45_minutes_alerts_until_a_real_break():
    mon, clock, sink = monitor()
    run(mon, clock, 44 * 60, lambda t: [person()], fps=1)
    assert mon.status(1)["checks"]["break"] == "ok" and mon.status(1)["sitMinutes"] == pytest.approx(44, abs=0.1)
    run(mon, clock, 70, lambda t: [person()], fps=1)
    (a,) = mon.active()
    assert a["type"] == "sit_long" and a["text"].startswith("นั่งต่อเนื่อง 45 นาที")
    run(mon, clock, 30, lambda t: [person()], fps=1, state="standing")  # too short to count as a break
    assert mon.active()
    run(mon, clock, 40, lambda t: [person()], fps=1, state="standing")
    assert mon.active() == [] and mon.status(1)["sitMinutes"] is None
    assert sink.alerts()[0]["worst"]["minutes"] >= 45


def test_the_sitting_clock_follows_a_named_person_to_a_new_track_id():
    mon, clock, sink = monitor()
    run(mon, clock, 30 * 60, lambda t: [person(1)], fps=1, names={1: "Alice"})
    run(mon, clock, 5, lambda t: [], fps=1)  # track lost
    run(mon, clock, 16 * 60, lambda t: [person(2)], fps=1, names={2: "Alice"})
    assert [a["type"] for a in mon.active()] == ["sit_long"] and mon.active()[0]["name"] == "Alice"


# ---------------------------------------------------------------- falls
STANDING = [100, 100, 200, 400]
DROPPED = [100, 240, 200, 400]  # the head came down toward the feet: gone behind something


def test_a_fast_drop_to_lying_is_a_fall_at_once():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(box=STANDING, points=None)], state="standing")
    run(mon, clock, 0.6, lambda t: [person(box=[50, 330, 350, 430], points=None)], state="standing")
    (a,) = mon.active()
    assert a["type"] == "fall" and a["moment"]
    (rec,) = sink.alerts()
    assert rec["seconds"] == 0.0 and rec["worst"]["drop"] >= 0.3
    run(mon, clock, 5, lambda t: [person(box=[50, 330, 350, 430], points=None)], state="standing")
    assert len(sink.alerts()) == 1  # one fall, not one per frame


def test_sitting_down_is_not_a_fall():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(box=STANDING, points=None)], state="standing")
    run(mon, clock, 2, lambda t: [person(box=[100, 180, 200, 400], points=None)])
    assert sink.alerts() == []


def test_a_fast_drop_then_gone_is_a_suspected_fall():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(box=STANDING, points=None)], state="standing")
    run(mon, clock, 0.4, lambda t: [person(box=DROPPED, points=None)], state="standing")
    run(mon, clock, 0.6, lambda t: [person(box=DROPPED, points=None, held=True)], state="standing")
    assert [a["type"] for a in sink.alerts()] == ["fall_vanish"]


def test_walking_out_of_the_bottom_of_the_picture_is_not_a_fall():
    """example clip 4 at 0:57: the box runs into the bottom edge, its top slides down as they pass, then gone."""
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(box=[750, 334, 933, 643], points=None)], state="walking", fps=12.5)
    leaving = iter([[702, 390, 884, 713], [681, 412, 857, 718], [662, 433, 834, 719], [649, 448, 816, 718],
                    [637, 461, 801, 718], [622, 478, 781, 719], [609, 501, 758, 720], [590, 531, 725, 720],
                    [562, 560, 682, 719], [521, 587, 639, 719], [476, 613, 576, 720]])
    run(mon, clock, 11 / 12.5, lambda t: [person(box=next(leaving), points=None, cut={"bottom"})], state="walking",
        fps=12.5)
    run(mon, clock, 1, lambda t: [person(box=[451, 629, 537, 720], points=None, held=True, cut={"bottom"})],
        state="walking", fps=12.5)
    run(mon, clock, 1, lambda t: [], fps=12.5)
    assert sink.alerts() == []


def test_legs_going_behind_a_desk_and_back_is_not_a_fall():
    """example clip.mp4 at 0:47: the head stays put while the box bottom jumps, then one frame is missed."""
    mon, clock, sink = monitor()
    seated = [1063, 326, 1132, 587]
    run(mon, clock, 2, lambda t: [person(box=seated, points=None)])
    run(mon, clock, 0.4, lambda t: [person(box=[1066, 326, 1132, 420], points=None)])
    run(mon, clock, 0.4, lambda t: [person(box=seated, points=None)])
    run(mon, clock, 0.2, lambda t: [person(box=seated, points=None, held=True)])
    run(mon, clock, 2, lambda t: [person(box=seated, points=None)])
    assert sink.alerts() == []


# example clip 4, 0:33.5 to 0:35: box top, box height, head height (None: no head keypoints), torso angle
APPROACH_THEN_SIT = [
    (262, 156, 306, 6), (264, 154, 309, 6), (266, 152, 310, 6), (267, 152, 312, 9), (269, 153, 314, 11),
    (271, 154, 316, 13), (273, 155, 316, 15), (276, 156, 319, 17), (279, 155, 325, 18), (283, 153, 329, 20),
    (287, 152, 336, 19), (291, 149, 340, 18), (295, 146, 346, 15), (298, 143, 349, 17), (301, 141, 354, 9),
    (302, 140, 359, 13), (303, 140, 364, 12), (304, 139, 368, 29), (305, 138, 371, 42), (306, 138, 371, 18),
    (307, 136, 371, 24), (309, 135, 371, 51), (310, 134, None, None), (311, 133, 373, 28), (312, 133, 376, 47),
    (313, 133, None, None), (313, 132, 379, 39), (312, 133, 379, 69), (312, 133, 381, 62), (309, 136, 382, 90),
    (306, 139, 384, 90), (303, 143, None, 90), (298, 148, None, 90), (298, 150, None, 90), (304, 145, None, 83)]


def sighting(top, h, head, torso, held=False):
    """A person box with keypoints putting the head and the torso angle where they were seen."""
    points = {}
    if torso is not None:
        hip = np.array([580.0, top + 0.8 * h])
        a = np.radians(torso)
        shoulder = hip + 0.35 * h * np.array([np.sin(a), -np.cos(a)])
        points.update({wl.L_HIP: hip - (10, 0), wl.R_HIP: hip + (10, 0),
                       wl.L_SHO: shoulder - (20, 0), wl.R_SHO: shoulder + (20, 0)})
    if head is not None:
        points.update({wl.NOSE: (580, head), 1: (575, head), 2: (585, head)})
    return person(22, box=[529, top, 634, top + h], points=points, held=held)


def test_walking_toward_a_high_camera_then_sitting_down_is_not_a_fall():
    """The head goes down the picture as he comes closer, but not toward his feet; then he leans over to sit and the
    tracker loses him for a moment."""
    mon, clock, sink = monitor()
    seen = iter(APPROACH_THEN_SIT)
    run(mon, clock, len(APPROACH_THEN_SIT) / 25, lambda t: [sighting(*next(seen))], state="walking", fps=25)
    run(mon, clock, 0.6, lambda t: [sighting(304, 145, None, 83, held=True)], fps=25)
    run(mon, clock, 1, lambda t: [], fps=25)
    assert sink.alerts() == []


def test_lowering_stretched_arms_then_a_missed_frame_is_not_a_fall():
    """example clip.mp4 at 1:09: arms above the head lift the box top, the head stays where it is."""
    mon, clock, sink = monitor()
    head = {wl.NOSE: (730, 332), 1: (726, 328), 2: (734, 328), wl.L_SHO: (718, 350), wl.R_SHO: (742, 350)}
    run(mon, clock, 2, lambda t: [person(box=[712, 286, 741, 351], points=head)], fps=15)
    run(mon, clock, 1, lambda t: [person(box=[709, 321, 755, 393], points=head)], fps=15)
    run(mon, clock, 1 / 15, lambda t: [person(box=[709, 321, 755, 393], points=head, held=True)], fps=15)
    run(mon, clock, 1, lambda t: [person(box=[709, 321, 755, 393], points=head)], fps=15)
    assert sink.alerts() == []


def test_one_frame_of_jumbled_keypoints_is_not_a_fall():
    """example clip.mp4 at 0:30: a seated man taking off a jacket, his torso read as flat for one frame."""
    mon, clock, sink = monitor()
    seated = [742, 340, 877, 488]
    upright = {wl.L_SHO: (790, 380), wl.R_SHO: (830, 380), wl.L_HIP: (795, 450), wl.R_HIP: (825, 450)}
    flat = {wl.L_SHO: (860, 420), wl.R_SHO: (860, 440), wl.L_HIP: (760, 450), wl.R_HIP: (760, 470)}
    run(mon, clock, 2, lambda t: [person(1, box=seated, points=upright)], fps=15)
    run(mon, clock, 0.3, lambda t: [person(1, box=seated, points=upright, held=True)], fps=15)
    run(mon, clock, 1 / 15, lambda t: [person(2, box=[723, 363, 877, 555], points=flat)], fps=15)
    run(mon, clock, 1, lambda t: [person(2, box=[730, 360, 866, 536], points=upright)], fps=15)
    assert sink.alerts() == []


# ---------------------------------------------------------------- face: distance and fatigue
def ellipse(cx, cy, half_w, openness, n):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([cx + half_w * np.cos(a), cy + half_w * openness * np.sin(a)], axis=1)


class FaceEngine(fi.FaceEngine):
    """One frontal face in the crop with eyes `eye_dist` apart; eye openness and the gap between the lips (over
    the mouth's width) as set."""
    name = "fake"

    def __init__(self):
        self.eye_dist, self.eye, self.mouth, self.yaw = 40.0, 0.4, 0.05, 0.0

    def _measure(self, image):
        d, x, y = self.eye_dist, 100.0, 100.0
        le, re = (x + d, y + d), (x + 2 * d, y + d)
        kps = np.array([le, re, (x + (1.5 + self.yaw) * d, y + 1.6 * d), (x + 1.1 * d, y + 2.1 * d), (x + 1.9 * d, y + 2.1 * d)],
                       np.float32)
        lm = np.zeros((106, 2), np.float32)
        lm[wl.EYE_A] = ellipse(*le, 0.3 * d, self.eye, 10)
        lm[wl.EYE_B] = ellipse(*re, 0.3 * d, self.eye, 10)
        mx, my, half = x + 1.5 * d, y + 2.1 * d, 0.5 * d
        lm[list(wl.MOUTH_CORNERS)] = [(mx - half, my), (mx + half, my)]
        lm[list(wl.INNER_LIPS)] = [(mx, my - self.mouth * half), (mx, my + self.mouth * half)]
        return [fi.Face(np.array([x, y, x + 3 * d, y + 3 * d], np.float32), kps, 0.9, None, lm)]


BIG = [0, 0, 400, 800]  # large enough that the face crop is not rescaled
FRAME = np.zeros((900, 900, 3), np.uint8)


def face_monitor(**settings):
    mon, clock, sink = monitor(**settings)
    mon.engine = FaceEngine()
    return mon, clock, sink


def test_closer_than_usual_to_the_screen_after_learning_the_usual_size():
    mon, clock, sink = face_monitor()
    run(mon, clock, 125, lambda t: [person(box=BIG)], frame=FRAME)
    assert mon.status(1)["checks"]["distance"] == "ok"
    mon.engine.eye_dist = 55.0
    run(mon, clock, 36, lambda t: [person(box=BIG)], frame=FRAME)
    assert [a["type"] for a in mon.active()] == ["close"]
    mon.engine.eye_dist = 40.0
    run(mon, clock, 15, lambda t: [person(box=BIG)], frame=FRAME)
    assert mon.active() == [] and sink.alerts()[0]["worst"]["ratio"] >= 1.3


def test_distance_waits_while_learning():
    mon, clock, sink = face_monitor()
    run(mon, clock, 30, lambda t: [person(box=BIG)], frame=FRAME)
    st = mon.status(1)
    assert st["checks"]["distance"] == "na" and st["notes"]["distance"].startswith("กำลังเรียนรู้ระยะปกติ อีกราว 9")


def test_eyes_closed_for_two_seconds_but_not_a_blink():
    mon, clock, sink = face_monitor()
    run(mon, clock, 10, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    mon.engine.eye = 0.08
    run(mon, clock, 0.4, lambda t: [person(box=BIG)], frame=FRAME, fps=8)  # a blink
    mon.engine.eye = 0.4
    run(mon, clock, 2, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    assert sink.alerts() == []
    mon.engine.eye = 0.08
    run(mon, clock, 2.6, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    assert [a["type"] for a in mon.active()] == ["eyes_closed"]
    mon.engine.eye = 0.4
    run(mon, clock, 1.5, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    assert mon.active() == []


def test_three_yawns_in_ten_minutes():
    mon, clock, sink = face_monitor()
    for _ in range(3):
        mon.engine.mouth = 0.05
        run(mon, clock, 60, lambda t: [person(box=BIG)], frame=FRAME, fps=4)
        mon.engine.mouth = 0.5
        run(mon, clock, 2.5, lambda t: [person(box=BIG)], frame=FRAME, fps=4)
    mon.engine.mouth = 0.05
    run(mon, clock, 1, lambda t: [person(box=BIG)], frame=FRAME, fps=4)
    assert [a["type"] for a in sink.alerts()] == ["yawn"]
    assert sink.alerts()[0]["worst"]["yawns"] == 3


def test_talking_is_not_yawning():
    mon, clock, sink = face_monitor(yawn_count=1)
    for _ in range(120):
        mon.engine.mouth = 0.5
        run(mon, clock, 0.25, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
        mon.engine.mouth = 0.05
        run(mon, clock, 0.25, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    assert sink.alerts() == []


def test_a_mouth_turned_far_from_the_camera_is_not_read():
    """A face in profile has a narrow mouth, so closed lips look wide open."""
    mon, clock, sink = face_monitor(yawn_count=1)
    mon.engine.yaw, mon.engine.mouth = 2.0, 0.5
    run(mon, clock, 5, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    mon.engine.yaw, mon.engine.mouth = 0.0, 0.05
    run(mon, clock, 1, lambda t: [person(box=BIG)], frame=FRAME, fps=8)
    assert sink.alerts() == [] and "mouth" in mon.people[1].metrics


def test_small_faces_are_not_measured():
    mon, clock, sink = face_monitor()
    mon.engine.eye_dist = 10.0  # face 30 px wide
    run(mon, clock, 10, lambda t: [person(box=BIG)], frame=FRAME)
    assert mon.status(1)["checks"]["fatigue"] == "na"


# ---------------------------------------------------------------- settings, presence
def test_switched_off_categories_close_and_stay_quiet():
    mon, clock, sink = monitor()
    run(mon, clock, 35, lambda t: [person(points=FRONT_BOWED)])
    assert mon.active()
    mon.set_settings(wl.WellnessSettings(posture_on=False))
    run(mon, clock, 1, lambda t: [person(points=FRONT_BOWED)])
    assert mon.active() == [] and mon.status(1)["checks"]["posture"] == "off"


def test_settings_round_trip_and_ignore_unknown_keys():
    s = wl.WellnessSettings.from_dict(dict(sit_minutes="30", fall_on=0, bogus=1, yawn_count=4.0))
    assert s.sit_minutes == 30.0 and s.fall_on is False and s.yawn_count == 4
    assert wl.WellnessSettings.from_dict(s.to_dict()) == s


def test_presence_is_written_when_a_person_leaves():
    mon, clock, sink = monitor()
    run(mon, clock, 20, lambda t: [person(1)], names={1: "Bob"})
    run(mon, clock, 1, lambda t: [])
    (rec,) = [r for r in sink.records if r["kind"] == "presence"]
    assert rec["name"] == "Bob" and 19 <= rec["seconds"] <= 21 and rec["sitting_seconds"] > 18


def test_a_fall_that_the_tracker_gives_a_new_id():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(1, box=STANDING, points=None)], state="standing", names={1: "Dan"})
    run(mon, clock, 0.6, lambda t: [person(1, box=STANDING, points=None, held=True),
                                    person(2, box=[50, 330, 350, 430], points=None)], state="standing")
    (rec,) = sink.alerts()
    assert rec["type"] == "fall" and rec["person"] == 2 and rec["name"] == "Dan"


def test_someone_lying_down_elsewhere_is_not_a_fall():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(1, box=STANDING, points=None)], state="standing")
    run(mon, clock, 0.4, lambda t: [person(1, box=STANDING, points=None, held=True),
                                    person(2, box=[700, 330, 1000, 430], points=None)], state="standing")
    assert sink.alerts() == []


def test_a_fall_leaves_the_live_panel_once_they_are_up_again():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(box=STANDING, points=None)], state="standing")
    run(mon, clock, 1, lambda t: [person(box=[50, 330, 350, 430], points=None)], state="standing")
    assert mon.status(1)["checks"]["fall"] == "alert"
    run(mon, clock, 2, lambda t: [person(box=STANDING, points=None)], state="standing")
    assert mon.status(1)["checks"]["fall"] == "alert"  # not yet: 3 s upright
    run(mon, clock, 1.5, lambda t: [person(box=STANDING, points=None)], state="standing")
    assert mon.status(1)["checks"]["fall"] == "ok" and mon.active() == []
    assert [a["type"] for a in sink.alerts()] == ["fall"]  # still in the history


def test_the_live_view_shows_how_long_posture_has_been_bad():
    mon, clock, sink = monitor()
    run(mon, clock, 12, lambda t: [person(points=FRONT_BOWED)])
    assert 11 <= mon.status(1)["badFor"]["neck"] <= 12.5
    run(mon, clock, 1, lambda t: [person(points=FRONT_GOOD)])
    assert "neck" not in mon.status(1)["badFor"]


def test_the_reason_a_face_is_not_measured():
    mon, clock, sink = face_monitor()
    mon.engine.eye_dist = 10.0
    run(mon, clock, 2, lambda t: [person(box=BIG)], frame=FRAME)
    assert mon.status(1)["notes"]["fatigue"] == "หน้าเล็กไป 30 px (ต้องการ 60 px)"


def test_a_fall_stays_on_the_panel_after_the_person_leaves_the_view():
    mon, clock, sink = monitor()
    run(mon, clock, 2, lambda t: [person(box=STANDING, points=None)], state="standing")
    run(mon, clock, 0.4, lambda t: [person(box=DROPPED, points=None)], state="standing")
    run(mon, clock, 0.4, lambda t: [], state="standing")
    assert [a["type"] for a in mon.active()] == ["fall_vanish"]
    run(mon, clock, 60, lambda t: [], state="standing", fps=1)
    assert mon.active()
    run(mon, clock, 70, lambda t: [], state="standing", fps=1)
    assert mon.active() == []


def test_someone_lying_is_not_judged_for_posture():
    mon, clock, sink = monitor()
    run(mon, clock, 40, lambda t: [person(box=[50, 330, 350, 430], points=FRONT_BOWED)])
    assert sink.alerts() == [] and mon.status(1)["notes"]["posture"] == "นอนอยู่"
