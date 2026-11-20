import json

import layers_report
from app.reports import ReportWriter

SURE = [100, 100, 200, 400, 0.8]
TRACK = [7, 100, 100, 200, 400, 0.8]
SHOWN = [7, 100, 100, 200, 400, 0.8, False]


def frame(dets=(), tracks=(), shown=()):
    return dict(i=0, t=1.0, dets=list(dets), tracks=list(tracks), shown=list(shown))


def test_a_sure_detection_that_is_shown_is_not_a_loss():
    assert layers_report.losses(frame([SURE], [TRACK], [SHOWN]), 0.30) == []


def test_a_sure_detection_the_tracker_dropped_is_blamed_on_the_tracker():
    assert [where for where, _ in layers_report.losses(frame([SURE]), 0.30)] == ["tracker"]


def test_a_sure_detection_tracked_but_not_shown_is_blamed_on_identities():
    assert [where for where, _ in layers_report.losses(frame([SURE], [TRACK]), 0.30)] == ["identities"]


def test_a_sure_detection_identities_took_for_a_chair_says_so():
    on_chair = dict(frame([SURE], [TRACK]), on_chairs=[7])
    assert [where for where, _ in layers_report.losses(on_chair, 0.30)] == ["chair"]


def test_a_narrow_detection_inside_a_wider_shown_box_is_not_a_loss():
    wide = [7, 80, 80, 500, 600, 0.8, False]
    assert layers_report.losses(frame([SURE], [], [wide]), 0.30) == []


def test_a_faint_detection_is_not_counted_as_a_loss():
    assert layers_report.losses(frame([[100, 100, 200, 400, 0.2]]), 0.30) == []


def test_a_person_shown_from_memory_with_nothing_detected_is_the_detector_gap():
    held = [7, 100, 100, 200, 400, 0.8, True]
    assert layers_report.detector_gaps(frame(shown=[held]), 0.30) == [7]
    assert layers_report.detector_gaps(frame([SURE], [TRACK], [held]), 0.30) == []


def test_the_report_keeps_one_line_per_frame(tmp_path):
    writer = ReportWriter(tmp_path, dict(kind="go2rtc", label="x"))
    writer.add_layers(3, 1.5, dict(dets=[SURE], tracks=[TRACK], shown=[SHOWN]))
    writer.add_layers(4, 1.6, dict(dets=[], tracks=[], shown=[]))
    writer.close_layers()

    lines = (writer.dir / "layers.jsonl").read_text(encoding="utf-8").splitlines()

    assert [json.loads(line)["i"] for line in lines] == [3, 4]
    assert json.loads(lines[0])["dets"] == [SURE]
