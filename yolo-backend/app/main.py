"""REST for control and reports, one WebSocket for live data."""
import asyncio
import json
import threading
from contextlib import asynccontextmanager

import anyio
import cv2
import numpy as np
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

import face_id
import wellness

from . import alerts as alert_stores
from . import config
from . import daily as daily_report
from .faces import CONSENT_TEXT, CONSENT_VERSION, FaceError, FaceStore, FaceTuning, NotFound
from .go2rtc import stream_candidates
from .reports import ReportStore
from .session import InvalidTransition, Session
from .settings import FloorSettings, SettingsStore, default_settings
from .sources import Go2rtcSpec, ImageSpec, SourceSpec, VideoSpec
from .uploads import TooLarge, UploadError, UploadStore

settings_store = SettingsStore(config.DATA_DIR / "settings.json")
uploads = UploadStore(config.DATA_DIR / "uploads", config.MAX_UPLOAD_BYTES)
reports = ReportStore(config.DATA_DIR / "reports")
faces = FaceStore(config.FACES_DIR)
face_tuning = FaceTuning(config.FACE_TUNING)
spec_adapter = TypeAdapter(SourceSpec)


class Client:
    """Holds only the newest frame, so a slow browser skips frames instead of queueing them."""

    def __init__(self):
        self.status = None
        self.frame = None
        self.wake = asyncio.Event()


class Hub:
    """Bridges the analysis thread to WebSocket clients on the event loop."""

    def __init__(self, loop):
        self.loop = loop
        self.clients: set[Client] = set()
        self.last_status = None
        self.last_frame = None

    def status(self, status: dict):
        self.loop.call_soon_threadsafe(self._post_status, json.dumps(status, ensure_ascii=False),
                                       status["state"] == "starting")

    def frame(self, text: str, jpeg: bytes):
        self.loop.call_soon_threadsafe(self._post_frame, (text, jpeg))

    def _post_status(self, text, new_run):
        self.last_status = text
        if new_run:
            self.last_frame = None
        for c in self.clients:
            c.status = text
            if new_run:
                c.frame = None  # frame numbers restart, so a stale frame here would outrank new ones
            c.wake.set()

    def _post_frame(self, frame):
        self.last_frame = frame
        for c in self.clients:
            c.frame = frame
            c.wake.set()

    def attach(self) -> Client:
        c = Client()
        c.status, c.frame = self.last_status, self.last_frame
        if c.status or c.frame:
            c.wake.set()
        self.clients.add(c)
        return c


class Manager:
    """At most one session: there is one GPU and one person watching."""

    def __init__(self, hub: Hub):
        self.hub = hub
        self.session: Session | None = None
        self.lock = threading.Lock()

    def start(self, spec) -> Session:
        with self.lock:
            if self.session and not self.session.stop():
                # starting anyway would put two sessions on one GPU
                raise HTTPException(409, "แหล่งภาพเดิมยังปิดไม่เสร็จ ลองใหม่อีกครั้ง")
            self.session = Session(spec, uploads, settings_store.load(), reports.root, sink=self.hub)
            self.session.start()
            return self.session

    def require(self) -> Session:
        if self.session is None:
            raise HTTPException(409, "ยังไม่ได้เลือกแหล่งภาพ")
        return self.session


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.manager = Manager(Hub(asyncio.get_running_loop()))
    yield
    if app.state.manager.session:
        await asyncio.to_thread(app.state.manager.session.stop)


app = FastAPI(title="Room Analytics", lifespan=lifespan)


@app.middleware("http")
async def reject_foreign_origins(request: Request, call_next):
    # This API can open URLs and read uploads, so a website the user happens to visit must not reach it
    origin = request.headers.get("origin")
    if origin and origin not in config.ALLOWED_ORIGINS:
        return JSONResponse({"detail": "origin not allowed"}, status_code=403)
    return await call_next(request)


# ---------------------------------------------------------------- settings
@app.get("/api/settings")
def get_settings() -> FloorSettings:
    return settings_store.load()


@app.get("/api/settings/defaults")
def get_default_settings() -> FloorSettings:
    return default_settings()


@app.put("/api/settings")
def put_settings(settings: FloorSettings, request: Request) -> FloorSettings:
    settings_store.save(settings)
    session = request.app.state.manager.session
    if session:
        session.apply_settings(settings)
    return settings


# ---------------------------------------------------------------- sources
@app.post("/api/uploads")
def post_upload(file: UploadFile) -> dict:
    try:
        return uploads.save(file.filename or "", file.file)
    except TooLarge as exc:
        raise HTTPException(413, str(exc))
    except UploadError as exc:
        raise HTTPException(415, str(exc))


