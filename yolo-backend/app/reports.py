"""One report per analytics run: tracks.csv written as it goes, report.json at the end."""
import csv
import json
import os
import re
import time
import uuid
from collections import Counter
from pathlib import Path

_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")


class ReportWriter:
    def __init__(self, root: Path, source: dict):
        self.root, self.source = root, source
        self.id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
        self.dir = root / self.id
        self.started_at = time.time()
        self.frames = 0
        self.timeline = []
        self.people = {}
        self._fh = self._csv = None
        self._layers_fh = None
        self._last_sample_s = None

    def add_layers(self, frame: int, t: float, layers: dict):
        if self._layers_fh is None:
            self.dir.mkdir(parents=True, exist_ok=True)
            self._layers_fh = open(self.dir / "layers.jsonl", "w", encoding="utf-8")
        self._layers_fh.write(json.dumps(dict(i=frame, t=round(t, 3), **layers), separators=(",", ":")) + "\n")

    def close_layers(self):
        if self._layers_fh:
            self._layers_fh.close()
            self._layers_fh = None

    def add_records(self, rows: list[dict]):
        if not rows:
            return
        if self._csv is None:
            self.dir.mkdir(parents=True, exist_ok=True)
            # zone names can be Thai; the BOM is what makes Excel read them as UTF-8
            self._fh = open(self.dir / "tracks.csv", "w", newline="", encoding="utf-8-sig")
            self._csv = csv.DictWriter(self._fh, fieldnames=list(rows[0].keys()))
            self._csv.writeheader()
        self._csv.writerows(rows)
        self._fh.flush()
        for r in rows:
            p = self.people.setdefault(r["id"], dict(id=r["id"], first_t=r["t"], last_t=r["t"], frames=0,
                                                     states=Counter()))
            p["last_t"] = r["t"]
            p["frames"] += 1
            p["states"][r["state"]] += 1

    def sample(self, snap):
        self.frames += 1
        second = int(snap["t"])
        if second != self._last_sample_s:
            self._last_sample_s = second
            st = snap["states"]
            self.timeline.append(dict(t=second, people=len(snap["people"]), sitting=st.get("sitting", 0),
                                      standing=st.get("standing", 0), walking=st.get("walking", 0)))

    def close(self, summary: dict, outcome: str) -> str | None:
        self.close_layers()
        if self._fh:
            self._fh.close()
            self._fh = None
        if not self.frames:
            return None
        self.dir.mkdir(parents=True, exist_ok=True)
        report = dict(
            id=self.id, source=self.source, outcome=outcome, started_at=self.started_at, ended_at=time.time(),
            frames=self.frames, summary=summary, timeline=self.timeline, has_csv=self._csv is not None,
            people=[dict(id=p["id"], first_t=p["first_t"], last_t=p["last_t"], frames=p["frames"],
                         sitting=p["states"]["sitting"], standing=p["states"]["standing"],
                         walking=p["states"]["walking"]) for p in self.people.values()],
        )
        tmp = self.dir / "report.tmp"
        tmp.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.dir / "report.json")
        return self.id


class ReportStore:
    def __init__(self, root: Path):
        self.root = root

    def list(self) -> list[dict]:
        if not self.root.exists():
            return []
        rows = []
        for d in sorted(self.root.iterdir(), reverse=True):
            f = d / "report.json"
            if f.exists():
                r = json.loads(f.read_text(encoding="utf-8"))
                r.pop("timeline")
                r.pop("people")
                rows.append(r)
        return rows

    def get(self, rid: str) -> dict | None:
        f = self.root / rid / "report.json"
        if not _ID.match(rid) or not f.exists():
            return None
        return json.loads(f.read_text(encoding="utf-8"))

    def csv_path(self, rid: str) -> Path | None:
        p = self.root / rid / "tracks.csv"
        return p if _ID.match(rid) and p.exists() else None
