"""face_id with a fake engine: a face is a coloured square, its colour is who it is."""
import os
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

import face_id as fi

COLOURS = {"Alice": (0, 0, 255), "Bob": (0, 255, 0), "Carol": (255, 0, 0), "Stranger": (0, 255, 255),
           "AliceLike": (0, 60, 255)}


class ColourEngine(fi.FaceEngine):
    """Finds solid squares; the embedding is their colour, so same colour = same person."""
    name = "colour"
    threshold = 0.9

    def __init__(self):
        self.calls = 0

    def faces(self, image):
        self.calls += 1
        mask = (image.max(axis=2) > 40).astype(np.uint8)
        n, _, stats, _ = cv2.connectedComponentsWithStats(mask)
        out = []
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if area < 16:
                continue
            colour = image[y + h // 2, x + w // 2].astype(np.float32)
            kps = np.array([[x + 0.3 * w, y + 0.4 * h], [x + 0.7 * w, y + 0.4 * h], [x + 0.5 * w, y + 0.6 * h],
                            [x + 0.35 * w, y + 0.8 * h], [x + 0.65 * w, y + 0.8 * h]], np.float32)
            out.append(fi.Face(np.array([x, y, x + w, y + h], np.float32), kps, 0.9, fi.normalise(colour)))
        return out


def gallery(*names):
    return fi.Gallery(list(names), np.array([fi.normalise(COLOURS[n]) for n in names], np.float32))


def scene(people, size=(720, 1280)):
    """people: (id, box, colour or None, face width). The face sits in the top of the box."""
    img = np.zeros((*size, 3), np.uint8)
    persons = []
    for pid, box, who, face_w in people:
        x1, y1, x2, y2 = box
        if who:
            cx = (x1 + x2) // 2
            cv2.rectangle(img, (cx - face_w // 2, y1 + 5), (cx + face_w // 2, y1 + 5 + face_w), COLOURS[who], -1)
        persons.append(SimpleNamespace(id=pid, box=np.array(box, np.float32), held=False))
    return img, persons


def run(ident, people, frames):
    for _ in range(frames):
        img, persons = scene(people)
        ident.update(img, persons)


def test_known_person_needs_several_faces_then_gets_a_name():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), fi.FaceSettings(try_every=1, min_samples=3))
    people = [(1, (100, 100, 220, 500), "Alice", 50)]
    run(ident, people, 2)
    assert ident.label(1)["status"] == "pending"
    run(ident, people, 1)
    assert ident.label(1) == dict(status="known", name="Alice", score=1.0)
    assert ident.summary()["identified"]["Alice"]["person_ids"] == [1]


def test_someone_not_enrolled_is_unknown():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), fi.FaceSettings(try_every=1, min_samples=3))
    run(ident, [(1, (100, 100, 220, 500), "Stranger", 50)], 3)
    assert ident.label(1)["status"] == "unknown" and ident.label(1)["name"] is None


def test_small_faces_and_held_people_are_skipped_and_the_budget_holds():
    engine = ColourEngine()
    ident = fi.FaceIdentifier(engine, gallery("Alice", "Bob", "Carol"),
                              fi.FaceSettings(try_every=1, min_samples=1, max_per_frame=2, min_face_px=24))
    img, persons = scene([(1, (100, 100, 220, 500), "Alice", 50), (2, (400, 100, 520, 500), "Bob", 50),
                          (3, (700, 100, 820, 500), "Carol", 50), (4, (1000, 100, 1120, 500), "Alice", 12)])
    persons[2].held = True
    ident.update(img, persons)
    assert engine.calls == 2  # budget
    ident.update(img, persons)
    labels = {pid: ident.label(pid)["status"] for pid in (1, 2, 3, 4)}
    assert labels == {1: "known", 2: "known", 3: "pending", 4: "pending"}  # 3 is held, 4's face is too small


def test_a_neighbours_face_in_the_crop_is_not_theirs():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), fi.FaceSettings(try_every=1, min_samples=1))
    img, persons = scene([(1, (100, 100, 220, 500), None, 0)])
    cv2.rectangle(img, (225, 110), (260, 145), COLOURS["Bob"], -1)  # just right of the box, in the widened crop
    ident.update(img, persons)
    assert ident.label(1)["status"] == "pending"


def test_a_box_holding_two_faces_is_left_alone_unless_one_is_far_behind():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), fi.FaceSettings(try_every=1, min_samples=1))
    img, persons = scene([(1, (100, 100, 400, 600), None, 0)])
    cv2.rectangle(img, (150, 110), (200, 160), COLOURS["Alice"], -1)
    cv2.rectangle(img, (300, 110), (345, 155), COLOURS["Bob"], -1)
    ident.update(img, persons)
    assert ident.label(1)["status"] == "pending"
    img, persons = scene([(2, (100, 100, 400, 600), None, 0)])
    cv2.rectangle(img, (150, 110), (210, 170), COLOURS["Alice"], -1)
    cv2.rectangle(img, (300, 110), (325, 135), COLOURS["Bob"], -1)  # small: someone further back
    ident.update(img, persons)
    assert ident.label(2)["name"] == "Alice"


