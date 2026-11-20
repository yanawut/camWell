import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("ROOM_DATA_DIR", BACKEND_DIR / "data"))
DET_MODEL = str(BACKEND_DIR / "yolov8m.pt")
POSE_MODEL = str(BACKEND_DIR / "yolov8m-pose.pt")
ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
JPEG_QUALITY = 80
MAX_UPLOAD_BYTES = 4 * 1024 ** 3
