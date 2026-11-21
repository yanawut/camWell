"""REST for control and reports, one WebSocket for live data."""
import asyncio
import json
import threading
from contextlib import asynccontextmanager

import anyio
from fastapi import Body, FastAPI, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from . import config
from .go2rtc import stream_candidates
from .reports import ReportStore
from .session import InvalidTransition, Session
from .settings import FloorSettings, SettingsStore, default_settings
from .sources import Go2rtcSpec, ImageSpec, SourceSpec, VideoSpec
from .uploads import TooLarge, UploadError, UploadStore

settings_store = SettingsStore(config.DATA_DIR / "settings.json")
uploads = UploadStore(config.DATA_DIR / "uploads", config.MAX_UPLOAD_BYTES)
reports = ReportStore(config.DATA_DIR / "reports")
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