def test_when_the_id_passes_to_someone_else_it_is_decided_again():
    s = fi.FaceSettings(try_every=1, recheck_every=1, min_samples=2, switch_votes=2)
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), s)
    run(ident, [(1, (100, 100, 220, 500), "Alice", 50)], 2)
    assert ident.label(1)["name"] == "Alice"
    run(ident, [(1, (100, 100, 220, 500), "Bob", 50)], 1)
    assert ident.label(1)["name"] == "Alice"  # one odd look is not enough
    run(ident, [(1, (100, 100, 220, 500), "Bob", 50)], 3)
    assert ident.label(1)["name"] == "Bob"


def test_one_enrolled_person_is_never_two_people():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), fi.FaceSettings(try_every=1, min_samples=1))
    run(ident, [(1, (100, 100, 220, 500), "Alice", 50), (2, (400, 100, 520, 500), "Alice", 50)], 1)
    names = [ident.label(pid)["name"] for pid in (1, 2)]
    assert names.count("Alice") == 1


def test_people_who_leave_are_forgotten():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice"), fi.FaceSettings(try_every=1, min_samples=1))
    run(ident, [(1, (100, 100, 220, 500), "Alice", 50)], 1)
    run(ident, [], 1)
    assert ident.label(1) is None


def test_threaded_mode_gives_the_same_answer():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice", "Bob"), fi.FaceSettings(try_every=1, min_samples=2),
                              threaded=True)
    try:
        people = [(1, (100, 100, 220, 500), "Bob", 50)]
        for _ in range(200):
            run(ident, people, 1)
            if ident.label(1)["status"] == "known":
                break
            import time
            time.sleep(0.005)
        assert ident.label(1)["name"] == "Bob"
    finally:
        ident.close()


def test_gallery_from_folders_with_thai_names_and_a_cache(tmp_path):
    for name, who in (("สมชาย", "Alice"), ("Bob", "Bob")):
        d = tmp_path / name
        d.mkdir()
        img = np.zeros((120, 120, 3), np.uint8)
        cv2.rectangle(img, (30, 30), (90, 90), COLOURS[who], -1)
        ok, data = cv2.imencode(".png", img)
        (d / "1.png").write_bytes(data.tobytes())
    (tmp_path / "Bob" / "blank.jpg").write_bytes(cv2.imencode(".jpg", np.zeros((50, 50, 3), np.uint8))[1].tobytes())
    engine = ColourEngine()
    g, problems = fi.Gallery.load(tmp_path, engine, log=None)
    assert g.people == ["Bob", "สมชาย"]
    assert problems == ["Bob/blank.jpg: no face found"]
    assert g.match(fi.normalise(COLOURS["Alice"]))[0][0] == "สมชาย"
    calls = engine.calls
    g2, _ = fi.Gallery.load(tmp_path, engine, log=None)
    assert engine.calls == calls and g2.people == g.people  # from the cache


def test_snapshot_carries_the_face_label():
    from app.snapshot import _person
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice"), fi.FaceSettings(try_every=1, min_samples=1))
    run(ident, [(7, (100, 100, 220, 500), "Alice", 50)], 1)
    tr = SimpleNamespace(id=7, kpts=None, state="sitting", conf=0.9, box=[0, 0, 1, 1], trail=[], ground=(0, 0), smooth=(0, 0),
                         floor_trail=[], speed=0.0, zone=None)
    assert _person(tr, ident)["face"]["name"] == "Alice"
    assert _person(tr)["face"] is None


MODELS = Path(os.path.expanduser("~/.insightface/models/buffalo_l"))


@pytest.mark.skipif(not MODELS.is_dir(), reason="insightface buffalo_l not downloaded")
def test_real_insightface_matches_the_same_face(tmp_path):
    insightface = pytest.importorskip("insightface")
    images = Path(insightface.__file__).parent / "data" / "images"
    (tmp_path / "Tom").mkdir()
    (tmp_path / "Tom" / "a.png").write_bytes((images / "Tom_Hanks_54745.png").read_bytes())
    engine = fi.InsightFaceEngine()
    g, _ = fi.Gallery.load(tmp_path, engine, log=None)
    tom = cv2.flip(cv2.imread(str(images / "Tom_Hanks_54745.png")), 1)
    assert g.match(engine.faces(tom)[0].embedding)[0][1] > engine.threshold
    group = cv2.imread(str(images / "t1.jpg"))
    assert all(g.match(f.embedding)[0][1] < engine.threshold for f in engine.faces(group))


def test_a_new_gallery_applies_on_the_next_frame():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice"), fi.FaceSettings(try_every=1, min_samples=1))
    people = [(1, (100, 100, 220, 500), "Alice", 50), (2, (400, 100, 520, 500), "Bob", 50)]
    run(ident, people, 1)
    assert (ident.label(1)["name"], ident.label(2)["status"]) == ("Alice", "unknown")
    ident.set_gallery(gallery("Bob"))  # Alice withdrew, Bob enrolled
    run(ident, people, 1)
    assert (ident.label(1)["status"], ident.label(2)["name"]) == ("unknown", "Bob")


