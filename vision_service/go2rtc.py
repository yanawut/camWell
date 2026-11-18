"""Resolve go2rtc page links into stream URLs OpenCV can read."""
from urllib.parse import parse_qs, quote, urlsplit, urlunsplit

RTSP_PORT = 8554


def _rtsp_host(hostname: str) -> str:
    return f"[{hostname}]" if ":" in hostname else hostname


def stream_candidates(link: str) -> list[str]:
    link = link.strip()
    parts = urlsplit(link)
    scheme = parts.scheme.lower()
    if not parts.hostname:
        raise ValueError("ลิงก์กล้องไม่ถูกต้อง")
    if scheme in {"rtsp", "rtsps"}:
        return [link]
    if scheme not in {"http", "https"}:
        raise ValueError(f"ไม่รองรับลิงก์แบบ {scheme}://")
    if parts.path.endswith("/api/stream.mjpeg"):
        return [link]

    source = parse_qs(parts.query).get("src", [""])[0]
    if source:
        name = quote(source, safe="")
        marker = parts.path.find("/api/")
        prefix = parts.path[:marker] if marker >= 0 else parts.path.rsplit("/", 1)[0]
        mjpeg = urlunsplit((scheme, parts.netloc, f"{prefix}/api/stream.mjpeg", f"src={name}", ""))
        rtsp = f"rtsp://{_rtsp_host(parts.hostname)}:{RTSP_PORT}/{name}"
        return [rtsp, mjpeg]

    if parts.path.endswith((".html", "/")) or not parts.path:
        raise ValueError("ลิงก์หน้า go2rtc ต้องมีพารามิเตอร์ src")
    return [link]
