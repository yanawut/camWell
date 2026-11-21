"""The daily report: who was in front of the cameras, which alerts they got, and an Office Syndrome
screening per person, from the alert and presence records of app.alerts.AlertStore.

The screening is a behaviour score, not a diagnosis:
  posture   45 points  share of time in bad-posture alerts; 30% of the time present or more = all 45
  sitting   30 points  any 45-minute stretch = 15, rising to 30 at 90 minutes without a break
  eyes      25 points  share of time too close to the screen (20% = 15) + fatigue alerts (3 = 10)
High from 50, medium from 25. Under 10 minutes in view the data is too thin to say.
"""
import datetime as dt
from collections import Counter, defaultdict

import wellness

from .alerts import AlertStore, local_date

HIGH, MEDIUM, MIN_SECONDS = 50, 25, 600

# what each alert type tends to lead to, the body region involved, and what helps
ADVICE = {
    "neck": ("neck", "ปวดคอ บ่า ตึงต้นคอ จากการก้มหรือยื่นคอ (Text neck)",
             "ยกจอให้ขอบบนอยู่ระดับสายตา และยืดคอเอียงซ้ายขวาค้างไว้ 15 วินาทีทุกชั่วโมง"),
    "hunch": ("upper_back", "ปวดหลังส่วนบนและสะบัก กล้ามเนื้อตึงเรื้อรัง (Myofascial pain)",
              "นั่งชิดพนักพิง ดึงสะบักไปด้านหลังค้างไว้ 5 วินาที 10 ครั้งทุกชั่วโมง"),
    "lean": ("lower_back", "ปวดหลังข้างเดียว กล้ามเนื้อสองข้างทำงานไม่สมดุล",
             "วางเท้าราบทั้งสองข้าง ไม่นั่งไขว่ห้าง และวางของที่ใช้บ่อยไว้ตรงหน้า"),
    "sit_long": ("lower_back", "ปวดหลังส่วนล่าง ขาบวม เลือดไหลเวียนไม่ดีจากการนั่งนาน",
                 "ลุกเดินหรือยืดเส้น 2–3 นาทีทุก 45 นาที"),
    "close": ("eyes", "ตาล้า ตาแห้ง ปวดศีรษะ จากการมองจอใกล้ (Computer Vision Syndrome)",
              "จัดจอห่างประมาณหนึ่งช่วงแขน (50–70 ซม.) และใช้กฎ 20-20-20: ทุก 20 นาที มองไกล 20 ฟุต 20 วินาที"),
    "eyes_closed": ("eyes", "ง่วง อ่อนล้า สมาธิลดลง", "พักสายตา ดื่มน้ำ และนอนหลับให้เพียงพอ ถ้าง่วงบ่อยควรปรึกษาแพทย์"),
    "yawn": ("eyes", "ง่วง อ่อนล้า สมาธิลดลง", "พักสายตา ดื่มน้ำ และนอนหลับให้เพียงพอ ถ้าง่วงบ่อยควรปรึกษาแพทย์"),
    "fall": ("whole", "เสี่ยงบาดเจ็บจากการหกล้มหรือตกจากเก้าอี้",
             "ตรวจสอบอาการทันที หากเจ็บ เวียนศีรษะ หรือหมดสติควรพบแพทย์"),
    "fall_vanish": ("whole", "เสี่ยงบาดเจ็บจากการหกล้มหรือตกจากเก้าอี้",
                    "ตรวจสอบอาการทันที หากเจ็บ เวียนศีรษะ หรือหมดสติควรพบแพทย์"),
}
GOOD = "พฤติกรรมการนั่งอยู่ในเกณฑ์ดี รักษาจังหวะการพักและยืดเหยียดต่อไป"
DISCLAIMER = "เป็นการคัดกรองเบื้องต้นจากพฤติกรรมหน้ากล้อง ไม่ใช่การวินิจฉัยทางการแพทย์ หากมีอาการต่อเนื่องควรปรึกษาแพทย์"


def _key(rec):
    return ("name", rec["name"]) if rec.get("name") else ("track", f"{rec['session']}-{rec['person']}")


def _label(rec):
    return rec.get("name") or f"คนที่ {rec['person']}"


def risk(present_s, alerts) -> dict:
    sec = Counter()
    for a in alerts:
        sec[a["category"]] += a.get("seconds") or 0.0
    base = max(present_s, 1.0)
    posture = min(1.0, sec["posture"] / base / 0.3) * 45
    sits = [a["worst"].get("minutes", 45.0) for a in alerts if a["type"] == "sit_long"]
    sitting = 0.0 if not sits else 15 + min(15.0, max(0.0, (max(sits) - 45) / 45 * 15))
    eyes = min(1.0, sec["distance"] / base / 0.2) * 15 + min(1.0, sum(a["category"] == "fatigue" for a in alerts) / 3) * 10
    score = round(posture + sitting + eyes)
    enough = present_s >= MIN_SECONDS
    level = "high" if score >= HIGH else "medium" if score >= MEDIUM else "low"
    return dict(score=score, level=level, enough=enough,
                parts=dict(posture=round(posture), sitting=round(sitting), eyes=round(eyes)))


