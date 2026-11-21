"""The page draws skeletons from the keypoints each snapshot carries."""
import json

import numpy as np

from app.session import Session, State
from app.settings import default_settings
from app.snapshot import _kpts
from app.sources import SimSpec
from app.uploads import UploadStore


def test_keypoints_are_sent_as_17_xy_conf_triples():
    kpts = np.arange(51, dtype=np.float32).reshape(17, 3)
    sent = _kpts(kpts)
    assert len(sent) == 17 and all(len(p) == 3 for p in sent)
    assert sent[1] == [3.0, 4.0, 5.0]
    json.dumps(sent)  # numpy floats would not serialise


def test_someone_held_from_memory_has_no_keypoints():
    assert _kpts(None) is None


def test_sim_snapshots_carry_keypoints(tmp_path):
    sent = []
    sink = type("Sink", (), {"status": lambda self, s: None,
                             "frame": lambda self, text, jpeg: sent.append(json.loads(text))})()
    session = Session(SimSpec(seconds=2), UploadStore(tmp_path / "u", 1), default_settings(), tmp_path / "r",
                      sink=sink, paced=False)
    session.start()
    session.join(60)
    assert session.state == State.ENDED
    people = [p for snap in sent for p in snap["people"]]
    assert people, "the simulator produced nobody"
    with_kpts = [p for p in people if p["kpts"] is not None]
    assert with_kpts, "no person carried keypoints"
    assert all(len(p["kpts"]) == 17 for p in with_kpts)
