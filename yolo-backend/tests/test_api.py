"""Drives the real app over REST and WebSocket. The YOLO cases use the clips in resource/ and need the GPU."""
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

RESOURCE = Path(__file__).resolve().parents[2] / "resource"
needs_clips = pytest.mark.skipif(not (RESOURCE / "example clip 3.mp4").exists(), reason="sample clips not present")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def next_pair(ws):
    """Skip status messages and return one (snapshot, decoded image) pair."""
    while True:
        msg = ws.receive()
        if msg.get("text") and json.loads(msg["text"])["type"] == "snapshot":
            snapshot = json.loads(msg["text"])
            data = ws.receive()["bytes"]
            return snapshot, cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def wait_state(client, *states, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = client.get("/api/session").json()
        if s["state"] in states:
            return s
        time.sleep(0.05)
    raise AssertionError(f"never reached {states}, last {s}")


def upload(client, path):
    with open(path, "rb") as fh:
        r = client.post("/api/uploads", files={"file": (path.name, fh)})
    assert r.status_code == 200, r.text
    return r.json()


def test_foreign_origin_is_refused(client):
    assert client.get("/api/settings", headers={"origin": "http://evil.example"}).status_code == 403
    assert client.get("/api/settings", headers={"origin": "http://localhost:5173"}).status_code == 200


@pytest.mark.parametrize("name,code", [("x.exe", 415), ("../../evil.mp4.sh", 415)])
def test_bad_uploads_are_refused(client, name, code):
    assert client.post("/api/uploads", files={"file": (name, b"x")}).status_code == code


@pytest.mark.parametrize("body", [
    dict(kind="nope"),
    dict(kind="go2rtc", url="file:///etc/passwd"),
    dict(kind="video", upload_id="../../secret"),
    dict(kind="video", upload_id="0" * 32),
])
def test_bad_sources_are_refused(client, body):
    assert client.post("/api/session", json=body).status_code == 422


def test_a_new_source_is_refused_while_the_old_one_cannot_stop(client):
    class Stuck:
        def stop(self):
            return False

    manager = client.app.state.manager
    manager.session = stuck = Stuck()
    assert client.post("/api/session", json=dict(kind="sim")).status_code == 409
    assert manager.session is stuck, "the stuck session must stay tracked"
    manager.session = None


def test_the_default_settings_can_be_read_for_a_reset(client):
    defaults = client.get("/api/settings/defaults").json()
    assert len(defaults["floor_pts"]) == 4 and defaults["floor_area"] is None
    assert [z["name"] for z in defaults["zones"]] == ["Zone A"]


def test_invalid_settings_are_refused_and_not_saved(client):
    before = client.get("/api/settings").json()
    bad = {**before, "floor_pts": [[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]]}
    assert client.put("/api/settings", json=bad).status_code == 422
    assert client.get("/api/settings").json() == before


def test_sim_streams_json_then_jpeg_and_pause_stops_frames(client):
    assert client.post("/api/session", json=dict(kind="sim")).status_code == 200
    with client.websocket_connect("/ws/live") as ws:
        snapshot, image = next_pair(ws)
        assert image.shape == (720, 1280, 3)
        assert snapshot["size"] == [1280, 720]
        assert snapshot["badge"] == "SIM"
        assert snapshot["people"] and {"id", "state", "box", "trail", "ground", "floor"} <= set(snapshot["people"][0])
        assert set(snapshot["floor"]["zones"]) == {"Desk area", "Meeting", "Lounge"}

        assert client.post("/api/session/pause").json()["state"] == "paused"
        session = client.app.state.manager.session
        time.sleep(0.2)
        frozen_at = session._index
        time.sleep(0.5)
        assert session._index == frozen_at, "frames kept flowing while paused"
        assert client.post("/api/session/pause").status_code == 409
        assert client.post("/api/session/resume").json()["state"] == "running"
        later, _ = next_pair(ws)
        assert later["frame"] > snapshot["frame"]
    assert client.post("/api/session/stop").json()["state"] == "ended"
    rows = client.get("/api/reports").json()
    assert rows[0]["source"]["kind"] == "sim" and rows[0]["frames"] > 0


@needs_clips
def test_settings_apply_to_a_running_video_immediately(client):
    uid = upload(client, RESOURCE / "example clip 3.mp4")["id"]
    client.post("/api/session", json=dict(kind="video", upload_id=uid))
    with client.websocket_connect("/ws/live") as ws:
        first, image = next_pair(ws)
        assert first["size"] == [image.shape[1], image.shape[0]]
        assert first["people"], "YOLO found nobody in a clip with people in it"
        assert first["floor"]["w"] == 8.0

        new = dict(floor_pts=[[0.1, 0.3], [0.9, 0.3], [0.99, 0.99], [0.01, 0.99]], floor_size_m=[12, 9],
                   zones=[dict(name="Only", box=[0, 0, 20, 20])])
        assert client.put("/api/settings", json=new).status_code == 200
        deadline = time.time() + 5
        while time.time() < deadline:
            snapshot, _ = next_pair(ws)
            if snapshot["floor"]["w"] == 12:
                break
        assert snapshot["floor"]["w"] == 12 and set(snapshot["floor"]["zones"]) == {"Only"}
    client.post("/api/session/stop")
    assert client.get("/api/settings").json()["floor_size_m"] == [12.0, 9.0], "new settings were not persisted"


@needs_clips
def test_video_runs_to_the_end_and_writes_a_report(client):
    uid = upload(client, RESOURCE / "example clip 3.mp4")["id"]
    client.post("/api/session", json=dict(kind="video", upload_id=uid))
    status = wait_state(client, "ended", "error", timeout=120)
    assert status["state"] == "ended", status
    report = client.get(f"/api/reports/{status['reportIds'][-1]}").json()
    cap = cv2.VideoCapture(str(RESOURCE / "example clip 3.mp4"))
    real_frames = 0  # CAP_PROP_FRAME_COUNT is only an estimate: it says 314 for this 311 frame file
    while cap.read()[0]:
        real_frames += 1
    cap.release()
    assert report["frames"] == real_frames
    assert report["people"] and report["timeline"]
    csv = client.get(f"/api/reports/{report['id']}/tracks.csv")
    assert csv.status_code == 200 and csv.content.decode("utf-8-sig").startswith("frame,t,id,state")


@needs_clips
def test_image_is_analysed_once_and_held(client, tmp_path):
    cap = cv2.VideoCapture(str(RESOURCE / "example clip 3.mp4"))
    ok, frame = cap.read()
    cap.release()
    path = tmp_path / "office.jpg"
    cv2.imencode(".jpg", frame)[1].tofile(str(path))
    uid = upload(client, path)["id"]
    client.post("/api/session", json=dict(kind="image", upload_id=uid))
    wait_state(client, "holding")
    with client.websocket_connect("/ws/live") as ws:
        snapshot, image = next_pair(ws)
    assert snapshot["people"], "nobody detected"
    assert {p["state"] for p in snapshot["people"]} <= {"sitting", "standing"}
    assert snapshot["objects"], "no furniture detected"
    assert "heat" in snapshot
    assert client.post("/api/session/pause").status_code == 409
    assert client.post("/api/session/stop").json()["state"] == "ended"


def test_missing_stream_fails_with_a_message_not_a_hang(client):
    client.post("/api/session", json=dict(kind="go2rtc", url="rtsp://127.0.0.1:1/none"))
    status = wait_state(client, "ended", "error", timeout=30)
    assert status["state"] == "error" and "เปิดสตรีมไม่ได้" in status["error"]
