"""One analysis run on a worker thread, driven as a state machine."""
import json
import threading
import time
import traceback
from enum import Enum
from pathlib import Path

import cv2

import room_analytics as ra

from . import config
from .analytics import AreaAnalytics
from .reports import ReportWriter
from .settings import FloorSettings
from .snapshot import to_message
from .sources import Source, SourceError, open_source
from .uploads import UploadError, UploadStore

RECORD_DRAIN_EVERY = 25
HEAT_EVERY = 10


class State(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    HOLDING = "holding"  # a finished still image, kept open so new settings can re-analyse it
    ENDED = "ended"
    ERROR = "error"


TRANSITIONS = {
    State.STARTING: {State.RUNNING, State.ENDED, State.ERROR},
    State.RUNNING: {State.PAUSED, State.HOLDING, State.ENDED, State.ERROR},
    State.PAUSED: {State.RUNNING, State.ENDED, State.ERROR},
    State.HOLDING: {State.ENDED, State.ERROR},
    State.ENDED: set(),
    State.ERROR: set(),
}
IDLE = (State.PAUSED, State.HOLDING)


class InvalidTransition(RuntimeError):
    pass


class Session:
    def __init__(self, spec, uploads: UploadStore, settings: FloorSettings, reports_root: Path, sink=None, paced=True):
        self.spec, self.uploads, self.settings = spec, uploads, settings
        self.reports_root, self.sink, self.paced = reports_root, sink, paced
        self.state = State.STARTING
        self.error = None
        self.summary = None
        self.report_ids: list[str] = []
        self.source: Source | None = None
        self.analytics: AreaAnalytics | None = None
        self.report: ReportWriter | None = None
        self._cond = threading.Condition()
        self._stop = False
        self._pending: FloorSettings | None = None
        self._seek: float | None = None  # seconds into the clip, applied by the worker before its next read
        self._last = None  # (frame, persons, objects) for re-analysis under new settings
        self._index = 0
        self._fps = 0.0
        self._thread = threading.Thread(target=self._run, daemon=True, name="analysis")

    # ------------------------------------------------------------ control, any thread
    def start(self):
        self._thread.start()

    def join(self, timeout=None):
        self._thread.join(timeout)

    def stop(self, timeout=20) -> bool:
        """Returns False if the worker is still running after the timeout."""
        with self._cond:
            self._stop = True
            self._cond.notify_all()
        if self.source:
            self.source.interrupt()
        self._thread.join(timeout)
        return not self._thread.is_alive()

    def pause(self):
        self._transition(State.PAUSED)

    def resume(self):
        self._transition(State.RUNNING)

    def apply_settings(self, settings: FloorSettings):
        with self._cond:
            self._pending = settings
            self._cond.notify_all()

    def seek(self, t: float):
        """Only the worker may touch the capture, so this just leaves the request for it."""
        with self._cond:
            if not (self.source and self.source.seekable):
                raise InvalidTransition("แหล่งภาพนี้เลื่อนเวลาไม่ได้")
            if self.state not in (State.RUNNING, State.PAUSED):
                raise InvalidTransition(f"{self.state.value} -> seek")
            self._seek = t
            self._cond.notify_all()

    def push_frame(self, data: bytes):
        if self.source:
            self.source.push(data)

    def status(self) -> dict:
        source = self.source
        return dict(type="status", state=self.state.value, error=self.error, summary=self.summary,
                    source=dict(kind=self.spec.kind, label=source.label if source else ""),
                    reportIds=self.report_ids)

    # ------------------------------------------------------------ internals
    def _transition(self, target: State):
        with self._cond:
            if target not in TRANSITIONS[self.state]:
                raise InvalidTransition(f"{self.state.value} -> {target.value}")
            self.state = target
            self._cond.notify_all()
        if self.sink:
            self.sink.status(self.status())

    def _run(self):
        outcome, error = State.ENDED, None
        if self.sink:
            self.sink.status(self.status())
        try:
            self.source = open_source(self.spec, self.uploads)
            runner = None
            if self.source.needs_detector:
                runner = ra.YoloRunner(ra.Config(det_model=config.DET_MODEL, pose_model=config.POSE_MODEL))
            self._transition(State.RUNNING)
            self._loop(runner)
        except (SourceError, UploadError) as exc:
            outcome, error = State.ERROR, str(exc)
        except Exception as exc:
            traceback.print_exc()
            outcome, error = State.ERROR, f"{type(exc).__name__}: {exc}"
        # Whatever failed above, the session must still reach a final state or the UI waits forever
        try:
            self._finish_report(outcome.value)
        except Exception as exc:
            traceback.print_exc()
            outcome, error = State.ERROR, f"บันทึกรายงานไม่สำเร็จ: {exc}"
        if self.source:
            self.source.close()
        self.error = error
        self._transition(outcome)

    def _loop(self, runner):
        last_tick = due = None
        while True:
            with self._cond:
                was_idle = self.state in IDLE
                while not self._stop and self.state in IDLE and self._pending is None and self._seek is None:
                    self._cond.wait()
                if self._stop:
                    return
                pending, self._pending = self._pending, None
                seek, self._seek = self._seek, None
                idle = self.state in IDLE
            if pending is not None:
                self.settings = pending
                if self._last is not None and self.source.uses_settings:
                    self._reanalyse()
            if seek is not None:
                self.source.seek(seek)
                last_tick = due = None
                if idle:
                    # Paused: analyse the one frame there, so the picture follows the slider
                    frame = self.source.read()
                    if frame is not None:
                        self._process(frame, runner)
                    continue
            if idle:
                continue
            if was_idle:
                last_tick = due = None

            frame = self.source.read()
            if frame is None:
                if self._stop or not self.source.holds:
                    return
                self._transition(State.HOLDING)
                continue

            self._process(frame, runner)

            if self.paced and self.source.paced:
                now = time.perf_counter()
                due = now + 1.0 / self.source.fps if due is None else due + 1.0 / self.source.fps
                delay = due - now
                if delay > 0:
                    with self._cond:
                        if not self._stop:
                            self._cond.wait(delay)
                else:
                    due = now
            # measured between frames, so it is what the viewer actually gets, waits included
            tick = time.perf_counter()
            if last_tick is not None:
                rate = 1.0 / max(tick - last_tick, 1e-6)
                self._fps = rate if self._fps == 0 else 0.9 * self._fps + 0.1 * rate
            last_tick = tick

    def _process(self, frame, runner):
        started = time.perf_counter()
        persons, objects = frame.dets if frame.dets is not None else runner(frame.image)
        self._last = (frame, persons, objects)
        if self.analytics is None:
            self._new_analytics(frame.image)
        if self.source.live and self._fps > 0:
            self.analytics.fps = max(1.0, self._fps)  # time step follows the rate actually analysed
        self._analyse(frame, persons, objects, started)
        if frame.dets is None:
            self.report.add_layers(self._index, frame.t, runner.layers)
        self._index += 1

    def _analyse(self, frame, persons, objects, started):
        snap = self.analytics.update(persons, objects, frame.t, self._index)
        self.report.sample(snap)
        if self._index % RECORD_DRAIN_EVERY == 0:
            self._drain_records()
        if self.sink:
            ok, jpeg = cv2.imencode(".jpg", frame.image, [cv2.IMWRITE_JPEG_QUALITY, config.JPEG_QUALITY])
            h, w = frame.image.shape[:2]
            proc_ms = (time.perf_counter() - started) * 1000
            message = to_message(snap, self.analytics.cfg, (w, h), self._fps, proc_ms, self.source,
                                 with_heat=self._index % HEAT_EVERY == 0 or self.source.holds)
            if ok:
                self.sink.frame(json.dumps(message, ensure_ascii=False), jpeg.tobytes())

    def _new_analytics(self, image):
        h, w = image.shape[:2]
        cfg = self.source.configure(ra.Config(), self.settings, (w, h))
        area = self.settings.area_in_config() if self.source.uses_settings else None
        self.analytics = AreaAnalytics(cfg, self.source.fps, (w, h), area)
        self.report = ReportWriter(self.reports_root, dict(kind=self.source.kind, label=self.source.label))

    def _reanalyse(self):
        """Floor coordinates changed, so old tracks and heat no longer mean anything: new run, same frame."""
        self._finish_report(State.ENDED.value)
        frame, persons, objects = self._last
        self._new_analytics(frame.image)
        self._analyse(frame, persons, objects, time.perf_counter())

    def _drain_records(self):
        # Analytics.records grows forever on a long-running camera; move it to disk
        self.report.add_records(self.analytics.records)
        self.analytics.records.clear()

    def _finish_report(self, outcome: str):
        if self.report is None:
            return
        self._drain_records()
        self.summary = self.analytics.summary()
        rid = self.report.close(self.summary, outcome)
        if rid:
            self.report_ids.append(rid)
        self.report = None
