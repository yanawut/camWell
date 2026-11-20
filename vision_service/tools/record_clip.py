"""Records a clip from a camera stream, for eval_clips.py.

  vision_service\\.venv\\Scripts\\python.exe vision_service\\tools\\record_clip.py <stream url> <out.mp4> <seconds>

The url is anything OpenCV opens, such as go2rtc's http://host:1984/api/stream.mjpeg?src=<camera>. The file header
gets the frame rate measured over the first two seconds, so analysing at a fixed rate per second of video matches
real time.
"""
import sys
import time

import cv2

url, out, seconds = sys.argv[1], sys.argv[2], float(sys.argv[3])
cap = cv2.VideoCapture(url)
started, first = time.time(), []
while time.time() - started < 2.0:
    ok, frame = cap.read()
    if not ok:
        sys.exit("no frame read from the stream")
    first.append(frame)
fps = len(first) / (time.time() - started)
h, w = first[0].shape[:2]
writer = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
for frame in first:
    writer.write(frame)
n = len(first)
while time.time() - started < seconds:
    ok, frame = cap.read()
    if not ok:
        break
    writer.write(frame)
    n += 1
writer.release()
print(f"{n} frames in {time.time() - started:.1f} s (header {fps:.1f} fps) -> {out}")
