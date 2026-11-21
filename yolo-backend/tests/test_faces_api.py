"""Enrolment over REST, with the colour engine from test_face_id standing in for the face model."""
import json

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import face_id
from app import main
from test_face_id import COLOURS, ColourEngine


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main.faces, "root", tmp_path / "faces")
    monkeypatch.setattr(face_id, "shared_engine", lambda *a, **k: ColourEngine())
    with TestClient(main.app) as c:
        yield c


def photo(who=None):
    img = np.zeros((120, 120, 3), np.uint8)
    if who:
        cv2.rectangle(img, (30, 30), (90, 90), COLOURS[who], -1)
    return cv2.imencode(".jpg", img)[1].tobytes()


def enrol(client, name, photos, consent=True):
    files = [("files", (f"p{i}.jpg", data, "image/jpeg")) for i, data in enumerate(photos)]
    return client.post("/api/faces", data={"name": name, "consent": str(consent).lower()}, files=files)


def test_enrol_list_view_and_delete(client):
    r = enrol(client, "  สมชาย  ใจดี ", [photo("Alice"), photo("Alice"), photo()])
    assert r.status_code == 200, r.text
    assert r.json() == dict(name="สมชาย ใจดี", added=2, problems=["p2.jpg: ไม่พบใบหน้า ไม่ได้บันทึกรูปนี้"])

    listing = client.get("/api/faces").json()
    assert listing["engine"] == "colour" and listing["consent"]["text"]
    (person,) = listing["people"]
    assert person["name"] == "สมชาย ใจดี" and len(person["photos"]) == 2 and person["consentAt"]

    record = json.loads((main.faces.root / "สมชาย ใจดี" / "consent.json").read_text(encoding="utf-8"))
    assert record[0]["text"] == listing["consent"]["text"] and len(record[0]["photos"]) == 2

    assert client.get(f"/api/faces/สมชาย ใจดี/photos/{person['photos'][0]}").status_code == 200
    assert client.get("/api/faces/สมชาย ใจดี/photos/..%2Fconsent.json").status_code == 404

    gallery, _ = face_id.Gallery.load(main.faces.root, ColourEngine(), log=None)
    assert gallery.people == ["สมชาย ใจดี"]  # the folder the live session reads

    assert enrol(client, "สมชาย ใจดี", [photo("Alice")]).json()["added"] == 1  # more photos later
    client.delete(f"/api/faces/สมชาย ใจดี/photos/{person['photos'][0]}")
    assert len(client.get("/api/faces").json()["people"][0]["photos"]) == 2
    assert client.delete("/api/faces/สมชาย ใจดี").status_code == 200
    assert client.get("/api/faces").json()["people"] == []


@pytest.mark.parametrize("name, photos, consent, message", [
    ("Bob", [photo("Bob")], False, "PDPA"),
    ("Bob", [], True, "อย่างน้อย 1 รูป"),
    ("", [photo("Bob")], True, "ตั้งชื่อ"),
    ("../evil", [photo("Bob")], True, "ห้ามมีอักขระ"),
    ("CON", [photo("Bob")], True, "Windows"),
    ("Bob", [photo(), photo()], True, "ไม่มีรูปที่ใช้ได้"),
])
def test_rejected_enrolments_leave_nothing_behind(client, name, photos, consent, message):
    r = enrol(client, name, photos, consent)
    assert r.status_code == 422 and message in r.json()["detail"]
    assert client.get("/api/faces").json()["people"] == []


def test_a_running_session_is_told(client, monkeypatch):
    told = []
    fake = type("S", (), {"faces_changed": lambda self: told.append(1), "stop": lambda self, timeout=0: True})()
    monkeypatch.setattr(main.app.state.manager, "session", fake)
    enrol(client, "Bob", [photo("Bob")])
    assert told == [1]


def test_threshold_is_saved_per_engine_and_told_to_the_session(client, monkeypatch, tmp_path):
    monkeypatch.setattr(main.face_tuning, "path", tmp_path / "face_settings.json")
    told = []
    fake = type("S", (), {"faces_changed": lambda self: told.append(1), "stop": lambda self, timeout=0: True})()
    monkeypatch.setattr(main.app.state.manager, "session", fake)
    assert client.get("/api/faces").json()["threshold"] == ColourEngine.threshold
    assert client.put("/api/faces/threshold", json={"threshold": 0.55}).json() == dict(threshold=0.55,
                                                                                       defaultThreshold=0.9)
    assert told == [1] and client.get("/api/faces").json()["threshold"] == 0.55
    assert client.put("/api/faces/threshold", json={"threshold": 2}).status_code == 422
    assert client.put("/api/faces/threshold", json={"threshold": None}).json()["threshold"] == 0.9


def test_check_lists_alike_pairs_and_photo_scores(client):
    enrol(client, "Alice", [photo("Alice"), photo("Alice")])
    enrol(client, "Bob", [photo("Bob")])
    r = client.get("/api/faces/check").json()
    assert r["pairs"] == [dict(a="Alice", b="Bob", score=0.0)]
    assert list(r["photos"]["Alice"].values()) == [1.0, 1.0]


def test_session_applies_the_saved_threshold_when_opening_and_reloading(tmp_path, monkeypatch):
    from app import config, session as session_mod
    from app.faces import FaceTuning
    from test_face_id import gallery, run

    monkeypatch.setattr(config, "FACE_TUNING", tmp_path / "face_settings.json")
    FaceTuning(config.FACE_TUNING).set_threshold("colour", 0.8)
    ident = face_id.FaceIdentifier(ColourEngine(), gallery("Alice"), face_id.FaceSettings(try_every=1, min_samples=1))
    monkeypatch.setattr(face_id, "open_identifier", lambda *a, **k: ident)
    s = session_mod.Session.__new__(session_mod.Session)
    s.faces, s._faces_dirty = None, True
    s._reload_faces()  # nobody was enrolled when the session started
    run(ident, [], 1)
    assert s.faces is ident and ident.threshold == 0.8

    FaceTuning(config.FACE_TUNING).set_threshold("colour", 0.5)
    monkeypatch.setattr(face_id.Gallery, "load", classmethod(lambda cls, *a, **k: (gallery("Alice", "Bob"), [])))
    s._reload_faces()
    run(ident, [], 1)
    assert ident.threshold == 0.5 and ident.gallery.people == ["Alice", "Bob"]


def test_capture_picks_frames_without_storing_anything(client):
    frames = [("frames", (f"f{i}.jpg", photo("Alice" if i % 2 else None), "image/jpeg")) for i in range(6)]
    r = client.post("/api/faces/capture", files=frames).json()
    assert r["total"] == 6 and r["rejected"]["no_face"] == 3 and r["usable"] == 3
    assert {s["index"] for s in r["selected"]} <= {1, 3, 5}
    assert client.get("/api/faces").json()["people"] == []
