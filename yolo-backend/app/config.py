import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("ROOM_DATA_DIR", BACKEND_DIR / "data"))
DET_MODEL = str(BACKEND_DIR / "yolov8m.pt")
POSE_MODEL = str(BACKEND_DIR / "yolov8m-pose.pt")
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
JPEG_QUALITY = 80
# Face recognition (backend/face_id.py): auto | insightface | sface | off. Enrolment photos: data/faces/<name>/*.jpg
FACE_ENGINE = os.environ.get("FACE_ENGINE", "auto")
FACES_DIR = Path(os.environ.get("ROOM_FACES_DIR", DATA_DIR / "faces"))
FACE_TUNING = DATA_DIR / "face_settings.json"
# Wellness alerts (backend/wellness.py): history per day, settings from the web page, usual face sizes
ALERTS_DIR = DATA_DIR / "alerts"
WELLNESS_SETTINGS = DATA_DIR / "wellness_settings.json"
WELLNESS_BASELINES = DATA_DIR / "wellness_baselines.json"
MAX_UPLOAD_BYTES = 4 * 1024 ** 3
