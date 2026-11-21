"""A stand-in for go2rtc that serves the same URLs from a local clip: MJPEG over HTTP, the
stream.html page and RTSP over TCP. It exercises OpenCV's real FFmpeg client, but it is not
go2rtc, so set GO2RTC_URL to also run test_live_sources against a real server."""
import itertools
import re
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cv2


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeGo2rtc:
    def __init__(self, clip: Path, camera="clip", http_port=None, rtsp_port=None):
        self.clip, self.camera = str(clip), camera
        self.http_port, self.rtsp_port = http_port or _free_port(), rtsp_port or _free_port()
        self.rtp_port = _free_port()
        self.base = f"http://127.0.0.1:{self.http_port}"
        self.stop_event = threading.Event()

    def __enter__(self):
        # Encoded up front: OpenCV holds a process-wide lock while opening a capture, so opening
        # one inside this server would deadlock against the client opening its stream
        cap = cv2.VideoCapture(self.clip)
        self.jpegs = [cv2.imencode(".jpg", cap.read()[1])[1].tobytes() for _ in range(100)]
        cap.release()
        self._start_http()
        self._start_rtsp()
        return self

    def __exit__(self, *exc):
        self.stop_event.set()
        self.httpd.shutdown()
        self.ffmpeg.terminate()
        self.ffmpeg.wait(5)
        self.rtsp_listener.close()

    # ------------------------------------------------------------ HTTP
    def _start_http(self):
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path.startswith("/stream.html"):
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html")
                    self.end_headers()
                    self.wfile.write(b"<html>player page, not a stream</html>")
                elif self.path == f"/api/stream.mjpeg?src={fake.camera}":
                    self._mjpeg()
                else:
                    self.send_error(404)

            def _mjpeg(self):
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.end_headers()
                try:
                    for jpeg in itertools.cycle(fake.jpegs):
                        if fake.stop_event.is_set():
                            return
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                         + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
                        time.sleep(0.04)
                except OSError:
                    pass  # the viewer went away

        self.httpd = ThreadingHTTPServer(("127.0.0.1", self.http_port), Handler)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    # ------------------------------------------------------------ RTSP
    def _start_rtsp(self):
        self.sdp_path = Path(tempfile.mkdtemp()) / "stream.sdp"
        self.rtp_in = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.rtp_in.bind(("127.0.0.1", self.rtp_port))
        self.rtp_in.settimeout(0.5)
        self.ffmpeg = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-re", "-stream_loop", "-1", "-i", self.clip,
             "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", "25", "-an",
             "-f", "rtp", "-sdp_file", str(self.sdp_path), f"rtp://127.0.0.1:{self.rtp_port}?pkt_size=1200"],
            stdin=subprocess.DEVNULL)
        deadline = time.time() + 10
        while not (self.sdp_path.exists() and self.sdp_path.stat().st_size):
            if time.time() > deadline:
                raise RuntimeError("ffmpeg produced no SDP")
            time.sleep(0.05)
        self.rtsp_listener = socket.socket()
        self.rtsp_listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.rtsp_listener.bind(("127.0.0.1", self.rtsp_port))
        self.rtsp_listener.listen()
        self.subscribers = []
        self.lock = threading.Lock()
        threading.Thread(target=self._rtp_relay, daemon=True).start()
        threading.Thread(target=self._rtsp_accept, daemon=True).start()

    def _rtp_relay(self):
        while not self.stop_event.is_set():
            try:
                packet = self.rtp_in.recv(2048)
            except OSError:
                continue
            framed = b"$\x00" + struct.pack(">H", len(packet)) + packet
            with self.lock:
                for conn in list(self.subscribers):
                    try:
                        conn.sendall(framed)
                    except OSError:
                        self.subscribers.remove(conn)

    def _rtsp_accept(self):
        while not self.stop_event.is_set():
            try:
                conn, _ = self.rtsp_listener.accept()
            except OSError:
                return
            threading.Thread(target=self._rtsp_client, args=(conn,), daemon=True).start()

    def _rtsp_client(self, conn):
        buf = b""
        try:
            while not self.stop_event.is_set():
                data = conn.recv(4096)
                if not data:
                    break
                buf += data
                while b"\r\n\r\n" in buf:
                    head, buf = buf.split(b"\r\n\r\n", 1)
                    self._rtsp_reply(conn, head.decode("latin1"))
        except OSError:
            pass  # the viewer went away
        with self.lock:
            if conn in self.subscribers:
                self.subscribers.remove(conn)
        conn.close()

    def _rtsp_reply(self, conn, head):
        method, url = head.split(" ", 2)[:2]
        cseq = re.search(r"CSeq:\s*(\d+)", head, re.I).group(1)
        extra, body = "", b""
        if not url.rstrip("/").split("/")[-1].startswith((self.camera, "trackID")):
            conn.sendall(f"RTSP/1.0 404 Not Found\r\nCSeq: {cseq}\r\n\r\n".encode())
            return
        if method == "OPTIONS":
            extra = "Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN, GET_PARAMETER\r\n"
        elif method == "DESCRIBE":
            sdp = self.sdp_path.read_text()
            sdp = "\n".join(line for line in sdp.splitlines() if not line.startswith("SDP:"))
            body = (re.sub(r"(m=video [^\n]*\n)", r"\1a=control:trackID=0\n", sdp + "\n")).replace("\n", "\r\n").encode()
            extra = f"Content-Base: {url}/\r\nContent-Type: application/sdp\r\nContent-Length: {len(body)}\r\n"
        elif method == "SETUP":
            extra = "Transport: RTP/AVP/TCP;unicast;interleaved=0-1\r\nSession: 1\r\n"
        elif method == "PLAY":
            extra = "Session: 1\r\n"
        conn.sendall(f"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\n{extra}\r\n".encode() + body)
        if method == "PLAY":
            with self.lock:
                self.subscribers.append(conn)


if __name__ == "__main__":
    with FakeGo2rtc(Path(sys.argv[1]), http_port=1984, rtsp_port=8554):
        print("serving http://127.0.0.1:1984 and rtsp://127.0.0.1:8554/clip", flush=True)
        threading.Event().wait()
