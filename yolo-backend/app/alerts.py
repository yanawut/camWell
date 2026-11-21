"""Alert and presence records on disk, one JSON-lines file per day, plus the wellness settings.

wellness.WellnessMonitor writes a record when an alert starts and again when it ends, and a presence
record per person now and then. Records are only ever appended; reading keeps the last line per id."""
import datetime as dt
import json
import threading
from pathlib import Path

import wellness


def local_date(epoch: float) -> str:
    return dt.datetime.fromtimestamp(epoch).astimezone().date().isoformat()


class AlertStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self._lock = threading.Lock()

    def write(self, record: dict):
        day = local_date(record["started_at"])
        line = json.dumps(record, ensure_ascii=False)
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            with open(self.root / f"{day}.jsonl", "a", encoding="utf-8") as fh:
                fh.write(line + "\n")

    def day(self, day: str) -> dict:
        """{alerts: [...], presence: [...]} of one day (YYYY-MM-DD), the latest version of each record."""
        path = self.root / f"{dt.date.fromisoformat(day).isoformat()}.jsonl"
        latest: dict[tuple, dict] = {}
        if path.exists():
            with self._lock:
                lines = path.read_text(encoding="utf-8").splitlines()
            for line in lines:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue  # a line cut short by a crash
                latest[(rec.get("kind"), rec.get("id"))] = rec
        out = dict(alerts=[], presence=[])
        for (kind, _), rec in latest.items():
            if kind == "alert":
                out["alerts"].append(rec)
            elif kind == "presence":
                out["presence"].append(rec)
        out["alerts"].sort(key=lambda r: r["started_at"])
        return out

    def days(self, first: str, last: str) -> list[tuple[str, dict]]:
        d, end = dt.date.fromisoformat(first), dt.date.fromisoformat(last)
        if (end - d).days > 92:
            raise ValueError("ช่วงวันที่ยาวเกิน 92 วัน")
        out = []
        while d <= end:
            out.append((d.isoformat(), self.day(d.isoformat())))
            d += dt.timedelta(days=1)
        return out


class WellnessStore:
    """The alert settings from the web page, and each named person's usual face size per camera."""

    def __init__(self, settings_path: Path, baselines_path: Path):
        self.settings_path, self.baselines_path = Path(settings_path), Path(baselines_path)

    @staticmethod
    def _read(path):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    @staticmethod
    def _save(path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def settings(self) -> wellness.WellnessSettings:
        return wellness.WellnessSettings.from_dict(self._read(self.settings_path))

    def save_settings(self, settings: wellness.WellnessSettings):
        self._save(self.settings_path, settings.to_dict())

    def baselines(self) -> dict:
        return {k: float(v) for k, v in self._read(self.baselines_path).items() if isinstance(v, (int, float))}

    def save_baselines(self, baselines: dict):
        self._save(self.baselines_path, baselines)


_shared: dict = {}


def stores() -> tuple[AlertStore, WellnessStore]:
    """One store per process, so writes from the analysis thread and reads from requests share a lock."""
    from . import config
    if "alerts" not in _shared:
        _shared["alerts"] = AlertStore(config.ALERTS_DIR)
        _shared["wellness"] = WellnessStore(config.WELLNESS_SETTINGS, config.WELLNESS_BASELINES)
    return _shared["alerts"], _shared["wellness"]
