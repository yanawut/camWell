"""Serialise an Analytics snapshot into the JSON the frontend overlay draws from."""
from pathlib import Path

import cv2
import numpy as np

from . import config


def _pt(p, nd=1):
    return [round(float(p[0]), nd), round(float(p[1]), nd)]


def _box(b):
    return [round(float(v), 1) for v in b]


def _person(tr):
    return dict(
        id=tr.id, state=tr.state, conf=round(tr.conf, 2), box=_box(tr.box),
        trail=[list(p) for p in tr.trail], ground=_pt(tr.ground),
        floor=_pt(tr.smooth, 2), floorTrail=[_pt(p, 2) for p in list(tr.floor_trail)[::3]],
        speed=round(tr.speed, 2), zone=tr.zone,
    )


def _object(o):
    return dict(id=o["id"], cls=o["cls"], conf=round(o["conf"], 2), box=_box(o["box"]), seen=bool(o.get("seen")),
                occupied=bool(o.get("occupied")), floor=_pt(o["floor"], 2))


def heat_message(heat):
    """Same blur and gamma as Renderer.heatmap, as 0..255 cells."""
    if heat.max() > 0:
        hm = cv2.GaussianBlur(heat, (0, 0), 1.2)
        hm = (np.clip(hm / (hm.max() + 1e-6), 0, 1) ** 0.6 * 255).astype(np.uint8)
    else:
        hm = np.zeros_like(heat, np.uint8)
    return dict(w=int(hm.shape[1]), h=int(hm.shape[0]), data=hm.ravel().tolist())


def to_message(snap, cfg, frame_size, fps, proc_ms, source, with_heat):
    st, oc, zc = snap["states"], snap["obj_counts"], snap["zone_counts"]
    busiest = max(zc.items(), key=lambda kv: kv[1]) if zc else ("-", 0)
    occ, chairs = snap["chairs"]
    people, objects = snap["people"], snap["objects"]
    msg = dict(
        type="snapshot", frame=snap["frame"], t=round(snap["t"], 3), size=list(frame_size),
        fps=round(fps, 1), procMs=round(proc_ms, 1), badge=source.badge,
        model=f"YOLOv8 ({Path(config.DET_MODEL).stem})" if source.needs_detector else "Simulator",
        people=[_person(tr) for tr in people], objects=[_object(o) for o in objects],
        stats=dict(
            people=len(people),
            sitting=st.get("sitting", 0), standing=st.get("standing", 0), walking=st.get("walking", 0),
            chairsOccupied=occ, chairs=chairs,
            tables=oc.get("table", 0), monitors=oc.get("monitor", 0), laptops=oc.get("laptop", 0),
            maxSpeed=round(snap["max_speed"], 2), busiestZone=busiest[0], busiestCount=busiest[1],
            avgDwell=round(snap["avg_dwell"], 1), meanConf=round(snap["mean_conf"], 2),
            activeIds=len(people) + sum(1 for o in objects if o.get("seen")),
            zoneCounts=dict(zc),
        ),
        floor=dict(w=cfg.floor_size_m[0], d=cfg.floor_size_m[1],
                   zones={n: [list(p) for p in poly] for n, poly in cfg.zones.items()}),
    )
    if source.seekable:
        msg["clip"] = dict(pos=round(source.position, 2), duration=round(source.duration, 2))
    if with_heat:
        msg["heat"] = heat_message(snap["heat"])
    return msg
