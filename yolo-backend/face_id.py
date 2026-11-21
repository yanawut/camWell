"""Who each tracked person is, from their face.

Sits after YoloRunner: YOLO + ByteTrack + PersonIdentities decide *where* people are and give each a stable
person id; this module only decides *who* that id is. It never runs on the whole frame, only on the upper part
of a person box, and only now and then per person:

  pending  -> tried every `try_every` frames until `min_samples` good faces are in, then decided
  known    -> re-checked every `recheck_every` frames, in case the tracker handed the id to someone else
  unknown  -> re-tried every `unknown_recheck_every` frames, a better view may still match

Each person's decision uses the mean of their recent face embeddings, not one frame: CCTV faces are small,
blurred and turned, and a single frame is often wrong.

Nothing here imports the web app, so the file moves to another backend as is. The face model is behind
FaceEngine; swap InsightFaceEngine (best accuracy, weights for non-commercial use) for SFaceEngine (OpenCV
Model Zoo, permissive licence) or your own without touching the rest. Embeddings from different engines
cannot be compared, so the gallery cache is kept per engine.
"""
from __future__ import annotations

import os
import queue
import threading
import traceback
from collections import deque
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def normalise(v):
    v = np.asarray(v, np.float32)
    return v / (np.linalg.norm(v) + 1e-9)


def imread(path):
    """cv2.imread cannot open non-ASCII paths on Windows (a folder named in Thai, say)."""
    data = np.fromfile(str(path), np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None


# --------------------------------------------------------------------- engines
@dataclass
class Face:
    box: np.ndarray        # x1 y1 x2 y2, in the image given to the engine
    kps: np.ndarray        # (5, 2): two eyes, nose tip, two mouth corners
    score: float           # detector confidence
    embedding: np.ndarray | None  # L2-normalised; None from measure()
    landmarks: np.ndarray | None = None  # (106, 2) from measure(), when the engine has a landmark model


class FaceEngine:
    """Detects faces in an image and embeds each one. `threshold` is the cosine similarity at which
    two embeddings are the same person for this engine. One engine is shared by the live session and the
    web app's enrolment, so `faces` runs one call at a time."""
    name = "base"
    threshold = 0.5

    def faces(self, image) -> list[Face]:
        lock = self.__dict__.setdefault("_lock", threading.Lock())
        with lock:
            return self._faces(image)

    def _faces(self, image) -> list[Face]:
        raise NotImplementedError

    def measure(self, image) -> list[Face]:
        """Faces with landmarks but no embedding: cheaper, for per-frame measurements (eyes, mouth, size)."""
        lock = self.__dict__.setdefault("_lock", threading.Lock())
        with lock:
            return self._measure(image)

    def _measure(self, image) -> list[Face]:
        return self._faces(image)


class InsightFaceEngine(FaceEngine):
    """SCRFD + ArcFace from the insightface package (pure-Python wheel, runs on onnxruntime).
    The buffalo_l weights are for non-commercial research use; licence them before real deployment."""

    def __init__(self, pack="buffalo_l", root="~/.insightface", det_size=320, providers=None, log=print):
        import onnxruntime as ort
        from insightface.app import FaceAnalysis
        if "CUDAExecutionProvider" in ort.get_available_providers():
            try:
                import torch  # noqa: F401  loads torch's CUDA 12.8 + cuDNN DLLs, which ORT 1.21-1.26 then reuses
            except ImportError:
                if hasattr(ort, "preload_dlls"):
                    ort.preload_dlls()  # no torch: CUDA/cuDNN from the nvidia-* wheels
        kwargs = {"providers": providers} if providers else {}
        self.app = FaceAnalysis(name=pack, root=root,
                                allowed_modules=["detection", "recognition", "landmark_2d_106"], **kwargs)
        self.app.prepare(ctx_id=0, det_size=(det_size, det_size))
        self.name = f"insightface-{pack}"
        self.threshold = 0.40
        session = getattr(self.app.models.get("detection"), "session", None)
        if log and session is not None:
            log(f"[faces] insightface {pack} on {session.get_providers()[0]}")

    def _detect(self, image):
        from insightface.app.common import Face as InsightFace
        boxes, kpss = self.app.det_model.detect(image, max_num=0)
        return [InsightFace(bbox=b[:4], kps=k, det_score=b[4]) for b, k in zip(boxes, kpss)]

    def _faces(self, image):
        rec = self.app.models["recognition"]
        out = []
        for f in self._detect(image):
            rec.get(image, f)
            out.append(Face(f.bbox.astype(np.float32), np.asarray(f.kps, np.float32), float(f.det_score),
                            normalise(f.normed_embedding)))
        return out

    def _measure(self, image):
        lmk = self.app.models.get("landmark_2d_106")
        out = []
        for f in self._detect(image):
            points = np.asarray(lmk.get(image, f), np.float32) if lmk is not None else None
            out.append(Face(f.bbox.astype(np.float32), np.asarray(f.kps, np.float32), float(f.det_score), None, points))
        return out


class SFaceEngine(FaceEngine):
    """YuNet + SFace through OpenCV (already a dependency). Less accurate than ArcFace on hard CCTV
    frames, but the weights from OpenCV Model Zoo carry permissive licences."""

    def __init__(self, det_model, rec_model, score_threshold=0.6):
        self.det = cv2.FaceDetectorYN.create(str(det_model), "", (320, 320), score_threshold, 0.3, 50)
        self.rec = cv2.FaceRecognizerSF.create(str(rec_model), "")
        self.name = "opencv-sface"
        self.threshold = 0.363  # OpenCV's published cosine threshold for SFace

    def _faces(self, image):
        h, w = image.shape[:2]
        self.det.setInputSize((w, h))
        _, rows = self.det.detect(image)
        out = []
        for r in [] if rows is None else rows:
            x, y, bw, bh = r[:4]
            emb = self.rec.feature(self.rec.alignCrop(image, r)).ravel()
            out.append(Face(np.array([x, y, x + bw, y + bh], np.float32), r[4:14].reshape(5, 2).astype(np.float32),
                            float(r[14]), normalise(emb)))
        return out


def upper_crop(frame, box, upper_share=0.55, crop_side=320, min_px=24):
    """The part of a person box where the face is, scaled up when small.
    Returns (crop, scale, (x offset, y offset)) or None when too small; frame = crop / scale + offset."""
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = (float(v) for v in box)
    bw, bh = x2 - x1, y2 - y1
    cx1, cx2 = int(max(0, x1 - 0.1 * bw)), int(min(W, x2 + 0.1 * bw))
    cy1, cy2 = int(max(0, y1 - 0.1 * bh)), int(min(H, y1 + upper_share * bh))
    if cx2 - cx1 < min_px or cy2 - cy1 < min_px:
        return None
    crop = frame[cy1:cy2, cx1:cx2]
    scale = min(4.0, crop_side / max(crop.shape[:2]))
    if scale > 1.0:
        return cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR), scale, (cx1, cy1)
    return crop.copy(), 1.0, (cx1, cy1)


