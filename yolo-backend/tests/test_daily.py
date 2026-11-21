"""The daily report from alert and presence records."""
import datetime as dt

from app import daily
from app.alerts import AlertStore

DAY = dt.date(2026, 11, 21)


def at(hour, minute=0, day=DAY):
    return dt.datetime.combine(day, dt.time(hour, minute)).timestamp()


def presence(store, pid, name, start, seconds, session="s1", camera="กล้อง 1"):
    store.write(dict(kind="presence", id=f"{session}-{pid}", session=session, camera=camera, person=pid, name=name,
                     started_at=start, last_at=start + seconds, seconds=seconds, sitting_seconds=seconds * 0.9))


def alert(store, pid, name, kind, category, start, seconds, worst=None, session="s1", camera="กล้อง 1", aid=None):
    store.write(dict(kind="alert", id=aid or f"{pid}-{kind}-{start}", session=session, camera=camera, person=pid,
                     name=name, category=category, type=kind, text=kind, started_at=start, ended_at=start + seconds,
                     seconds=seconds, worst=worst or {}))


def test_totals_people_hours_and_risk(tmp_path):
    store = AlertStore(tmp_path)
    presence(store, 1, "Alice", at(9), 4 * 3600)
    presence(store, 7, None, at(10), 3600)
    presence(store, 1, "Alice", at(14), 3600, session="s2")  # came back after lunch: one person, two segments
    alert(store, 1, "Alice", "neck", "posture", at(9, 30), 1800, dict(neck=40.0))
    alert(store, 1, "Alice", "sit_long", "break", at(10), 3600, dict(minutes=90.0))
    alert(store, 1, "Alice", "close", "distance", at(11), 600, dict(ratio=1.4))
    alert(store, 7, None, "fall", "fall", at(10, 15), 0)
    r = daily.build(store, DAY.isoformat())

    assert r["totals"] == dict(people=2, segments=3, present_seconds=6 * 3600, alerts=4, posture=1, distance=1,
                               **{"break": 1}, fatigue=0, fall=1)
    assert r["hourly"][9]["posture"] == 1 and r["hourly"][10]["fall"] == 1 and r["hourly"][10]["break"] == 1
    alice, unknown = sorted(r["people"], key=lambda p: p["label"])  # 'Alice' < 'คนที่ 7'
    assert alice["segments"] == 2 and alice["present_seconds"] == 5 * 3600
    assert alice["risk"]["parts"] == dict(posture=15, sitting=30, eyes=2) and alice["risk"]["level"] == "medium"
    assert set(alice["regions"]) == {"neck", "lower_back", "eyes"} and len(alice["advice"]) == 3
    assert unknown["label"] == "คนที่ 7" and unknown["fell"] and unknown["week"] is None
    assert r["people"][0]["fell"]  # a fall comes first
    assert r["types"][0]["percent"] == 25 and r["cameras"][0]["alerts"] == 4


def test_a_quiet_day_and_thin_data(tmp_path):
    store = AlertStore(tmp_path)
    presence(store, 3, "Bob", at(9), 300)
    (bob,) = daily.build(store, DAY.isoformat())["people"]
    assert bob["risk"] == dict(score=0, level="low", enough=False, parts=dict(posture=0, sitting=0, eyes=0))
    assert bob["advice"] == [daily.GOOD] and bob["symptoms"] == []
    assert daily.build(store, "2026-11-22")["people"] == []


def test_the_week_counts_days_with_alerts(tmp_path):
    store = AlertStore(tmp_path)
    for back in range(3):
        d = DAY - dt.timedelta(days=back)
        presence(store, 1, "Alice", at(9, day=d), 3600, session=f"s{back}")
    alert(store, 1, "Alice", "neck", "posture", at(9, 30, DAY - dt.timedelta(days=2)), 60, session="s2")
    (alice,) = daily.build(store, DAY.isoformat())["people"]
    assert alice["week"] == dict(days_seen=3, days_alerted=1)


def test_an_alert_still_open_counts_once(tmp_path):
    store = AlertStore(tmp_path)
    store.write(dict(kind="alert", id="a1", session="s", camera="c", person=1, name=None, category="posture",
                     type="neck", text="x", started_at=at(9), ended_at=None, seconds=None, worst={}))
    store.write(dict(kind="alert", id="a1", session="s", camera="c", person=1, name="Alice", category="posture",
                     type="neck", text="x", started_at=at(9), ended_at=at(9, 5), seconds=300, worst={}))
    r = daily.build(store, DAY.isoformat())
    assert r["totals"]["alerts"] == 1 and r["people"][0]["label"] == "Alice"


def test_endpoints(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from app import alerts, main
    store = AlertStore(tmp_path / "alerts")
    wstore = alerts.WellnessStore(tmp_path / "w.json", tmp_path / "b.json")
    monkeypatch.setattr(alerts, "stores", lambda: (store, wstore))
    presence(store, 1, "Alice", at(9), 3600)
    alert(store, 1, "Alice", "neck", "posture", at(9, 30), 120, dict(neck=40.0))
    with TestClient(main.app) as client:
        r = client.get("/api/alerts", params=dict(start="2026-11-15", end="2026-11-21")).json()
        assert [a["type"] for a in r["alerts"]] == ["neck"] and r["categories"]["posture"] == "ท่านั่ง"
        assert client.get("/api/alerts", params=dict(start="2026-01-01", end="2026-11-21")).status_code == 422
        assert client.get("/api/daily", params=dict(date="2026-11-21")).json()["totals"]["alerts"] == 1
        assert client.get("/api/wellness/settings").json()["sit_minutes"] == 45.0
        saved = client.put("/api/wellness/settings", json=dict(sit_minutes=30, fatigue_on=False)).json()
        assert saved["sit_minutes"] == 30.0 and saved["fatigue_on"] is False and saved["posture_on"] is True
        assert client.get("/api/wellness/settings").json()["sit_minutes"] == 30.0
        assert client.put("/api/wellness/settings", json=dict(sit_minutes=0)).status_code == 422
        assert client.get("/api/wellness/defaults").json()["sit_minutes"] == 45.0
