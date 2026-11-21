"""The gate for "move the code, do not change the logic": the web pipeline must produce the
exact same tracks as the original CLI function, byte for byte."""
import hashlib
from pathlib import Path

import pytest

import room_analytics as ra
from app import config
from app.session import Session, State
from app.settings import FloorSettings, default_settings
from app.sources import SimSpec, VideoSpec
from app.uploads import UploadStore

SECONDS = 60  # state_accuracy climbs with run length: 0.88 at 10 s, 0.924 at 30 s, 0.9367 at 60 s
CLIP = Path(__file__).resolve().parents[2] / "resource" / "example clip 3.mp4"


def sha(path):
    # the web report adds a UTF-8 BOM so Excel reads Thai zone names; the rows must not differ
    return hashlib.sha256(path.read_bytes().removeprefix(b"\xef\xbb\xbf")).hexdigest()


def test_session_matches_cli_simulation(tmp_path):
    cli_csv = tmp_path / "cli.csv"
    cli = ra.run_simulation(str(tmp_path / "cli.mp4"), seconds=SECONDS, csv_path=str(cli_csv))

    session = Session(SimSpec(seconds=SECONDS), UploadStore(tmp_path / "u", 1), default_settings(), tmp_path / "r",
                      paced=False)
    session.start()
    session.join(300)

    assert session.state == State.ENDED, session.error
    assert session.summary == cli
    assert session.summary["state_accuracy"] >= 0.93
    report_dir = tmp_path / "r" / session.report_ids[0]
    assert sha(report_dir / "tracks.csv") == sha(cli_csv)


@pytest.mark.skipif(not CLIP.exists(), reason="sample clip not present")
def test_session_matches_cli_on_a_real_clip_with_calibration(tmp_path):
    """Covers what the simulator cannot: real YOLO detections, pose, and the user's floor settings."""
    settings = FloorSettings(floor_pts=[(0.1, 0.3), (0.9, 0.3), (0.99, 0.99), (0.01, 0.99)], floor_size_m=(12, 9),
                             zones=[dict(name="Left", box=(0, 0, 10, 20)), dict(name="Right", box=(10, 0, 20, 20))])
    cli_csv = tmp_path / "cli.csv"
    cfg = ra.Config(det_model=config.DET_MODEL, pose_model=config.POSE_MODEL,
                    floor_img_pts=[(x * 1280, y * 720) for x, y in settings.floor_pts],
                    floor_size_m=settings.floor_size_m, zones=settings.zones_in_config())
    cli = ra.run_video(str(CLIP), None, cfg, csv_path=str(cli_csv))
    assert cli["unique_people"] > 0 and "Left" in cli["person_seconds_by_zone"], "the comparison must have data in it"

    uploads = UploadStore(tmp_path / "u", 10 ** 9)
    with open(CLIP, "rb") as fh:
        uid = uploads.save(CLIP.name, fh)["id"]
    session = Session(VideoSpec(upload_id=uid), uploads, settings, tmp_path / "r", paced=False)
    session.start()
    session.join(300)

    assert session.state == State.ENDED, session.error
    assert session.summary == cli
    assert sha(tmp_path / "r" / session.report_ids[0] / "tracks.csv") == sha(cli_csv)
