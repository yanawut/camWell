import numpy as np
import pytest
from pydantic import ValidationError

import room_analytics as ra
from app.analytics import AreaAnalytics
from app.settings import GRID, FloorSettings, SettingsStore, Zone, default_settings

GOOD = dict(floor_pts=[(0.2, 0.4), (0.8, 0.4), (0.99, 0.98), (0.01, 0.98)], floor_size_m=(8, 6))
LEFT_RIGHT = [Zone(name="Left", box=(0, 0, GRID // 2, GRID)), Zone(name="Right", box=(GRID // 2, 0, GRID, GRID))]


def test_defaults_match_the_analytics_defaults():
    s = default_settings()
    assert s.floor_pts == [tuple(p) for p in ra.default_floor_pts(1, 1)]
    assert s.floor_size_m == ra.Config.floor_size_m


def test_the_default_is_one_zone_over_the_whole_floor():
    assert [(z.name, z.box) for z in default_settings().zones] == [("Zone A", (0, 0, GRID, GRID))]


@pytest.mark.parametrize("change", [
    dict(floor_pts=[(0.1, 0.1), (0.9, 0.1), (0.9, 0.9)]),                         # 3 points
    dict(floor_pts=[(0.1, 0.1), (0.9, 0.1), (1.5, 0.9), (0.1, 0.9)]),              # off frame
    dict(floor_pts=[(0.1, 0.1), (0.9, 0.9), (0.9, 0.1), (0.1, 0.9)]),              # crossed
    dict(floor_pts=[(0.1, 0.1), (0.5, 0.1), (0.9, 0.1), (0.2, 0.1)]),              # collinear
    dict(floor_size_m=(0, 6)),
    dict(floor_size_m=(5000, 6)),
])
def test_invalid_settings_are_rejected(change):
    with pytest.raises(ValidationError):
        FloorSettings(**{**GOOD, **change})


@pytest.mark.parametrize("zones", [
    [],                                                                            # nothing covers the floor
    [dict(name="A", box=(0, 0, 10, GRID))],                                        # a gap
    [dict(name="A", box=(0, 0, 12, GRID)), dict(name="B", box=(10, 0, GRID, GRID))],  # an overlap
    [dict(name="A", box=(0, 0, GRID + 1, GRID))],                                  # off the grid
    [dict(name="A", box=(5, 0, 5, GRID))],                                         # no width
    [dict(name=" ", box=(0, 0, GRID, GRID))],
    [dict(name="A", box=(0, 0, 10, GRID)), dict(name="A", box=(10, 0, GRID, GRID))],
    [dict(name="A", box=(0, 0, 14, 6)), dict(name="B", box=(14, 0, 20, 14)), dict(name="C", box=(6, 14, 20, 20)),
     dict(name="D", box=(0, 6, 6, 20)), dict(name="E", box=(6, 6, 14, 14))],                # a pinwheel has no straight cut
])
def test_zones_must_fill_the_floor_exactly(zones):
    with pytest.raises(ValidationError):
        FloorSettings(**GOOD, zones=zones)


def test_store_round_trip(tmp_path):
    store = SettingsStore(tmp_path / "s.json")
    assert store.load() == default_settings()
    saved = FloorSettings(**GOOD, zones=LEFT_RIGHT)
    store.save(saved)
    assert store.load() == saved


def test_a_settings_file_with_the_old_polygon_zones_loads_as_the_default_zone(tmp_path):
    path = tmp_path / "old.json"
    path.write_text('{"floor_pts": [[0.2, 0.4], [0.8, 0.4], [0.99, 0.98], [0.01, 0.98]], "floor_size_m": [8, 6], '
                    '"zones": {"Zone A": [[0, 0], [4, 0], [4, 6]]}, "floor_area": [[0.2, 0.4], [0.8, 0.4], [0.5, 0.9]]}',
                    encoding="utf-8")
    loaded = SettingsStore(path).load()
    assert [z.name for z in loaded.zones] == ["Zone A"]
    assert len(loaded.floor_area) == 3, "the frame is kept"


def test_apply_scales_points_to_the_frame():
    cfg = FloorSettings(**GOOD).apply(ra.Config(), (1000, 500))
    assert cfg.floor_img_pts[1] == (800, 200)
    assert cfg.floor_size_m == (8, 6)


def test_zones_divide_the_floor_in_metres():
    cfg = FloorSettings(**GOOD, zones=LEFT_RIGHT).apply(ra.Config(), (1000, 500))
    assert cfg.zones == {"Left": [(0, 0), (4, 0), (4, 6), (0, 6)], "Right": [(4, 0), (8, 0), (8, 6), (4, 6)]}


SIZE = (1280, 720)
TRUE_ROOM = ra.OfficeSim(1, SIZE, 25, 7).fm  # a real camera model with a known 10 x 7 m floor
REF_ORIGIN = (3, 2)
L_SHAPE = [(0, 0), (10, 0), (10, 3), (5, 3), (5, 7), (0, 7)]  # true metres; the notch is x > 5 and y > 3


def in_picture(*floor_points):
    return [(float(x) / SIZE[0], float(y) / SIZE[1]) for x, y in TRUE_ROOM.to_img(floor_points)]


def with_frame(zones=None):
    """A 4 x 3 m reference rectangle in the middle of the room, and a frame around the whole L-shaped floor."""
    ox, oy = REF_ORIGIN
    corners = in_picture((ox, oy), (ox + 4, oy), (ox + 4, oy + 3), (ox, oy + 3))
    extra = dict(zones=zones) if zones else {}
    return FloorSettings(floor_pts=corners, floor_size_m=(4, 3), floor_area=in_picture(*L_SHAPE), **extra)


def zone_and_count_at(settings, position):
    cfg = settings.apply(ra.Config(), SIZE)
    analytics = AreaAnalytics(cfg, 25, SIZE, settings.area_in_config())
    x, y = TRUE_ROOM.to_img([position])[0]
    snap = analytics.update([ra.PersonDet(1, np.array([x - 20, y - 150, x + 20, y]), 0.9)], [], 0.0)
    return snap["people"][0], snap["zone_counts"], len(snap["people"])


def test_the_frame_past_the_reference_rectangle_keeps_real_world_positions():
    settings = with_frame()
    cfg = settings.apply(ra.Config(), SIZE)
    assert cfg.floor_size_m == pytest.approx((10, 7), abs=0.01)
    assert np.array(settings.area_in_config()) == pytest.approx(np.array(L_SHAPE, float), abs=0.01)
    fm = ra.FloorMap(cfg.floor_img_pts, cfg.floor_size_m)
    probes = [(0.5, 0.5), (9.5, 0.5), (9.5, 2.5), (2.0, 6.5), (5.0, 3.0), (8.0, 5.0)]
    assert fm.to_floor(TRUE_ROOM.to_img(probes)) == pytest.approx(np.array(probes), abs=0.01)


def test_zones_stretch_with_the_frame():
    small = FloorSettings(floor_pts=with_frame().floor_pts, floor_size_m=(4, 3), zones=LEFT_RIGHT)
    assert small.apply(ra.Config(), SIZE).zones["Left"][2] == pytest.approx((2, 3))
    assert with_frame(LEFT_RIGHT).apply(ra.Config(), SIZE).zones["Left"][2] == pytest.approx((5, 7), abs=0.01)


@pytest.mark.parametrize("position,zone_name", [
    ((1, 6), "Left"),      # inside the frame, far outside the reference rectangle
    ((9, 1), "Right"),
    ((8, 5), "Outside"),   # in the notch of the frame, where a zone rectangle still reaches
])
def test_people_in_the_frame_are_in_a_zone_and_the_rest_are_outside(position, zone_name):
    person, zone_counts, people = zone_and_count_at(with_frame(LEFT_RIGHT), position)
    assert people == 1, "the frame must never remove anyone from the count"
    assert dict(zone_counts) == {zone_name: 1}
    assert person.smooth == pytest.approx(np.array(position), abs=0.02), "positions must not be pulled to the rectangle"


def test_no_frame_points_added_changes_nothing():
    settings = FloorSettings(**GOOD)
    assert settings.area_in_config() is None
    cfg = settings.apply(ra.Config(), SIZE)
    assert cfg.floor_img_pts == [(x * SIZE[0], y * SIZE[1]) for x, y in settings.floor_pts]
    assert cfg.zones == {"Zone A": [(0, 0), (8, 0), (8, 6), (0, 6)]}


def test_the_frame_round_trips(tmp_path):
    store = SettingsStore(tmp_path / "s.json")
    saved = with_frame()
    store.save(saved)
    assert store.load() == saved


@pytest.mark.parametrize("area", [
    [(0.1, 0.1), (0.9, 0.1)],                # too few points
    [(0.1, 0.1), (1.5, 0.1), (0.5, 0.9)],    # off the picture
])
def test_an_impossible_frame_is_refused(area):
    with pytest.raises(ValidationError):
        FloorSettings(**GOOD, floor_area=area)


STEEP = dict(floor_pts=[(0.4, 0.5), (0.6, 0.5), (0.9, 0.9), (0.1, 0.9)], floor_size_m=(4, 3))  # horizon at 36.7% of the height


def test_a_frame_point_above_the_horizon_is_refused_by_name():
    with pytest.raises(ValidationError, match="จุด 2"):
        FloorSettings(**STEEP, floor_area=[(0.3, 0.8), (0.5, 0.2), (0.7, 0.8)])


def test_a_frame_point_just_under_the_horizon_is_refused():
    with pytest.raises(ValidationError, match="กว้างเกิน"):
        FloorSettings(**STEEP, floor_area=[(0.3, 0.8), (0.5, 0.3671), (0.7, 0.8)])
