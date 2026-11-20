"""Floor calibration and zones, persisted as JSON and validated at the API boundary.

Floor points are stored normalised to 0..1 because each source has its own resolution.
Zones are rectangles on a grid laid over the floor, so they follow the frame when it changes.
"""
import json
import os
from pathlib import Path

import numpy as np
from pydantic import BaseModel, Field, field_validator, model_validator

import room_analytics as ra

Point = tuple[float, float]
GRID = 20  # cells per side; 5% steps keep halves of a half on a line
MAX_EXTENT_M = 100
MIN_DEPTH_RATIO = 0.05  # floor points near or behind the camera's own plane project to infinity


def _is_convex(pts: list[Point]) -> bool:
    cross = []
    for i in range(4):
        (ax, ay), (bx, by), (cx, cy) = pts[i], pts[(i + 1) % 4], pts[(i + 2) % 4]
        cross.append((bx - ax) * (cy - by) - (by - ay) * (cx - bx))
    return all(c > 1e-6 for c in cross) or all(c < -1e-6 for c in cross)


def _can_be_cut(boxes) -> bool:
    """The page only makes layouts it can split with straight cuts, and relies on that to edit them."""
    if len(boxes) == 1:
        return True
    for along in (0, 1):
        for at in {box[along] for box in boxes}:
            before = [box for box in boxes if box[along + 2] <= at]
            after = [box for box in boxes if box[along] >= at]
            if before and after and len(before) + len(after) == len(boxes):
                return _can_be_cut(before) and _can_be_cut(after)
    return False


class Zone(BaseModel):
    name: str
    box: tuple[int, int, int, int]  # x0, y0, x1, y1 in grid cells


def _whole_floor() -> list[Zone]:
    return [Zone(name="Zone A", box=(0, 0, GRID, GRID))]


