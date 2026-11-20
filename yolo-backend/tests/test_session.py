import pytest

from app.reports import ReportWriter
from app.session import Session, State
from app.settings import default_settings
from app.sources import SimSpec, Source
from app.uploads import UploadStore


def run_sim(tmp_path, seconds=1):
    session = Session(SimSpec(seconds=seconds), UploadStore(tmp_path / "u", 1), default_settings(), tmp_path / "r",
                      paced=False)
    session.start()
    session.join(60)
    assert not session._thread.is_alive(), "the session hung"
    return session


def test_thai_zone_names_reach_the_csv(tmp_path):
    writer = ReportWriter(tmp_path, dict(kind="video", label="x"))
    writer.add_records([dict(frame=0, t=0.0, id=1, state="sitting", zone="โต๊ะทำงาน")])
    writer.close({}, "ended")
    data = (tmp_path / writer.id / "tracks.csv").read_bytes()
    assert data.startswith(b"\xef\xbb\xbf"), "Excel needs the BOM to read Thai"
    assert "โต๊ะทำงาน" in data.decode("utf-8-sig")


@pytest.mark.parametrize("method", ["add_records", "close"])
def test_a_failing_report_ends_in_error_instead_of_hanging(tmp_path, monkeypatch, method):
    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(ReportWriter, method, boom)
    session = run_sim(tmp_path)
    assert session.state == State.ERROR
    assert "disk full" in session.error


def test_a_crash_inside_the_loop_ends_in_error_and_closes_the_source(tmp_path, monkeypatch):
    closed = []
    monkeypatch.setattr(Source, "close", lambda self: closed.append(True))

    def boom(*args, **kwargs):
        raise RuntimeError("gpu fell over")

    monkeypatch.setattr("app.session.to_message", boom)
    session = Session(SimSpec(seconds=1), UploadStore(tmp_path / "u", 1), default_settings(), tmp_path / "r",
                      sink=type("Sink", (), {"status": lambda *a: None, "frame": lambda *a: None})(), paced=False)
    session.start()
    session.join(60)
    assert session.state == State.ERROR and "gpu fell over" in session.error
    assert closed
