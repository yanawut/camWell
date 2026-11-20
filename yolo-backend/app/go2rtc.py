"""Turn whatever go2rtc link the user pasted into stream URLs OpenCV can open."""
from urllib.parse import parse_qs, quote, urlsplit, urlunsplit

RTSP_PORT = 8554  # go2rtc default; the web page's URL does not reveal it


def _rtsp_host(hostname: str) -> str:
    return f"[{hostname}]" if ":" in hostname else hostname


def stream_candidates(link: str) -> list[str]:
    """URLs to try, best first. Raises ValueError for a link that cannot be a stream."""
    link = link.strip()
    parts = urlsplit(link)
    scheme = parts.scheme.lower()
    if not parts.hostname:
        raise ValueError("ลิงก์ไม่ถูกต้อง ต้องเป็น rtsp://... หรือ http://...")
    if scheme in ("rtsp", "rtsps"):
        return [link]
    if scheme not in ("http", "https"):
        raise ValueError(f"ไม่รองรับลิงก์แบบ {scheme}://")
    if parts.path.endswith("/api/stream.mjpeg"):
        return [link]
    src = parse_qs(parts.query).get("src", [""])[0]
    if src:
        # RTSP first: it is the camera's own codec, while MJPEG makes go2rtc transcode
        name = quote(src, safe="")
        marker = parts.path.find("/api/")
        prefix = parts.path[:marker] if marker >= 0 else parts.path.rsplit("/", 1)[0]
        mjpeg = urlunsplit((scheme, parts.netloc, f"{prefix}/api/stream.mjpeg", f"src={name}", ""))
        return [f"rtsp://{_rtsp_host(parts.hostname)}:{RTSP_PORT}/{name}", mjpeg]
    if parts.path.endswith((".html", "/")) or not parts.path:
        raise ValueError("ลิงก์นี้เป็นหน้าเว็บที่ไม่มี src จึงไม่รู้ว่าเป็นกล้องตัวไหน")
    return [link]


def redact(url: str) -> str:
    """Remove credentials so a URL is safe to show and to store in reports."""
    parts = urlsplit(url)
    if not parts.username and not parts.password:
        return url
    host = parts.netloc.rsplit("@", 1)[-1]
    return urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))