class FloorSettings(BaseModel):
    floor_pts: list[Point]  # far-left, far-right, near-right, near-left
    floor_size_m: Point
    zones: list[Zone] = Field(default_factory=_whole_floor)
    floor_area: list[Point] | None = None  # image polygon, normalised; None is the whole picture

    @field_validator("floor_area")
    @classmethod
    def _polygon_in_frame(cls, pts):
        if pts is not None and (len(pts) < 3 or not all(0 <= v <= 1 for p in pts for v in p)):
            raise ValueError("floor_area must be at least 3 points normalised to 0..1")
        return pts

    @field_validator("floor_pts")
    @classmethod
    def _four_points_in_frame(cls, pts):
        if len(pts) != 4 or not all(0 <= v <= 1 for p in pts for v in p):
            raise ValueError("floor_pts must be 4 points normalised to 0..1")
        return pts

    @field_validator("floor_size_m")
    @classmethod
    def _sane_size(cls, size):
        if not all(0 < v <= 200 for v in size):
            raise ValueError("floor size must be between 0 and 200 metres")
        return size

    @field_validator("zones")
    @classmethod
    def _zones_fill_the_floor(cls, zones):
        names = [z.name for z in zones]
        if not all(n.strip() for n in names) or len(set(names)) != len(names):
            raise ValueError("zone names must be unique and not empty")
        cells = np.zeros((GRID, GRID), int)
        for zone in zones:
            x0, y0, x1, y1 = zone.box
            if not (0 <= x0 < x1 <= GRID and 0 <= y0 < y1 <= GRID):
                raise ValueError(f"zone {zone.name!r} is outside the grid")
            cells[y0:y1, x0:x1] += 1
        if not (cells == 1).all():
            raise ValueError("zones must fill the floor without overlapping")
        if not _can_be_cut([zone.box for zone in zones]):
            raise ValueError("zones must be divisible by straight cuts")
        return zones

    @model_validator(mode="after")
    def _solvable_homography(self):
        if not _is_convex(self.floor_pts):
            raise ValueError("floor points must form a convex quad in order "
                             "far-left, far-right, near-right, near-left")
        h = ra.FloorMap(self.floor_pts, self.floor_size_m).H
        image_depth = lambda x, y: h[2, 0] * x + h[2, 1] * y + h[2, 2]
        inside = sum(image_depth(x, y) for x, y in self.floor_pts)
        for i, (x, y) in enumerate(self.floor_area or [], start=1):
            if image_depth(x, y) * inside <= 0:
                raise ValueError(f"จุด {i} ของกรอบพื้นที่อยู่เหนือเส้นขอบฟ้าของภาพ จึงไม่ใช่พื้น")
        x0, y0, x1, y1 = self.extents()
        if max(x1 - x0, y1 - y0) > MAX_EXTENT_M:
            raise ValueError(f"กรอบกว้างเกิน {MAX_EXTENT_M} เมตร อาจลากจุดใกล้เส้นขอบฟ้าของภาพเกินไป")
        W, D = self.floor_size_m
        hinv = ra.FloorMap(self.floor_pts, self.floor_size_m).Hinv
        depth = lambda x, y: hinv[2, 0] * x + hinv[2, 1] * y + hinv[2, 2]
        reference = sum(depth(x, y) for x, y in ((0, 0), (W, 0), (W, D), (0, D))) / 4
        # depth is linear in x and y, so checking the bounding box corners covers every point inside it
        if any(depth(x, y) / reference < MIN_DEPTH_RATIO for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))):
            raise ValueError("กรอบเลยตำแหน่งกล้องออกไป ให้ตรวจจุดของกรอบ")
        return self

    def area_on_floor(self) -> list[Point]:
        """The floor area polygon in the reference rectangle's metres."""
        if self.floor_area is None:
            return []
        points = ra.FloorMap(self.floor_pts, self.floor_size_m).to_floor(self.floor_area)
        return [(float(x), float(y)) for x, y in points]

    def extents(self) -> tuple[float, float, float, float]:
        """x0, y0, x1, y1 around the reference rectangle and the floor area, in the rectangle's metres."""
        W, D = self.floor_size_m
        points = self.area_on_floor()
        xs = [0.0, W, *(p[0] for p in points)]
        ys = [0.0, D, *(p[1] for p in points)]
        return min(xs), min(ys), max(xs), max(ys)

    def zones_in_config(self) -> dict[str, list[Point]]:
        """Zone rectangles in the metres apply() gives Analytics: the grid is stretched over the extents."""
        x0, y0, x1, y1 = self.extents()
        sx, sy = (x1 - x0) / GRID, (y1 - y0) / GRID
        zones = {}
        for zone in self.zones:
            a, b, c, d = zone.box
            zones[zone.name] = [(a * sx, b * sy), (c * sx, b * sy), (c * sx, d * sy), (a * sx, d * sy)]
        return zones

    def area_in_config(self) -> list[Point] | None:
        """The floor area in the metres apply() gives Analytics, or None when the whole picture counts."""
        if self.floor_area is None:
            return None
        x0, y0, _, _ = self.extents()
        return [(x - x0, y - y0) for x, y in self.area_on_floor()]

    def apply(self, cfg: ra.Config, frame_size) -> ra.Config:
        """The 4 points only fix the floor plane. Analytics clips people to its rectangle, so hand it
        one that covers the frame: its corners can lie off screen, cv2 does not mind."""
        w, h = frame_size
        pts = [(x * w, y * h) for x, y in self.floor_pts]
        x0, y0, x1, y1 = self.extents()
        cfg.zones = self.zones_in_config()
        if (x0, y0, x1, y1) == (0, 0, *self.floor_size_m):
            cfg.floor_img_pts = pts
            cfg.floor_size_m = self.floor_size_m
            return cfg
        corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        cfg.floor_img_pts = [(float(x), float(y)) for x, y in ra.FloorMap(pts, self.floor_size_m).to_img(corners)]
        cfg.floor_size_m = (x1 - x0, y1 - y0)
        return cfg


def default_settings() -> FloorSettings:
    return FloorSettings(floor_pts=ra.default_floor_pts(1, 1), floor_size_m=ra.Config.floor_size_m)


class SettingsStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> FloorSettings:
        if not self.path.exists():
            return default_settings()
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if isinstance(data.get("zones"), dict):  # saved when zones were free polygons: back to the default zone
            del data["zones"]
        return FloorSettings.model_validate(data)

    def save(self, settings: FloorSettings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(settings.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)
