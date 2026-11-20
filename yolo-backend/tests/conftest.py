import os
import tempfile

os.environ.setdefault("ROOM_DATA_DIR", tempfile.mkdtemp(prefix="room-data-"))