def to_frame(face: Face, scale, offset) -> Face:
    """A face found in a crop, in frame coordinates."""
    off = np.array(offset, np.float32)
    return Face(face.box / scale + np.tile(off, 2), face.kps / scale + off, face.score, face.embedding,
                None if face.landmarks is None else face.landmarks / scale + off)


# --------------------------------------------------------------------- gallery
class Gallery:
    """Enrolled people: one embedding per enrolment photo, several photos per person.
    On disk: <folder>/<name>/*.jpg|png ... The folder name is the name shown."""

    def __init__(self, names: list[str], embeddings: np.ndarray, photos: list[str] | None = None):
        self.names = list(names)
        self.photos = list(photos) if photos is not None else [""] * len(self.names)  # file name per embedding
        embeddings = np.asarray(embeddings, np.float32)
        self.embeddings = embeddings.reshape(len(self.names), -1) if self.names else np.zeros((0, 1), np.float32)
        self.people = sorted(set(self.names))

    def __len__(self):
        return len(self.people)

    def match(self, embedding) -> list[tuple[str, float]]:
        """Every enrolled person with their best similarity to `embedding`, best first."""
        if not self.names:
            return []
        sims = self.embeddings @ normalise(embedding)
        best: dict[str, float] = {}
        for name, s in zip(self.names, sims.tolist()):
            best[name] = max(best.get(name, -1.0), s)
        return sorted(best.items(), key=lambda kv: -kv[1])

    @staticmethod
    def _photos(folder: Path):
        if not folder.is_dir():
            return []
        return sorted(p for d in folder.iterdir() if d.is_dir() and not d.name.startswith(".")
                      for p in d.iterdir() if p.suffix.lower() in IMAGE_EXTS)

    @staticmethod
    def enrolment_face(engine: FaceEngine, image):
        """(face, how many faces) for an enrolment photo: the largest face, or None."""
        faces = engine.faces(image) if image is not None else []
        if not faces:
            return None, 0
        return max(faces, key=lambda f: (f.box[2] - f.box[0]) * (f.box[3] - f.box[1])), len(faces)

    @classmethod
    def load(cls, folder, engine: FaceEngine, log=print):
        """Embeds the enrolment photos. Each photo's result is cached (per engine) until the file changes,
        so adding one photo embeds one photo. Returns (gallery, problems)."""
        folder = Path(folder)
        photos = cls._photos(folder)
        cache = folder / f".gallery-{engine.name}.npz"
        old = {}
        try:
            with np.load(cache, allow_pickle=False) as z:
                old = {k: (n, e) for k, n, e in zip(z["keys"].tolist(), z["counts"].tolist(), z["embeddings"])}
        except Exception:
            pass  # missing or from an older layout: embed again
        keys, counts, embs, names, photo_names, problems = [], [], [], [], [], []
        for p in photos:
            st = p.stat()
            key = f"{p.relative_to(folder).as_posix()}|{st.st_size}|{st.st_mtime_ns}"
            if key in old:
                n, emb = old[key]
            else:
                face, n = cls.enrolment_face(engine, imread(p))
                emb = face.embedding if face is not None else None
            keys.append(key)
            counts.append(int(n))
            embs.append(emb)
            if n == 0:
                problems.append(f"{p.parent.name}/{p.name}: no face found")
                continue
            if n > 1:
                problems.append(f"{p.parent.name}/{p.name}: {n} faces, used the largest")
            names.append(p.parent.name)
            photo_names.append(p.name)
        dim = next((len(e) for e in embs if e is not None), 1)
        table = np.array([e if e is not None else np.zeros(dim, np.float32) for e in embs], np.float32).reshape(-1, dim)
        if photos and set(keys) != set(old):
            folder.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_name(cache.name + ".tmp.npz")
            np.savez(tmp, keys=np.array(keys, dtype=str), counts=np.array(counts), embeddings=table)
            os.replace(tmp, cache)  # the web app and a running session may read it at the same time
        ok = np.array(counts) > 0 if counts else np.zeros(0, bool)
        gallery = cls(names, table[ok] if len(names) else np.zeros((0, dim), np.float32), photo_names)
        if log:
            log(f"[faces] {len(gallery)} people from {len(names)}/{len(photos)} photos ({engine.name})")
        return gallery, problems


