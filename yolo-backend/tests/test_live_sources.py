"""Live sources end to end. By default the go2rtc links hit tests/fake_go2rtc.py.
To also check a real server: set GO2RTC_URL=http://host:1984 and GO2RTC_CAMERA=<camera name>."""
import os
import time
from urllib.parse import urlsplit

import cv2
import pytest
from fastapi.testclient import TestClient

from app.main import app
from fake_go2rtc import FakeGo2rtc
from test_api import RESOURCE, needs_clips, next_pair, wait_state

CLIP = RESOURCE / "example clip 4.mp4"
REAL_URL = os.environ.get("GO2RTC_URL")
REAL_CAMERA = os.environ.get("GO2RTC_CAMERA", "")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def fake():
    with FakeGo2rtc(CLIP) as server:
        yield server


@pytest.fixture
def fake_links(fake, monkeypatch):
    monkeypatch.setattr("app.go2rtc.RTSP_PORT", fake.rtsp_port)
    return fake


def watch_stream(client, url, frames=30):
    assert client.post("/api/session", json=dict(kind="go2rtc", url=url)).status_code == 200
    status = wait_state(client, "running", "error", timeout=30)
    assert status["state"] == "running", status
    with client.websocket_connect("/ws/live") as ws:
        pairs = [next_pair(ws) for _ in range(frames)]
    label = client.get("/api/session").json()["source"]["label"]
    assert client.post("/api/session/stop").json()["state"] == "ended"
    return pairs, label


def assert_people_seen(pairs):
    assert all(image is not None and image.size for _, image in pairs)
    assert any(snapshot["people"] for snapshot, _ in pairs), "nobody detected in the stream"
    assert pairs[-1][0]["t"] > pairs[0][0]["t"]


@needs_clips
def test_rtsp_link(client, fake):
    pairs, label = watch_stream(client, f"rtsp://127.0.0.1:{fake.rtsp_port}/clip")
    assert label.startswith("rtsp://")
    assert_people_seen(pairs)


@needs_clips
def test_mjpeg_link(client, fake):
    pairs, label = watch_stream(client, f"{fake.base}/api/stream.mjpeg?src=clip")
    assert label.startswith("http://")
    assert_people_seen(pairs)


@needs_clips
def test_page_link_opens_the_rtsp_stream(client, fake_links):
    pairs, label = watch_stream(client, f"{fake_links.base}/stream.html?src=clip")
    assert label == f"rtsp://127.0.0.1:{fake_links.rtsp_port}/clip"
    assert_people_seen(pairs)


@needs_clips
def test_page_link_falls_back_to_mjpeg_when_rtsp_is_unreachable(client, fake, monkeypatch):
    monkeypatch.setattr("app.go2rtc.RTSP_PORT", 1)
    pairs, label = watch_stream(client, f"{fake.base}/stream.html?src=clip", frames=5)
    assert label == f"{fake.base}/api/stream.mjpeg?src=clip"
    assert pairs


@needs_clips
def test_browser_frames_come_back_analysed(client):
    cap = cv2.VideoCapture(str(RESOURCE / "example clip 3.mp4"))
    frames = [cap.read()[1] for _ in range(20)]
    cap.release()
    jpegs = [cv2.imencode(".jpg", f)[1].tobytes() for f in frames]

    assert client.post("/api/session", json=dict(kind="browser")).status_code == 200
    wait_state(client, "running", timeout=30)
    with client.websocket_connect("/ws/live") as ws:
        ws.send_bytes(b"not a jpeg")  # must be ignored, not crash the session
        results = []
        for jpeg in jpegs:
            ws.send_bytes(jpeg)
            results.append(next_pair(ws))
    assert client.get("/api/session").json()["state"] == "running"
    snapshot, image = results[-1]
    assert image.shape == frames[0].shape
    assert snapshot["people"], "nobody detected in the browser frames"
    assert client.post("/api/session/stop").json()["state"] == "ended"


def test_stopping_a_browser_source_that_never_got_a_frame_does_not_hang(client):
    client.post("/api/session", json=dict(kind="browser"))
    wait_state(client, "running", timeout=30)
    started = time.time()
    assert client.post("/api/session/stop").json()["state"] == "ended"
    assert time.time() - started < 5


real_only = pytest.mark.skipif(not (REAL_URL and REAL_CAMERA), reason="GO2RTC_URL and GO2RTC_CAMERA not set")


@real_only
@pytest.mark.parametrize("template", [
    "rtsp://{host}:8554/{cam}",
    "{base}/api/stream.mjpeg?src={cam}",
    "{base}/stream.html?src={cam}",
])
def test_real_go2rtc(client, template):
    host = urlsplit(REAL_URL).hostname
    pairs, _ = watch_stream(client, template.format(host=host, base=REAL_URL.rstrip("/"), cam=REAL_CAMERA))
    assert all(image is not None and image.size for _, image in pairs)