# ---------------------------------------------------------------- faces
def _face_engine():
    return face_id.shared_engine(config.FACE_ENGINE, config.BACKEND_DIR)


def _faces_changed(request: Request, engine):
    if engine is not None:
        face_id.Gallery.load(faces.root, engine, log=None)  # embed the new photos now, not in the live loop
    session = request.app.state.manager.session
    if session:
        session.faces_changed()


def _face_call(fn, *args):
    try:
        return fn(*args)
    except NotFound as exc:
        raise HTTPException(404, str(exc))
    except FaceError as exc:
        raise HTTPException(422, str(exc))


def _thresholds(engine):
    if engine is None:
        return dict(threshold=None, defaultThreshold=None)
    saved = face_tuning.threshold(engine.name)
    return dict(threshold=saved if saved is not None else engine.threshold, defaultThreshold=engine.threshold)


@app.get("/api/faces")
def list_faces() -> dict:
    engine = _face_engine()
    return dict(engine=engine.name if engine else None, consent=dict(version=CONSENT_VERSION, text=CONSENT_TEXT),
                people=faces.people(), **_thresholds(engine))


@app.get("/api/faces/check")
def check_faces() -> dict:
    """The most alike enrolled people and each photo's likeness to the person's other photos."""
    engine = _face_engine()
    if engine is None:
        return dict(engine=None, pairs=[], closest={}, photos={})
    gallery, _ = face_id.Gallery.load(faces.root, engine, log=None)
    return dict(engine=engine.name, **face_id.similarity_report(gallery))


MAX_CAPTURE_FRAMES = 80


@app.post("/api/faces/capture")
def capture_faces(frames: list[UploadFile] = File(default=[])) -> dict:
    """Frames from the browser camera while someone turns their head: which of them to enrol.
    Nothing is stored; the page crops the chosen faces and sends them through POST /api/faces."""
    engine = _face_engine()
    if engine is None:
        raise HTTPException(409, "ยังไม่ได้ติดตั้งโมเดลใบหน้า")
    if not frames:
        raise HTTPException(422, "ไม่มีภาพจากกล้อง")
    if len(frames) > MAX_CAPTURE_FRAMES:
        raise HTTPException(422, f"ส่งได้ไม่เกิน {MAX_CAPTURE_FRAMES} ภาพ")
    images = []
    for f in frames:
        data = f.file.read(8 * 1024 ** 2 + 1)
        if len(data) > 8 * 1024 ** 2:
            raise HTTPException(413, "ภาพจากกล้องใหญ่เกินไป")
        images.append(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR))
    return face_id.select_enrolment_frames(engine, images)


@app.put("/api/faces/threshold")
def put_face_threshold(request: Request, body: dict = Body(...)) -> dict:
    engine = _face_engine()
    if engine is None:
        raise HTTPException(409, "ยังไม่ได้ติดตั้งโมเดลใบหน้า")
    value = body.get("threshold")
    if value is not None and not isinstance(value, (int, float)):
        raise HTTPException(422, "threshold ต้องเป็นตัวเลข")
    _face_call(face_tuning.set_threshold, engine.name, value)
    session = request.app.state.manager.session
    if session:
        session.faces_changed()
    return _thresholds(engine)


@app.post("/api/faces")
def add_faces(request: Request, name: str = Form(""), consent: bool = Form(False),
              files: list[UploadFile] = File(default=[])) -> dict:
    engine = _face_engine()
    result = _face_call(faces.add, name, [(f.filename or "", f.file) for f in files], consent, engine)
    _faces_changed(request, engine)
    return result


@app.delete("/api/faces/{name}")
def delete_face(name: str, request: Request) -> dict:
    _face_call(faces.delete, name)
    _faces_changed(request, _face_engine())
    return dict(deleted=name)


@app.delete("/api/faces/{name}/photos/{photo}")
def delete_face_photo(name: str, photo: str, request: Request) -> dict:
    _face_call(faces.delete_photo, name, photo)
    _faces_changed(request, _face_engine())
    return dict(deleted=photo)