def build(store: AlertStore, day: str) -> dict:
    data = store.day(day)
    alerts, presence = data["alerts"], data["presence"]

    people: dict[tuple, dict] = {}

    def entry(rec):
        k = _key(rec)
        if k not in people:
            people[k] = dict(key=k[1], label=_label(rec), named=k[0] == "name", cameras=set(), segments=0,
                             present_seconds=0.0, sitting_seconds=0.0, first_at=None, last_at=None, alerts=[])
        return people[k]

    for p in presence:
        e = entry(p)
        e["segments"] += 1
        e["cameras"].add(p["camera"])
        e["present_seconds"] += p.get("seconds") or 0.0
        e["sitting_seconds"] += p.get("sitting_seconds") or 0.0
        e["first_at"] = min(filter(None, (e["first_at"], p["started_at"])))
        e["last_at"] = max(filter(None, (e["last_at"], p["last_at"])))
    for a in alerts:
        e = entry(a)
        e["alerts"].append(a)
        e["cameras"].add(a["camera"])
        e["first_at"] = min(filter(None, (e["first_at"], a["started_at"])))
        e["last_at"] = max(filter(None, (e["last_at"], a.get("ended_at") or a["started_at"])))

    week = _week(store, day)
    out_people = []
    for e in people.values():
        types = Counter(a["type"] for a in e["alerts"])
        regions = sorted({ADVICE[t][0] for t in types if t in ADVICE})
        symptoms = list(dict.fromkeys(ADVICE[t][1] for t, _ in types.most_common() if t in ADVICE))
        advice = list(dict.fromkeys(ADVICE[t][2] for t, _ in types.most_common() if t in ADVICE)) or [GOOD]
        sits = [a["worst"].get("minutes", 0.0) for a in e["alerts"] if a["type"] == "sit_long"]
        w = week.get(e["key"]) if e["named"] else None
        out_people.append(dict(
            key=e["key"], label=e["label"], named=e["named"], cameras=sorted(e["cameras"]), segments=e["segments"],
            first_at=e["first_at"], last_at=e["last_at"], present_seconds=round(e["present_seconds"], 1),
            sitting_seconds=round(e["sitting_seconds"], 1), alert_count=len(e["alerts"]),
            types=[dict(type=t, text=wellness.TYPE_TEXT.get(t, t), category=wellness.TYPE_CATEGORY.get(t), count=n)
                   for t, n in types.most_common()],
            by_category={c: sum(a["category"] == c for a in e["alerts"]) for c in wellness.CATEGORIES},
            longest_sit_minutes=round(max(sits), 1) if sits else None,
            fell=any(a["category"] == "fall" for a in e["alerts"]),
            risk=risk(e["present_seconds"], e["alerts"]), regions=regions, symptoms=symptoms, advice=advice,
            week=w))
    out_people.sort(key=lambda p: (-p["fell"], -p["risk"]["score"], p["label"]))

    hourly = [dict(hour=h, **{c: 0 for c in wellness.CATEGORIES}) for h in range(24)]
    for a in alerts:
        hourly[dt.datetime.fromtimestamp(a["started_at"]).hour][a["category"]] += 1
    types = Counter(a["type"] for a in alerts)
    cameras = defaultdict(lambda: dict(segments=0, alerts=0, **{c: 0 for c in wellness.CATEGORIES}))
    for p in presence:
        cameras[p["camera"]]["segments"] += 1
    for a in alerts:
        cameras[a["camera"]]["alerts"] += 1
        cameras[a["camera"]][a["category"]] += 1
    levels = Counter(p["risk"]["level"] for p in out_people)
    return dict(
        date=day,
        totals=dict(people=len(out_people), segments=len(presence),
                    present_seconds=round(sum(p.get("seconds") or 0.0 for p in presence), 1),
                    alerts=len(alerts), **{c: sum(a["category"] == c for a in alerts) for c in wellness.CATEGORIES}),
        risk_counts=dict(high=levels["high"], medium=levels["medium"], low=levels["low"]),
        hourly=hourly,
        types=[dict(type=t, text=wellness.TYPE_TEXT.get(t, t), category=wellness.TYPE_CATEGORY.get(t), count=n,
                    percent=round(n / len(alerts) * 100)) for t, n in types.most_common()],
        people=out_people,
        cameras=[dict(camera=c, **v) for c, v in sorted(cameras.items())],
        disclaimer=DISCLAIMER,
        formula="ท่านั่งผิดปกติ 45% + นั่งต่อเนื่องนาน 30% + ระยะห่างจอและความล้า 25% "
                f"(เสี่ยงสูงตั้งแต่ {HIGH}, ปานกลางตั้งแต่ {MEDIUM} จาก 100)",
    )


def _week(store: AlertStore, day: str) -> dict:
    """Per name over the 7 days ending on `day`: on how many days they had alerts, of the days they were seen."""
    end = dt.date.fromisoformat(day)
    seen, alerted = defaultdict(set), defaultdict(set)
    for d, data in store.days((end - dt.timedelta(days=6)).isoformat(), day):
        for p in data["presence"]:
            if p.get("name"):
                seen[p["name"]].add(d)
        for a in data["alerts"]:
            if a.get("name"):
                seen[a["name"]].add(d)
                alerted[a["name"]].add(d)
    return {name: dict(days_seen=len(days), days_alerted=len(alerted[name])) for name, days in seen.items()}


def today() -> str:
    return local_date(dt.datetime.now().timestamp())
