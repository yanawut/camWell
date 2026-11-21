"""Build the face gallery and check it before a live run.

  .venv\\Scripts\\python.exe enroll_faces.py                       # embed data\\faces\\<name>\\*.jpg, list problems
  .venv\\Scripts\\python.exe enroll_faces.py --test snapshot.jpg   # who is in a photo, with scores
  .venv\\Scripts\\python.exe enroll_faces.py --pairs               # how alike the enrolled people are

--pairs helps pick the threshold: everyone's best match against *other* people should sit well below it.
"""
import argparse
import sys

import numpy as np

import face_id as fi
from app import config
from app.faces import FaceTuning


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--faces", default=str(config.FACES_DIR))
    ap.add_argument("--engine", default=config.FACE_ENGINE, choices=["auto", "insightface", "sface"])
    ap.add_argument("--test", nargs="*", default=[], help="photos to identify")
    ap.add_argument("--pairs", action="store_true", help="similarity between enrolled people")
    a = ap.parse_args()

    engine = fi.create_engine(a.engine, config.BACKEND_DIR)
    if engine is None:
        sys.exit(1)
    gallery, problems = fi.Gallery.load(a.faces, engine)
    for p in problems:
        print("  !", p)
    for name in gallery.people:
        print(f"  {name}: {gallery.names.count(name)} photos")
    saved = FaceTuning(config.FACE_TUNING).threshold(engine.name)
    threshold = saved if saved is not None else engine.threshold
    print(f"threshold {threshold} ({engine.name}{', set on the web page' if saved is not None else ''})")

    if a.pairs and len(gallery) > 1:
        print("\nclosest other person for each enrolled person:")
        for name in gallery.people:
            mine = gallery.embeddings[[n == name for n in gallery.names]]
            others = [(n, float(np.max(mine @ e))) for n, e in zip(gallery.names, gallery.embeddings) if n != name]
            n, s = max(others, key=lambda x: x[1])
            flag = "  <-- too close" if s >= threshold else ""
            print(f"  {name:20s} {n:20s} {s:.3f}{flag}")

    for path in a.test:
        img = fi.imread(path)
        faces = engine.faces(img) if img is not None else []
        print(f"\n{path}: {len(faces)} faces")
        for f in faces:
            ranked = gallery.match(f.embedding)[:3]
            best = ranked[0] if ranked else ("-", 0.0)
            verdict = best[0] if best[1] >= threshold else "unknown"
            box = [round(float(v)) for v in f.box]
            print(f"  {box} width {box[2] - box[0]}px -> {verdict}   " +
                  ", ".join(f"{n} {s:.3f}" for n, s in ranked))


if __name__ == "__main__":
    main()
