"""End-to-end throughput of the web pipeline: analysis, JSON and JPEG, unpaced, no browser.
Close other GPU work first. From backend\\ run:
  .venv\\Scripts\\python.exe tests\\measure_fps.py "example clip.mp4" "example clip 2.mp4"
Clip names are relative to resource\\. RUNS sets the runs per clip (default 3)."""
import os
import sys
import tempfile
import threading
import time
from pathlib import Path
from statistics import median

sys.path.insert(0, os.getcwd())
from app.session import Session, State
from app.settings import default_settings
from app.sources import VideoSpec
from app.uploads import UploadStore

RESOURCE = Path(__file__).resolve().parents[2] / "resource"
WARMUP, FRAMES = 50, 200  # the first frames include loading the models onto the GPU


class Sink:
    def __init__(self):
        self.times, self.bytes, self.done = [], 0, threading.Event()

    def status(self, status):
        pass

    def frame(self, text, jpeg):
        self.times.append(time.perf_counter())
        self.bytes += len(text) + len(jpeg)
        if len(self.times) >= FRAMES:
            self.done.set()


def main():
    work = Path(tempfile.mkdtemp())
    uploads = UploadStore(work / "uploads", 10 ** 10)
    for name in sys.argv[1:]:
        with open(RESOURCE / name, "rb") as fh:
            uid = uploads.save(name, fh)["id"]
        rates = []
        for _ in range(int(os.environ.get("RUNS", "3"))):
            sink = Sink()
            session = Session(VideoSpec(upload_id=uid), uploads, default_settings(), work / "reports", sink=sink,
                              paced=False)
            session.start()
            sink.done.wait(180)
            session.stop()
            assert session.state == State.ENDED, session.error
            rates.append((FRAMES - WARMUP) / (sink.times[FRAMES - 1] - sink.times[WARMUP - 1]))
        print(f"{name}: {median(rates):.1f} fps, runs {[round(r, 1) for r in rates]}, "
              f"{sink.bytes / len(sink.times) / 1024:.0f} KiB per frame", flush=True)


if __name__ == "__main__":
    main()