@app.get("/api/faces/{name}/photos/{photo}")
def get_face_photo(name: str, photo: str):
    return FileResponse(_face_call(faces.photo_path, name, photo), headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- wellness alerts
def _today():
    import datetime as dt
    return dt.date.today().isoformat()


@app.get("/api/alerts")
def list_alerts(start: str | None = None, end: str | None = None) -> dict:
    """Alerts from `start` to `end` (YYYY-MM-DD, both included; default the last 7 days), newest first."""
    import datetime as dt
    end = end or _today()
    start = start or (dt.date.fromisoformat(end) - dt.timedelta(days=6)).isoformat()
    try:
        days = alert_stores.stores()[0].days(start, end)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    alerts = [a for _, d in days for a in d["alerts"]]
    alerts.sort(key=lambda a: -a["started_at"])
    return dict(start=start, end=end, alerts=alerts, categories=wellness.CATEGORY_TEXT, types=wellness.TYPE_TEXT)


@app.get("/api/daily")
def get_daily(date: str | None = None) -> dict:
    try:
        return daily_report.build(alert_stores.stores()[0], date or daily_report.today())
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.get("/api/wellness/settings")
def get_wellness_settings() -> dict:
    return alert_stores.stores()[1].settings().to_dict()


@app.get("/api/wellness/defaults")
def get_wellness_defaults() -> dict:
    return wellness.WellnessSettings().to_dict()


@app.put("/api/wellness/settings")
def put_wellness_settings(request: Request, body: dict = Body(...)) -> dict:
    try:
        settings = wellness.WellnessSettings.from_dict(body)
    except (TypeError, ValueError) as exc:
        raise HTTPException(422, f"ค่าไม่ถูกต้อง: {exc}")
    if settings.sit_minutes < 1 or settings.posture_seconds < 1:
        raise HTTPException(422, "เวลาต้องไม่น้อยกว่า 1")
    alert_stores.stores()[1].save_settings(settings)
    session = request.app.state.manager.session
    if session:
        session.wellness_changed(settings)
    return settings.to_dict()


# ---------------------------------------------------------------- session
@app.post("/api/session")
def post_session(request: Request, body: dict = Body(...)) -> dict:
    try:
        spec = spec_adapter.validate_python(body)
        if isinstance(spec, Go2rtcSpec):
            stream_candidates(spec.url)
        if isinstance(spec, (VideoSpec, ImageSpec)):
            uploads.resolve(spec.upload_id, spec.kind)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(422, str(exc))
    return request.app.state.manager.start(spec).status()


@app.get("/api/session")
def get_session(request: Request) -> dict:
    session = request.app.state.manager.session
    return session.status() if session else dict(type="status", state="idle")


class SeekBody(BaseModel):
    t: float = Field(ge=0)  # seconds into the clip


# Declared before /api/session/{action}, which would otherwise take "seek" as an unknown action
@app.post("/api/session/seek")
def session_seek(body: SeekBody, request: Request) -> dict:
    session = request.app.state.manager.require()
    try:
        session.seek(body.t)
    except InvalidTransition as exc:
        raise HTTPException(409, str(exc))
    return session.status()


@app.post("/api/session/{action}")
def session_action(action: str, request: Request) -> dict:
    session = request.app.state.manager.require()
    actions = {"pause": session.pause, "resume": session.resume, "stop": session.stop}
    if action not in actions:
        raise HTTPException(404, "unknown action")
    try:
        actions[action]()
    except InvalidTransition as exc:
        raise HTTPException(409, str(exc))
    return session.status()


# ---------------------------------------------------------------- reports
@app.get("/api/reports")
def list_reports() -> list[dict]:
    return reports.list()


@app.get("/api/reports/{rid}")
def get_report(rid: str) -> dict:
    report = reports.get(rid)
    if report is None:
        raise HTTPException(404, "ไม่พบรายงาน")
    return report


@app.get("/api/reports/{rid}/tracks.csv")
def get_report_csv(rid: str):
    path = reports.csv_path(rid)
    if path is None:
        raise HTTPException(404, "ไม่พบไฟล์ CSV")
    return FileResponse(path, media_type="text/csv", filename=f"{rid}.csv")


# ---------------------------------------------------------------- live
@app.websocket("/ws/live")
async def live(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and origin not in config.ALLOWED_ORIGINS:
        await ws.close(code=4403)
        return
    await ws.accept()
    manager = ws.app.state.manager
    client = manager.hub.attach()

    async def send(scope):
        try:
            while True:
                await client.wake.wait()
                client.wake.clear()
                status, client.status = client.status, None
                frame, client.frame = client.frame, None
                if status:
                    await ws.send_text(status)
                if frame:
                    await ws.send_text(frame[0])
                    await ws.send_bytes(frame[1])
        except (WebSocketDisconnect, RuntimeError, OSError):
            scope.cancel()  # the browser went away mid-send

    try:
        async with anyio.create_task_group() as tg:
            tg.start_soon(send, tg.cancel_scope)
            while True:
                message = await ws.receive()
                if message["type"] == "websocket.disconnect":
                    break
                if message.get("bytes") and manager.session:
                    manager.session.push_frame(message["bytes"])
            tg.cancel_scope.cancel()
    finally:
        manager.hub.clients.discard(client)