def similarity_report(gallery: Gallery, top=15) -> dict:
    """How alike the enrolled people are, to pick a threshold and spot bad enrolment photos.

    pairs: the most alike pairs of different people, best photo pair each (the risk of naming one as the other).
    photos: for each photo, its mean similarity to that person's other photos; a low one is a blurred photo
    or someone else's face."""
    E, names = gallery.embeddings, np.array(gallery.names)
    sims = E @ E.T if len(names) else np.zeros((0, 0), np.float32)
    people = gallery.people
    idx = {n: np.flatnonzero(names == n) for n in people}
    pairs = []
    for i, a in enumerate(people):
        for b in people[i + 1:]:
            pairs.append(dict(a=a, b=b, score=round(float(sims[np.ix_(idx[a], idx[b])].max()), 3)))
    pairs.sort(key=lambda x: -x["score"])
    photos = {}
    for n in people:
        rows = idx[n]
        for r in rows:
            others = [o for o in rows if o != r]
            photos.setdefault(n, {})[gallery.photos[r]] = round(float(sims[r, others].mean()), 3) if others else None
    closest = {}
    for pair in pairs:
        for me, other in ((pair["a"], pair["b"]), (pair["b"], pair["a"])):
            closest.setdefault(me, dict(name=other, score=pair["score"]))
    return dict(pairs=pairs[:top], closest=closest, photos=photos)


# --------------------------------------------------------------------- enrolment from a camera
POSES = ("center", "left", "right", "up", "down")


