"""Enrolment from the web page: one folder per person under FACES_DIR, the same layout face_id.Gallery reads.

Photos are stored under generated names, so a client filename never reaches a path. Each submission
records the consent text the person agreed to, with the time, in consent.json next to their photos."""
import datetime as dt
import json
import re
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

import face_id

CONSENT_VERSION = "1"
CONSENT_TEXT = (
    "ข้าพเจ้ายินยอมให้เก็บรูปใบหน้าและข้อมูลชีวภาพที่คำนวณจากรูป (face embedding) "
    "เพื่อใช้ระบุตัวตนในระบบวิเคราะห์ภาพจากกล้องภายในสำนักงานนี้เท่านั้น "
    "ข้อมูลจะไม่ถูกส่งออกนอกเครื่องที่ติดตั้งระบบ และจะถูกลบเมื่อกดลบในหน้านี้หรือเมื่อสิ้นสุดโครงการ "
    "ข้าพเจ้าถอนความยินยอมได้ทุกเมื่อโดยแจ้งผู้ดูแลระบบให้ลบข้อมูล"
)
PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
MAX_PHOTO_BYTES = 15 * 1024 ** 2
MAX_PHOTOS_PER_REQUEST = 20
_PHOTO = re.compile(r"^[0-9a-f]{32}\.(jpg|jpeg|png|bmp|webp)$")
_BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


class FaceError(ValueError):
    pass


class NotFound(FaceError):
    pass


class FaceStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    # ------------------------------------------------------------ names and paths
    @staticmethod
    def clean_name(name: str) -> str:
        name = " ".join((name or "").split()).strip(". ")
        if not name:
            raise FaceError("กรุณาตั้งชื่อ")
        if len(name) > 60:
            raise FaceError("ชื่อยาวเกิน 60 ตัวอักษร")
        if _BAD.search(name):
            raise FaceError('ชื่อห้ามมีอักขระ \\ / : * ? " < > |')
        if name.upper().split(".")[0] in _RESERVED:
            raise FaceError("ใช้ชื่อนี้เป็นชื่อโฟลเดอร์บน Windows ไม่ได้")
        return name

    def _dir(self, name: str, must_exist=True) -> Path:
        d = self.root / self.clean_name(name)
        if d.resolve().parent != self.root.resolve():
            raise FaceError("ชื่อไม่ถูกต้อง")
        if must_exist and not d.is_dir():
            raise NotFound(f"ไม่พบ {name}")
        return d

    def photo_path(self, name: str, photo: str) -> Path:
        if not _PHOTO.match(photo):
            raise NotFound("ไม่พบรูป")
        path = self._dir(name) / photo
        if not path.is_file():
            raise NotFound("ไม่พบรูป")
        return path

    # ------------------------------------------------------------ read
    def people(self) -> list[dict]:
        if not self.root.is_dir():
            return []
        out = []
        for d in sorted(p for p in self.root.iterdir() if p.is_dir() and not p.name.startswith(".")):
            photos = sorted((p for p in d.iterdir() if p.suffix.lower() in PHOTO_EXTS), key=lambda p: p.stat().st_mtime)
            consent = self._consent(d)
            out.append(dict(name=d.name, photos=[p.name for p in photos],
                            consentAt=consent[-1]["accepted_at"] if consent else None))
        return out

    @staticmethod
    def _consent(d: Path) -> list:
        try:
            return json.loads((d / "consent.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []

    # ------------------------------------------------------------ write
    def add(self, name: str, files: list[tuple[str, BinaryIO]], consent: bool, engine=None) -> dict:
        """Saves the photos, then keeps only those with a face when an engine is there to check.
        Returns {name, added, problems}."""
        if not consent:
            raise FaceError("ต้องยอมรับข้อตกลงการเก็บข้อมูลส่วนบุคคล (PDPA) ก่อน")
        if not files:
            raise FaceError("เลือกรูปอย่างน้อย 1 รูป")
        if len(files) > MAX_PHOTOS_PER_REQUEST:
            raise FaceError(f"เลือกได้ครั้งละไม่เกิน {MAX_PHOTOS_PER_REQUEST} รูป")
        for filename, _ in files:
            if Path(filename).suffix.lower() not in PHOTO_EXTS:
                raise FaceError(f"{filename}: รองรับเฉพาะ {', '.join(sorted(PHOTO_EXTS))}")
        d = self._dir(name, must_exist=False)
        is_new = not d.exists()
        d.mkdir(parents=True, exist_ok=True)
        saved, problems = [], []
        try:
            for filename, stream in files:
                path = d / f"{uuid.uuid4().hex}{Path(filename).suffix.lower()}"
                self._write(path, stream, filename)
                if engine is not None:
                    face, n = face_id.Gallery.enrolment_face(engine, face_id.imread(path))
                    if face is None:
                        path.unlink()
                        problems.append(f"{filename}: ไม่พบใบหน้า ไม่ได้บันทึกรูปนี้")
                        continue
                    if n > 1:
                        problems.append(f"{filename}: เจอ {n} หน้า ระบบใช้หน้าที่ใหญ่ที่สุด")
                saved.append(path.name)
        except FaceError:
            for photo in saved:
                (d / photo).unlink(missing_ok=True)
            if is_new:
                shutil.rmtree(d, ignore_errors=True)
            raise
        if not saved:
            if is_new:
                shutil.rmtree(d, ignore_errors=True)
            raise FaceError("ไม่มีรูปที่ใช้ได้: " + " / ".join(problems))
        records = self._consent(d)
        records.append(dict(accepted_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"),
                            version=CONSENT_VERSION, text=CONSENT_TEXT, photos=saved))
        (d / "consent.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        return dict(name=d.name, added=len(saved), problems=problems)

    @staticmethod
    def _write(path: Path, stream: BinaryIO, filename: str):
        total = 0
        try:
            with open(path, "wb") as fh:
                while chunk := stream.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_PHOTO_BYTES:
                        raise FaceError(f"{filename}: ใหญ่เกิน {MAX_PHOTO_BYTES // 1024 ** 2} MB")
                    fh.write(chunk)
        except FaceError:
            path.unlink(missing_ok=True)
            raise

    def delete(self, name: str):
        """Removes the person, photos and consent record: what withdrawing consent asks for."""
        shutil.rmtree(self._dir(name))

    def delete_photo(self, name: str, photo: str):
        path = self.photo_path(name, photo)
        path.unlink()
        if not any(p.suffix.lower() in PHOTO_EXTS for p in path.parent.iterdir()):
            shutil.rmtree(path.parent)  # no photo left: nothing to recognise them by


class FaceTuning:
    """The match threshold chosen on the web page, per engine: similarity scores of different models
    are on different scales, so a value set for one must not carry over to another."""
    MIN, MAX = 0.15, 0.85

    def __init__(self, path: Path):
        self.path = Path(path)

    def _all(self) -> dict:
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def threshold(self, engine_name: str) -> float | None:
        value = self._all().get("threshold", {}).get(engine_name)
        return float(value) if isinstance(value, (int, float)) else None

    def set_threshold(self, engine_name: str, value: float | None):
        if value is not None and not self.MIN <= value <= self.MAX:
            raise FaceError(f"threshold ต้องอยู่ระหว่าง {self.MIN} ถึง {self.MAX}")
        data = self._all()
        thresholds = data.setdefault("threshold", {})
        if value is None:
            thresholds.pop(engine_name, None)
        else:
            thresholds[engine_name] = round(float(value), 3)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
