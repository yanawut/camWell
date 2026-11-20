"""Where frames come from. Each SourceSpec kind maps to one Source class in OPENERS."""
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Annotated, Literal, Union

import cv2
import numpy as np
from pydantic import BaseModel, Field

import room_analytics as ra

from .go2rtc import redact, stream_candidates
from .settings import FloorSettings
from .uploads import UploadStore

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
STREAM_TIMEOUT_MS = 5000
STREAM_LOST_AFTER_S = 10.0


class SimSpec(BaseModel):
    kind: Literal["sim"] = "sim"
    people: int = Field(7, ge=1, le=12)
    seed: int = 7
    seconds: float | None = Field(None, gt=0)  # None runs until stopped


class VideoSpec(BaseModel):
    kind: Literal["video"] = "video"
    upload_id: str


class ImageSpec(BaseModel):
    kind: Literal["image"] = "image"
    upload_id: str


class BrowserSpec(BaseModel):
    kind: Literal["browser"] = "browser"


class Go2rtcSpec(BaseModel):
    kind: Literal["go2rtc"] = "go2rtc"
    url: str


SourceSpec = Annotated[Union[SimSpec, VideoSpec, ImageSpec, BrowserSpec, Go2rtcSpec], Field(discriminator="kind")]


class SourceError(RuntimeError):
    pass


@dataclass
class Frame:
    image: np.ndarray
    t: float
    dets: tuple | None = field(default=None)  # (persons, objects) when the source already knows them


class Source:
    kind = ""
    label = ""
    fps = 30.0
    paced = False   # release frames at source speed instead of as fast as they can be analysed
    live = False    # wall-clock source, so analytics time step follows the measured rate
    holds = False   # keep the last frame on screen after the source runs out
    badge = "LIVE"
    needs_detector = True
    uses_settings = True

    def read(self) -> Frame | None:
        raise NotImplementedError

    def configure(self, cfg: ra.Config, settings: FloorSettings, frame_size) -> ra.Config:
        return settings.apply(cfg, frame_size)

    def push(self, data: bytes) -> None:
        pass

    def interrupt(self) -> None:
        """Safe from any thread: make a blocked read() return."""

    def close(self) -> None:
        """Worker thread only: a capture must not be released while it is being read."""


class SimSource(Source):
    kind, paced, badge, needs_detector, uses_settings = "sim", True, "SIM", False, False

    def __init__(self, spec: SimSpec):
        self.fps = 25
        self.sim = ra.OfficeSim(spec.people, (1280, 720), self.fps, spec.seed)
        self.remaining = int(spec.seconds * self.fps) if spec.seconds else None
        self.label = f"Simulator ({spec.people} คน)"

    def read(self):
        if self.remaining is not None:
            if self.remaining <= 0:
                return None
            self.remaining -= 1
        image, persons, objects, t = self.sim.step()
        return Frame(image, t, (persons, objects))

    def configure(self, cfg, settings, frame_size):
        return self.sim.config(cfg)  # the synthetic scene has its own fixed geometry


class VideoSource(Source):
    kind, paced = "video", True

    def __init__(self, path, name):
        self.label = name
        self.cap = cv2.VideoCapture(str(path))
        if not self.cap.isOpened():
            raise SourceError(f"เปิดไฟล์วิดีโอไม่ได้: {name}")
        fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.fps = fps if 1 <= fps <= 240 else 30.0
        self.index = 0

    def read(self):
        ok, image = self.cap.read()
        if not ok:
            return None
        frame = Frame(image, self.index / self.fps)
        self.index += 1
        return frame

    def close(self):
        self.cap.release()


class ImageSource(Source):
    kind, holds = "image", True

    def __init__(self, path, name):
        self.label = name
        self.image = cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_COLOR)
        if self.image is None:
            raise SourceError(f"อ่านไฟล์รูปไม่ได้: {name}")

    def read(self):
        image, self.image = self.image, None
        return None if image is None else Frame(image, 0.0)


class StreamSource(Source):
    """Network stream. A capture thread keeps only the newest frame, so a slow analysis
    drops frames instead of falling further and further behind real time."""
    kind, live = "go2rtc", True

    def __init__(self, link: str):
        tried = []
        self.cap = None
        for url in stream_candidates(link):
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG, [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, STREAM_TIMEOUT_MS,
                                                         cv2.CAP_PROP_READ_TIMEOUT_MSEC, STREAM_TIMEOUT_MS])
            if cap.isOpened():
                self.cap, self.label = cap, redact(url)
                break
            cap.release()
            tried.append(redact(url))
        if self.cap is None:
            raise SourceError("เปิดสตรีมไม่ได้: " + ", ".join(tried))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 15.0
        if not 1 <= self.fps <= 240:
            self.fps = 15.0
        self.t0 = time.monotonic()
        self.latest = None
        self.ready = threading.Event()
        self.closed = threading.Event()
        self.thread = threading.Thread(target=self._capture, daemon=True)
        self.thread.start()

    def _capture(self):
        while not self.closed.is_set():
            ok, image = self.cap.read()
            if not ok:
                break
            self.latest = image
            self.ready.set()
        self.cap.release()

    def read(self):
        deadline = time.monotonic() + STREAM_LOST_AFTER_S
        while not self.ready.wait(0.2):
            if self.closed.is_set():
                return None
            if time.monotonic() > deadline or not self.thread.is_alive():
                raise SourceError(f"สตรีมหลุด: {self.label}")
        self.ready.clear()
        return Frame(self.latest, time.monotonic() - self.t0)

    def interrupt(self):
        self.closed.set()

    close = interrupt


class BrowserSource(Source):
    """Frames pushed by the browser over the WebSocket; only the newest one is kept."""
    kind, live, label = "browser", True, "กล้องจาก browser"

    def __init__(self):
        self.fps = 15.0
        self.t0 = time.monotonic()
        self.latest = None
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.closed = threading.Event()

    def push(self, data: bytes):
        with self.lock:
            self.latest = data
        self.ready.set()

    def read(self):
        while True:
            while not self.ready.wait(0.2):
                if self.closed.is_set():
                    return None
            self.ready.clear()
            with self.lock:
                data = self.latest
            image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if image is not None:
                return Frame(image, time.monotonic() - self.t0)

    def interrupt(self):
        self.closed.set()

    close = interrupt


def open_source(spec, uploads: UploadStore) -> Source:
    openers = {
        "sim": lambda: SimSource(spec),
        "video": lambda: VideoSource(*uploads.resolve(spec.upload_id, "video")),
        "image": lambda: ImageSource(*uploads.resolve(spec.upload_id, "image")),
        "browser": BrowserSource,
        "go2rtc": lambda: StreamSource(spec.url),
    }
    return openers[spec.kind]()
