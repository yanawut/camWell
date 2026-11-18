"""Local YOLO inference service for CamWell camera frames."""
import os
import re
import threading
import time
from dataclasses import dataclass

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")

import cv2
import numpy as np
from fastapi import Body, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from ultralytics import YOLO
from go2rtc import stream_candidates

DET_MODEL = os.environ.get("CAMWELL_YOLO_DET_MODEL", "yolov8m.pt")
POSE_MODEL = os.environ.get("CAMWELL_YOLO_POSE_MODEL", "yolov8m-pose.pt")
MAX_FRAME_BYTES = 4 * 1024 * 1024
MAX_CAMERAS = 2
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}

app = FastAPI(title="CamWell YOLO Vision")
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["content-type", "x-camera-id"],
)


@app.middleware("http")
async def local_origin_only(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"detail": "origin not allowed"}, status_code=403)
    return await call_next(request)


@dataclass
class CameraRunner:
    detector: YOLO
    pose: YOLO
    lock: threading.Lock

    @classmethod
    def create(cls):
        return cls(YOLO(DET_MODEL), YOLO(POSE_MODEL), threading.Lock())

    def infer(self, frame):
        started = time.perf_counter()
        with self.lock:
            result = self.detector.track(
                frame, persist=True, tracker="bytetrack.yaml", conf=0.1,
                imgsz=960, classes=[0, 56, 60], verbose=False,
            )[0]
            people, objects, crops, offsets = [], [], [], []
            if result.boxes is not None:
                xyxy = result.boxes.xyxy.cpu().numpy()
                conf = result.boxes.conf.cpu().numpy()
                cls = result.boxes.cls.int().cpu().numpy()
                ids = result.boxes.id.int().cpu().numpy() if result.boxes.id is not None else np.full(len(cls), -1)
                height, width = frame.shape[:2]
                for box, score, class_id, track_id in zip(xyxy, conf, cls, ids):
                    x1, y1, x2, y2 = (int(v) for v in box)
                    if class_id == 0:
                        if track_id < 0:
                            continue
                        xpad, ypad = int((x2 - x1) * 0.12), int((y2 - y1) * 0.12)
                        left, top = max(0, x1 - xpad), max(0, y1 - ypad)
                        right, bottom = min(width, x2 + xpad), min(height, y2 + ypad)
                        people.append({"id": int(track_id), "box": box.round(1).tolist(), "conf": float(score)})
                        crops.append(frame[top:bottom, left:right])
                        offsets.append((left, top))
                    else:
                        objects.append({
                            "class": "chair" if class_id == 56 else "table",
                            "box": box.round(1).tolist(),
                            "conf": float(score),
                        })

            valid_indexes = [i for i, crop in enumerate(crops) if crop.size]
            if valid_indexes:
                pose_results = self.pose.predict(
                    [crops[i] for i in valid_indexes], conf=0.15, imgsz=320, verbose=False,
                )
                for i, pose_result in zip(valid_indexes, pose_results):
                    keypoints = pose_result.keypoints
                    if keypoints is None or len(keypoints) == 0:
                        continue
                    xoff, yoff = offsets[i]
                    points = keypoints.data[0].cpu().numpy()
                    points[:, 0] += xoff
                    points[:, 1] += yoff
                    people[i]["keypoints"] = points.round(4).tolist()
            return {
                "width": frame.shape[1], "height": frame.shape[0], "people": people,
                "objects": objects, "processMs": round((time.perf_counter() - started) * 1000, 1),
            }


class RTSPStream:
    def __init__(self, candidates: list[str]):
        self.candidates = candidates
        self.stop_event = threading.Event()
        self.condition = threading.Condition()
        self.frame = None
        self.sequence = 0
        self.capture = None
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def _run(self):
        while not self.stop_event.is_set():
            for url in self.candidates:
                if self.stop_event.is_set():
                    break
                capture = None
                try:
                    timeout_params = []
                    for name in ("CAP_PROP_OPEN_TIMEOUT_MSEC", "CAP_PROP_READ_TIMEOUT_MSEC"):
                        prop = getattr(cv2, name, None)
                        if prop is not None:
                            timeout_params.extend((prop, 5000))
                    if timeout_params:
                        try:
                            capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG, timeout_params)
                        except (TypeError, cv2.error):
                            capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
                    else:
                        capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
                    self.capture = capture
                    if capture.isOpened():
                        while not self.stop_event.is_set():
                            ok, frame = capture.read()
                            if not ok or frame is None:
                                break
                            with self.condition:
                                self.frame = frame
                                self.sequence += 1
                                self.condition.notify_all()
                except Exception:
                    pass
                if capture is not None:
                    capture.release()
                self.capture = None
            if not self.stop_event.is_set():
                with self.condition:
                    self.condition.notify_all()
                self.stop_event.wait(2)

    def wait_for_frame(self, after_sequence: int, timeout: float):
        deadline = time.monotonic() + timeout
        with self.condition:
            while self.sequence <= after_sequence and not self.stop_event.is_set():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, after_sequence
                self.condition.wait(remaining)
            return (self.frame.copy(), self.sequence) if self.frame is not None else (None, after_sequence)

    def close(self):
        self.stop_event.set()
        with self.condition:
            self.condition.notify_all()
        capture = self.capture
        if capture is not None:
            capture.release()
        self.thread.join(timeout=2)


