"""User files: stored under generated names so a client filename never reaches a path."""
import json
import re
import uuid
from pathlib import Path
from typing import BinaryIO

KINDS = {
    **dict.fromkeys((".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"), "video"),
    **dict.fromkeys((".jpg", ".jpeg", ".png", ".bmp", ".webp"), "image"),
}
_ID = re.compile(r"^[0-9a-f]{32}$")


class UploadError(ValueError):
    pass


class TooLarge(UploadError):
    pass


class UploadStore:
    def __init__(self, root: Path, max_bytes: int):
        self.root, self.max_bytes = root, max_bytes

    def save(self, name: str, stream: BinaryIO) -> dict:
        ext = Path(name).suffix.lower()
        kind = KINDS.get(ext)
        if kind is None:
            raise UploadError(f"ไม่รองรับไฟล์ {ext or name} (รองรับ {', '.join(sorted(KINDS))})")
        self.root.mkdir(parents=True, exist_ok=True)
        uid = uuid.uuid4().hex
        path, total = self.root / f"{uid}{ext}", 0
        try:
            with open(path, "wb") as fh:
                while chunk := stream.read(1024 * 1024):
                    total += len(chunk)
                    if total > self.max_bytes:
                        raise TooLarge("ไฟล์ใหญ่เกินกำหนด")
                    fh.write(chunk)
        except UploadError:
            path.unlink(missing_ok=True)
            raise
        meta = dict(id=uid, kind=kind, name=Path(name).name, ext=ext, bytes=total)
        (self.root / f"{uid}.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        return meta

    def resolve(self, uid: str, kind: str) -> tuple[Path, str]:
        """Path and display name of an upload of the given kind."""
        meta_path = self.root / f"{uid}.json"
        if not _ID.match(uid) or not meta_path.exists():
            raise UploadError("ไม่พบไฟล์ที่อัปโหลด")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta["kind"] != kind:
            raise UploadError(f"ไฟล์นี้เป็น {meta['kind']} ไม่ใช่ {kind}")
        return self.root / f"{uid}{meta['ext']}", meta["name"]