def face_pose(kps):
    """(yaw, pitch ratio) from the 5 landmarks. yaw: nose offset from the eyes' midpoint in eye distances,
    > 0 when the nose points to the image right (the person's own left on an unmirrored camera).
    pitch ratio: where the nose sits between the eyes and the mouth; smaller = looking up."""
    eyes = kps[:2][np.argsort(kps[:2, 0])]
    mid = eyes.mean(axis=0)
    d = max(float(np.linalg.norm(eyes[1] - eyes[0])), 1e-3)
    mouth_y = float(kps[3:5, 1].mean())
    yaw = (float(kps[2, 0]) - float(mid[0])) / d
    pitch = (float(kps[2, 1]) - float(mid[1])) / max(mouth_y - float(mid[1]), 1e-3)
    return yaw, pitch


def sharpness(image, box):
    """Variance of the Laplacian over the face, at a fixed size so near and far faces compare."""
    x1, y1, x2, y2 = (int(round(v)) for v in box)
    h, w = image.shape[:2]
    crop = image[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(cv2.resize(crop, (112, 112)), cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def select_enrolment_frames(engine: FaceEngine, images, keep=6, min_face_px=60, max_yaw=0.8, turn=0.15, tilt=0.08):
    """Picks the frames of one person turning in front of a camera that are worth enrolling: one sharp frame
    per pose (straight, left, right, up, down), then the most different of the rest, up to `keep`.

    Drops frames with no face or several, faces that are too small, too turned, blurred (well under the
    run's typical sharpness) or of someone else (unlike most of the other frames)."""
    rejected = dict(no_face=0, many_faces=0, small=0, too_turned=0, blurry=0, other_person=0)
    cands = []
    for i, image in enumerate(images):
        faces = engine.faces(image) if image is not None else []
        if not faces:
            rejected["no_face"] += 1
            continue
        faces.sort(key=lambda f: -(f.box[2] - f.box[0]))
        if len(faces) > 1 and (faces[1].box[2] - faces[1].box[0]) >= 0.5 * (faces[0].box[2] - faces[0].box[0]):
            rejected["many_faces"] += 1
            continue
        f = faces[0]
        if f.box[2] - f.box[0] < min_face_px:
            rejected["small"] += 1
            continue
        yaw, pitch = face_pose(f.kps)
        if abs(yaw) > max_yaw:
            rejected["too_turned"] += 1
            continue
        cands.append(dict(index=i, face=f, yaw=yaw, pitch=pitch, sharp=sharpness(image, f.box)))

    if cands:
        typical = float(np.median([c["sharp"] for c in cands]))
        blurry = [c for c in cands if c["sharp"] < 0.4 * typical]
        rejected["blurry"] = len(blurry)
        cands = [c for c in cands if c["sharp"] >= 0.4 * typical]
    if len(cands) > 2:
        E = np.array([c["face"].embedding for c in cands])
        sims = E @ E.T
        np.fill_diagonal(sims, np.nan)
        alike = np.nanmedian(sims, axis=1)
        rejected["other_person"] = int((alike < 0.3).sum())
        cands = [c for c, a in zip(cands, alike) if a >= 0.3]

    straight = [c["pitch"] for c in cands if abs(c["yaw"]) < turn]
    base = float(np.median(straight)) if straight else (float(np.median([c["pitch"] for c in cands])) if cands else 0.0)
    for c in cands:
        if c["yaw"] > turn:
            c["pose"] = "left"
        elif c["yaw"] < -turn:
            c["pose"] = "right"
        elif c["pitch"] < base - tilt:
            c["pose"] = "up"
        elif c["pitch"] > base + tilt:
            c["pose"] = "down"
        else:
            c["pose"] = "center"

    chosen = []
    for pose in POSES:
        group = [c for c in cands if c["pose"] == pose]
        if group and len(chosen) < keep:
            chosen.append(max(group, key=lambda c: c["sharp"]))
    rest = [c for c in cands if c not in chosen]
    while rest and len(chosen) < keep:
        picked = np.array([c["face"].embedding for c in chosen]) if chosen else None
        def distance(c):
            return 1.0 if picked is None else float(1 - (picked @ c["face"].embedding).max())
        best = max(rest, key=lambda c: (round(distance(c), 2), c["sharp"]))
        chosen.append(best)
        rest.remove(best)
    chosen.sort(key=lambda c: POSES.index(c["pose"]))
    return dict(
        total=len(images), usable=len(cands), rejected=rejected,
        coverage={pose: any(c["pose"] == pose for c in cands) for pose in POSES},
        selected=[dict(index=c["index"], box=[round(float(v), 1) for v in c["face"].box], pose=c["pose"],
                       yaw=round(c["yaw"], 3), sharpness=round(c["sharp"], 1)) for c in chosen],
    )


# --------------------------------------------------------------------- per-person decision
@dataclass
class FaceSettings:
    try_every: int = 3               # frames between tries while a person is still pending
    recheck_every: int = 60          # ...once known: the tracker may have handed the id to someone else
    unknown_recheck_every: int = 15  # ...once unknown: a better view may still match
    max_per_frame: int = 2           # face crops per frame, pending people first
    upper_share: float = 0.55        # the face is in this top share of a person box (seated or standing)
    min_face_px: int = 24            # narrower faces (in frame pixels) embed too poorly to use
    min_det_score: float = 0.60
    second_face_share: float = 0.6   # a second face this wide (vs the largest) in one box makes it ambiguous
    max_yaw: float = 1.2             # nose offset from the eyes' midpoint, in eye distances: 0 = frontal, 1.2 about 65 deg;
                                     # ArcFace still matches turned faces (0.5+ against frontal enrolment, strangers < 0.35)
    min_samples: int = 3             # good faces before the first decision
    keep_samples: int = 10           # recent faces whose mean embedding is matched
    threshold: float | None = None   # cosine similarity to count as a match; None = the engine's
    margin: float = 0.05             # the best name must beat the runner-up by this much
    switch_votes: int = 3            # re-checks in a row that disagree before a known person is re-decided
    crop_side: int = 320             # small crops are scaled up to this before detection


@dataclass
class PersonFace:
    samples: deque
    status: str = "pending"  # pending | known | unknown
    name: str | None = None
    score: float = 0.0       # similarity of the mean embedding to `name` (or the best guess)
    next_try: int = 0
    disagree: int = 0
    busy: bool = False       # a crop of this person is with the worker thread


@dataclass
class _Job:
    pid: int
    crop: np.ndarray
    scale: float
    offset: tuple
    person_box: np.ndarray


class FaceIdentifier:
    """Call update(frame, persons, t) every frame with YoloRunner's persons (they carry .id, .box, .held).
    label(pid) then gives {status, name, score} for the snapshot.

    threaded=True runs the face model on its own thread so a slow (CPU) face model never slows tracking:
    each frame hands over at most one batch, and results land on a later frame."""

    def __init__(self, engine: FaceEngine, gallery: Gallery, settings: FaceSettings | None = None, threaded=False):
        self.engine, self.gallery = engine, gallery
        self.s = settings or FaceSettings()
        self.threshold = self.s.threshold if self.s.threshold is not None else engine.threshold
        self.people: dict[int, PersonFace] = {}
        self.frame = 0
        self.seen: dict[str, dict] = {}  # name -> first/last time and person ids, for the report
        self.error: str | None = None
        self._new_gallery: Gallery | None = None
        self._new_threshold: tuple | None = None
        self.threaded = threaded
        self._done: queue.Queue = queue.Queue()
        self._jobs: queue.Queue | None = None
        if threaded:
            self._jobs = queue.Queue(maxsize=1)
            threading.Thread(target=self._work, args=(self._jobs,), daemon=True, name="faces").start()

    # ------------------------------------------------------------ public
    def update(self, frame, persons, t=0.0):
        self.frame += 1
        self._swap_gallery()
        live = {p.id for p in persons}
        for pid in [pid for pid in self.people if pid not in live]:
            del self.people[pid]
        for p in persons:
            self.people.setdefault(p.id, PersonFace(deque(maxlen=self.s.keep_samples), next_try=self.frame))
        self._apply_finished()

        due = [p for p in persons if not p.held and not self.people[p.id].busy
               and self.people[p.id].next_try <= self.frame]
        due.sort(key=lambda p: (self.people[p.id].status != "pending", self.people[p.id].next_try))
        jobs = [j for j in (self._job(frame, p) for p in due[: self.s.max_per_frame]) if j is not None]
        if jobs and self._jobs is not None:
            try:
                self._jobs.put_nowait(jobs)
                for j in jobs:
                    self.people[j.pid].busy = True
            except queue.Full:
                pass  # the worker is still on the last batch: try again next frame
        elif jobs and not self.threaded:
            for j in jobs:
                self._take(j, self._best_face(j, self.engine.faces(j.crop)))
        self._resolve_duplicates()
        for pid, st in self.people.items():
            if st.status == "known":
                rec = self.seen.setdefault(st.name, dict(first_t=round(t, 2), last_t=round(t, 2), person_ids=[]))
                rec["last_t"] = round(t, 2)
                if pid not in rec["person_ids"]:
                    rec["person_ids"].append(pid)

    def set_gallery(self, gallery: Gallery):
        """Enrolment changed: takes effect on the next update, on the analysis thread."""
        self._new_gallery = gallery

    def set_threshold(self, threshold: float | None):
        """None = the engine's own. Takes effect on the next update, on the analysis thread."""
        self._new_threshold = (threshold,)

    def _swap_gallery(self):
        gallery, self._new_gallery = self._new_gallery, None
        threshold, self._new_threshold = self._new_threshold, None
        if gallery is None and threshold is None:
            return
        if gallery is not None:
            self.gallery = gallery
        if threshold is not None:
            self.threshold = threshold[0] if threshold[0] is not None else self.engine.threshold
        for st in self.people.values():  # decide again from the faces already collected
            if st.samples:
                st.status, st.name, st.disagree = "pending", None, 0
                self._decide(st)
            st.next_try = min(st.next_try, self.frame)

    def label(self, pid):
        st = self.people.get(pid)
        if st is None:
            return None
        return dict(status=st.status, name=st.name if st.status == "known" else None, score=round(st.score, 3))

    def layers(self):
        return [[pid, st.status, st.name, round(st.score, 3), len(st.samples)] for pid, st in self.people.items()]

    def summary(self):
        return dict(engine=self.engine.name, enrolled=len(self.gallery), threshold=self.threshold,
                    identified=self.seen)

    def close(self):
        """Stops the worker thread; each session opens its own identifier."""
        if self._jobs is not None:
            self._jobs.put(None)  # blocks at most until the worker finishes its current batch
            self._jobs = None

    # ------------------------------------------------------------ crops
    def _job(self, frame, p):
        cut = upper_crop(frame, p.box, self.s.upper_share, self.s.crop_side, self.s.min_face_px)
        if cut is None:
            self._missed(self.people[p.id])
            return None
        crop, scale, offset = cut
        return _Job(p.id, crop, scale, offset, np.asarray(p.box, np.float32))

    def _best_face(self, job, faces):
        """The face that belongs to this person box: big enough, frontal enough, inside the box."""
        ok = []
        for f in faces:
            box = f.box / job.scale + np.array(job.offset * 2, np.float32)
            width = box[2] - box[0]
            cx = (box[0] + box[2]) / 2
            if f.score < self.s.min_det_score or width < self.s.min_face_px:
                continue
            if not job.person_box[0] <= cx <= job.person_box[2]:
                continue  # a neighbour's face that crept into the widened crop
            eyes = f.kps[:2]
            d = float(np.linalg.norm(eyes[0] - eyes[1]))
            if d < 1e-3 or abs(f.kps[2][0] - eyes[:, 0].mean()) / d > self.s.max_yaw:
                continue
            ok.append((width, f))
        ok.sort(key=lambda wf: -wf[0])
        if len(ok) > 1 and ok[1][0] >= self.s.second_face_share * ok[0][0]:
            return None  # two people in one box (YOLO merged them): guessing would name the wrong one
        return ok[0][1] if ok else None

    # ------------------------------------------------------------ decisions
    def _take(self, job, face):
        st = self.people.get(job.pid)
        if st is None:
            return  # left while the worker was busy
        st.busy = False
        if face is None:
            self._missed(st)
            return
        if st.status == "known":
            ranked = dict(self.gallery.match(face.embedding))
            own = ranked.get(st.name, -1.0)
            other = max((s for n, s in ranked.items() if n != st.name), default=-1.0)
            clash = own < self.threshold * 0.5 or (other >= self.threshold and other > own + self.s.margin)
            st.disagree = st.disagree + 1 if clash else 0
            if st.disagree >= self.s.switch_votes:
                self._reset(st)  # someone else has this id now
                return
            if clash:
                st.next_try = self.frame + self.s.try_every  # look again soon
                return
        st.samples.append(face.embedding)
        self._decide(st)

    def _decide(self, st):
        ranked = self.gallery.match(np.mean(st.samples, axis=0))
        best_name, best = ranked[0] if ranked else (None, -1.0)
        second = ranked[1][1] if len(ranked) > 1 else -1.0
        st.score = best
        if len(st.samples) < self.s.min_samples:
            st.next_try = self.frame + self.s.try_every
            return
        if best >= self.threshold and best - second >= self.s.margin:
            st.status, st.name = "known", best_name
            st.next_try = self.frame + self.s.recheck_every
        else:
            st.status, st.name = "unknown", None
            st.next_try = self.frame + self.s.unknown_recheck_every

    def _missed(self, st):
        st.busy = False
        wait = {"pending": self.s.try_every, "known": self.s.recheck_every}.get(st.status, self.s.unknown_recheck_every)
        st.next_try = self.frame + wait

    def _reset(self, st):
        st.samples.clear()
        st.status, st.name, st.score, st.disagree = "pending", None, 0.0, 0
        st.next_try = self.frame

    def _resolve_duplicates(self):
        """One enrolled person cannot be two people at once: the better match keeps the name."""
        by_name: dict[str, list[PersonFace]] = {}
        for st in self.people.values():
            if st.status == "known":
                by_name.setdefault(st.name, []).append(st)
        for sts in by_name.values():
            for st in sorted(sts, key=lambda s: -s.score)[1:]:
                self._reset(st)

    # ------------------------------------------------------------ worker thread
    def _work(self, inbox):
        while True:
            jobs = inbox.get()
            if jobs is None:
                return
            try:
                results = [(j, self._best_face(j, self.engine.faces(j.crop))) for j in jobs]
            except Exception as exc:  # keep tracking alive; the face model just stops
                traceback.print_exc()
                self.error = f"{type(exc).__name__}: {exc}"
                results = [(j, None) for j in jobs]
            self._done.put(results)

    def _apply_finished(self):
        while True:
            try:
                results = self._done.get_nowait()
            except queue.Empty:
                return
            for job, face in results:
                self._take(job, face)


# --------------------------------------------------------------------- setup
def create_engine(kind="auto", models_dir=None, pack="buffalo_l", log=print):
    """kind: auto | insightface | sface | off. Returns an engine, or None (with the reason logged)."""
    kind = (kind or "auto").lower()
    if kind == "off":
        return None
    models_dir = Path(models_dir) if models_dir else Path(__file__).resolve().parent
    if kind in ("auto", "insightface"):
        try:
            return InsightFaceEngine(pack=pack, log=log)
        except ImportError:
            if kind == "insightface":
                log("[faces] FACE_ENGINE=insightface but the insightface package is not installed")
                return None
    yunet = models_dir / "face_detection_yunet_2023mar.onnx"
    sface = models_dir / "face_recognition_sface_2021dec.onnx"
    if yunet.exists() and sface.exists():
        return SFaceEngine(yunet, sface)
    log(f"[faces] off: install insightface, or put {yunet.name} and {sface.name} in {models_dir}")
    return None


_shared: dict = {}
_shared_lock = threading.Lock()


def shared_engine(kind="auto", models_dir=None, log=print):
    """One loaded engine per process: sessions and enrolment reuse it instead of loading the model again."""
    key = (kind, str(models_dir))
    with _shared_lock:
        if key not in _shared:
            _shared[key] = create_engine(kind, models_dir, log=log)
        return _shared[key]


def open_identifier(kind, faces_dir, models_dir=None, threaded=True, settings=None, log=print):
    """The identifier for a session, or None when face recognition is off or nobody is enrolled."""
    engine = shared_engine(kind, models_dir, log=log)
    if engine is None:
        return None
    gallery, problems = Gallery.load(faces_dir, engine, log=log)
    for problem in problems:
        log(f"[faces]   {problem}")
    if not len(gallery):
        log(f"[faces] off: nobody enrolled. Put photos in {Path(faces_dir) / '<name>'}")
        return None
    return FaceIdentifier(engine, gallery, settings, threaded=threaded)
