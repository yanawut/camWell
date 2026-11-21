"""The clip player: looping, the position and length the page shows, and seeking."""
import json
import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.session import Session, State
from app.settings import default_settings
from app.sources import VideoSource, VideoSpec
from app.uploads import UploadStore

FPS = 10


def make_clip(path, frames):
    """Each frame a different grey, so a frame can be told by its brightness."""
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (64, 48))
    for i in range(frames):
        writer.write(np.full((48, 64, 3), 10 + i * 12, np.uint8))
    writer.release()
    return path


def read_all(source, limit):
    frames = []
    while len(frames) < limit:
        frame = source.read()
        if frame is None:
            break
        frames.append(frame)
    return frames


def test_a_clip_ends_after_its_last_frame_by_default(tmp_path):
    clip = make_clip(tmp_path / "clip.mp4", 5)
    assert len(read_all(VideoSource(clip, "clip.mp4"), 15)) == 5


def test_a_looping_clip_starts_again_and_time_keeps_going(tmp_path):
    clip = make_clip(tmp_path / "clip.mp4", 5)
    frames = read_all(VideoSource(clip, "clip.mp4", loop=True), 15)
    assert len(frames) == 15, "the clip stopped instead of starting again"
    times = [f.t for f in frames]
    assert times == sorted(times) and len(set(times)) == len(times), "analytics time ran backwards at the seam"
    assert frames[5].image.mean() == pytest.approx(frames[0].image.mean(), abs=6), "it did not go back to frame 0"


def test_loop_is_off_unless_asked():
    assert VideoSpec(upload_id="x").loop is False
    assert VideoSpec(upload_id="x", loop=True).loop is True


def test_a_clip_knows_its_length_and_where_it_is(tmp_path):
    source = VideoSource(make_clip(tmp_path / "clip.mp4", 20), "clip.mp4", loop=True)
    assert source.seekable and source.duration == pytest.approx(2.0)
    read_all(source, 3)
    assert source.position == pytest.approx(0.2)
    read_all(source, 20)  # past the end and round again
    assert source.position == pytest.approx(0.2)


def test_seek_moves_the_clip_but_not_analytics_time(tmp_path):
    source = VideoSource(make_clip(tmp_path / "clip.mp4", 20), "clip.mp4")
    first = source.read()
    source.seek(1.5)
    frame = source.read()
    assert source.position == pytest.approx(1.5)
    assert frame.image.mean() == pytest.approx(10 + 15 * 12, abs=6), "it did not read frame 15"
    assert frame.t > first.t
    source.seek(99)
    assert source.read() is not None, "seeking past the end should land on the last frame"


class FakeRunner:
    """Stands in for YOLO so the test needs no GPU: nobody is ever found."""

    def __init__(self, cfg):
        self.layers = dict(dets=[], tracks=[], shown=[])

    def __call__(self, image):
        return [], []


def wait_for(predicate, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError("timed out")


def test_seeking_while_paused_shows_the_frame_there(tmp_path, monkeypatch):
    monkeypatch.setattr("app.session.ra.YoloRunner", FakeRunner)
    uploads = UploadStore(tmp_path / "u", 10**8)
    with open(make_clip(tmp_path / "clip.mp4", 20), "rb") as fh:
        uid = uploads.save("clip.mp4", fh)["id"]
    sent = []
    sink = type("Sink", (), {"status": lambda self, s: None,
                             "frame": lambda self, text, jpeg: sent.append(json.loads(text))})()
    session = Session(VideoSpec(upload_id=uid, loop=True), uploads, default_settings(), tmp_path / "r", sink=sink)
    session.start()
    try:
        wait_for(lambda: session.state == State.RUNNING and sent)
        assert sent[-1]["clip"]["duration"] == pytest.approx(2.0)
        session.pause()
        time.sleep(0.3)  # let a frame already in flight land
        before = len(sent)
        session.seek(1.2)
        wait_for(lambda: len(sent) > before)
        assert sent[-1]["clip"]["pos"] == pytest.approx(1.2)
        assert session.state == State.PAUSED, "seeking must not start playback"
    finally:
        session.stop()


def test_seek_is_refused_for_sources_without_a_timeline():
    with TestClient(app) as client:
        assert client.post("/api/session/seek", json={"t": 1}).status_code == 409  # nothing open yet
        client.post("/api/session", json={"kind": "sim", "seconds": 30})
        r = client.post("/api/session/seek", json={"t": 1})
        assert r.status_code == 409 and "เลื่อนเวลาไม่ได้" in r.json()["detail"]
        assert client.post("/api/session/seek", json={"t": -1}).status_code == 422
        client.post("/api/session/stop")