_runners: dict[str, CameraRunner] = {}
_runners_lock = threading.Lock()
_rtsp_streams: dict[str, RTSPStream] = {}
_rtsp_lock = threading.Lock()


def validate_camera_id(camera_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", camera_id):
        raise HTTPException(400, "invalid camera id")


def runner_for(camera_id: str) -> CameraRunner:
    validate_camera_id(camera_id)
    with _runners_lock:
        runner = _runners.get(camera_id)
        if runner is None:
            if len(_runners) >= MAX_CAMERAS:
                raise HTTPException(429, "maximum active cameras reached")
            runner = CameraRunner.create()
            _runners[camera_id] = runner
        return runner


@app.get("/health")
def health():
    return {"status": "ok", "activeCameras": len(_runners)}


@app.post("/api/infer")
def infer_frame(camera_id: str = Header(alias="x-camera-id"), body: bytes = Body(...)):
    if not body or len(body) > MAX_FRAME_BYTES:
        raise HTTPException(413, "frame must be between 1 byte and 4 MiB")
    frame = cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(415, "frame must be a valid JPEG image")
    return runner_for(camera_id).infer(frame)


@app.post("/api/camera/{camera_id}/rtsp")
def start_rtsp(camera_id: str, url: str = Body(embed=True)):
    validate_camera_id(camera_id)
    try:
        candidates = stream_candidates(url)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None

    with _rtsp_lock:
        stream = _rtsp_streams.get(camera_id)
        if stream is None or stream.candidates != candidates:
            if stream is not None:
                stream.close()
            if len(_rtsp_streams) >= MAX_CAMERAS and camera_id not in _rtsp_streams:
                raise HTTPException(429, "maximum active RTSP cameras reached")
            stream = RTSPStream(candidates)
            _rtsp_streams[camera_id] = stream
            stream.start()

    with stream.condition:
        current_sequence = stream.sequence
    frame, _ = stream.wait_for_frame(current_sequence, 10)
    if frame is None:
        with _rtsp_lock:
            if _rtsp_streams.get(camera_id) is stream:
                _rtsp_streams.pop(camera_id, None)
        stream.close()
        raise HTTPException(502, "could not read a frame from the RTSP camera")
    return {"status": "connected", "width": frame.shape[1], "height": frame.shape[0]}


@app.get("/api/camera/{camera_id}/rtsp/stream")
def rtsp_preview(camera_id: str):
    validate_camera_id(camera_id)
    with _rtsp_lock:
        stream = _rtsp_streams.get(camera_id)
    if stream is None:
        raise HTTPException(404, "RTSP camera is not connected")

    def frames():
        sequence = -1
        while not stream.stop_event.is_set():
            frame, sequence = stream.wait_for_frame(sequence, 5)
            if frame is None:
                continue
            ok, encoded = cv2.imencode(".jpg", frame)
            if not ok:
                continue
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + encoded.tobytes() + b"\r\n"

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@app.delete("/api/camera/{camera_id}/rtsp")
def stop_rtsp(camera_id: str):
    validate_camera_id(camera_id)
    with _rtsp_lock:
        stream = _rtsp_streams.pop(camera_id, None)
    if stream is not None:
        stream.close()
    return {"status": "closed"}


@app.delete("/api/camera/{camera_id}")
def close_camera(camera_id: str):
    validate_camera_id(camera_id)
    with _runners_lock:
        _runners.pop(camera_id, None)
    with _rtsp_lock:
        stream = _rtsp_streams.pop(camera_id, None)
    if stream is not None:
        stream.close()
    return {"status": "closed"}


@app.delete("/api/camera/{camera_id}/yolo")
def close_yolo(camera_id: str):
    validate_camera_id(camera_id)
    with _runners_lock:
        _runners.pop(camera_id, None)
    return {"status": "closed"}