def test_a_new_threshold_applies_on_the_next_frame():
    ident = fi.FaceIdentifier(ColourEngine(), gallery("Alice"), fi.FaceSettings(try_every=1, min_samples=1))
    people = [(1, (100, 100, 220, 500), "AliceLike", 50)]  # similarity 0.97 to Alice
    run(ident, people, 1)
    assert ident.label(1)["name"] == "Alice"
    ident.set_threshold(0.99)
    run(ident, people, 1)
    assert ident.label(1)["status"] == "unknown"
    ident.set_threshold(None)  # back to the engine's 0.9
    run(ident, people, 1)
    assert ident.label(1)["name"] == "Alice"


def test_similarity_report_finds_alike_people_and_odd_photos():
    names = ["Alice", "Alice", "Alice", "AliceLike", "Bob"]
    photos = ["a1.jpg", "a2.jpg", "odd.jpg", "l1.jpg", "b1.jpg"]
    colours = [COLOURS["Alice"], COLOURS["Alice"], COLOURS["Bob"], COLOURS["AliceLike"], COLOURS["Bob"]]
    g = fi.Gallery(names, np.array([fi.normalise(c) for c in colours]), photos)
    r = fi.similarity_report(g)
    assert r["pairs"][0]["score"] == 1.0  # Alice's odd photo is Bob's face
    assert {r["pairs"][0]["a"], r["pairs"][0]["b"]} == {"Alice", "Bob"}
    assert r["closest"]["AliceLike"]["name"] == "Alice"
    alice = r["photos"]["Alice"]
    assert alice["odd.jpg"] == 0.0 and alice["a1.jpg"] == 0.5
    assert r["photos"]["Bob"] == {"b1.jpg": None}  # one photo: nothing to compare with


class PoseEngine(fi.FaceEngine):
    """Frame i (pixel [0, 0, 0] = i) holds the face described by script[i]: (yaw, pitch, who, width, count)."""
    name = "pose"
    threshold = 0.9

    def __init__(self, script):
        self.script = script

    def faces(self, image):
        yaw, pitch, who, width, count = self.script[int(image[0, 0, 0])]
        out = []
        for k in range(count):
            x, y = 200 + 300 * k, 100
            w = width if k == 0 else width * 0.8
            eyes = np.array([[x + 0.3 * w, y + 0.4 * w], [x + 0.7 * w, y + 0.4 * w]])
            mid = eyes.mean(axis=0)
            nose = [mid[0] + yaw * 0.4 * w, mid[1] + pitch * 0.4 * w]
            kps = np.array([*eyes, nose, [x + 0.35 * w, y + 0.8 * w], [x + 0.65 * w, y + 0.8 * w]], np.float32)
            out.append(fi.Face(np.array([x, y, x + w, y + w], np.float32), kps, 0.9, fi.normalise(COLOURS[who])))
        return out


def frames(n, blurred=()):
    rng = np.random.default_rng(0)
    out = []
    for i in range(n):
        img = rng.integers(0, 255, (480, 640, 3), dtype=np.uint8)
        if i in blurred:
            img = cv2.GaussianBlur(img, (0, 0), 5)
        img[0, 0, 0] = i
        out.append(img)
    return out


def test_camera_enrolment_keeps_one_sharp_frame_per_pose_and_drops_bad_ones():
    script = [
        (0.0, 0.5, "Alice", 150, 1), (0.02, 0.5, "Alice", 150, 1),   # straight
        (0.4, 0.5, "Alice", 150, 1), (-0.4, 0.5, "Alice", 150, 1),   # their left, their right
        (0.0, 0.3, "Alice", 150, 1), (0.0, 0.7, "Alice", 150, 1),    # up, down
        (0.0, 0.5, "Alice", 150, 0),                                 # looked away
        (0.0, 0.5, "Alice", 150, 2),                                 # someone beside them
        (0.0, 0.5, "Alice", 30, 1),                                  # too far
        (1.2, 0.5, "Alice", 150, 1),                                 # full profile
        (0.0, 0.5, "Alice", 150, 1),                                 # motion blur
        (0.0, 0.5, "Bob", 150, 1),                                   # someone else in front
    ]
    r = fi.select_enrolment_frames(PoseEngine(script), frames(len(script), blurred={10}), keep=6)
    assert r["rejected"] == dict(no_face=1, many_faces=1, small=1, too_turned=1, blurry=1, other_person=1)
    assert r["coverage"] == dict(center=True, left=True, right=True, up=True, down=True)
    poses = [s["pose"] for s in r["selected"]]
    assert poses == ["center", "center", "left", "right", "up", "down"]
    assert {s["index"] for s in r["selected"]} == {0, 1, 2, 3, 4, 5}
