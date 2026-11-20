import pytest

from app.go2rtc import redact, stream_candidates


@pytest.mark.parametrize("link", [
    "rtsp://host:8554/cam1",
    "rtsps://host:8555/cam1",
    "http://host:1984/api/stream.mjpeg?src=cam1",
    "  http://host:1984/api/stream.mjpeg?src=cam1  ",
])
def test_direct_stream_links_pass_through(link):
    assert stream_candidates(link) == [link.strip()]


@pytest.mark.parametrize("page", ["stream.html", "webrtc.html", "links.html", "api/stream.mp4", "api/stream.m3u8", "api/ws"])
def test_page_links_become_stream_links(page):
    assert stream_candidates(f"http://host:1984/{page}?src=cam1") == [
        "rtsp://host:8554/cam1",
        "http://host:1984/api/stream.mjpeg?src=cam1",
    ]


def test_page_link_extras():
    assert stream_candidates("https://nas.local/go2rtc/stream.html?mode=webrtc&src=front door") == [
        "rtsp://nas.local:8554/front%20door",
        "https://nas.local/go2rtc/api/stream.mjpeg?src=front%20door",
    ]
    assert stream_candidates("http://[::1]:1984/stream.html?src=a")[0] == "rtsp://[::1]:8554/a"


@pytest.mark.parametrize("bad", [
    "", "cam1", "file:///etc/passwd", "ftp://host/x", "javascript:alert(1)",
    "http://host:1984/stream.html", "http://host:1984/",
])
def test_unusable_links_are_rejected(bad):
    with pytest.raises(ValueError):
        stream_candidates(bad)


def test_plain_mjpeg_camera_passes_through():
    assert stream_candidates("http://cam.local/video.mjpg") == ["http://cam.local/video.mjpg"]


def test_redact_removes_credentials():
    assert redact("rtsp://user:secret@host:8554/cam") == "rtsp://host:8554/cam"
    assert redact("rtsp://host:8554/cam") == "rtsp://host:8554/cam"
