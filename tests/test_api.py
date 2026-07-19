from fastapi.testclient import TestClient

from api import rep_store
from api.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"


def test_call_types_lists_real_yaml():
    r = client.get("/api/call-types")
    assert r.status_code == 200
    slugs = {c["slug"] for c in r.json()["data"]}
    assert {"closing", "discovery", "follow_up"} <= slugs
    closing = next(c for c in r.json()["data"] if c["slug"] == "closing")
    assert closing["locked"] is False and closing["label"]


def test_personas_and_difficulties():
    personas = client.get("/api/personas").json()["data"]
    assert any(p["slug"] == "april-alvarado-closing" for p in personas)
    diffs = {d["level"] for d in client.get("/api/difficulties").json()["data"]}
    assert {"easy", "medium", "hard"} <= diffs


_ROWS = [
    {"rep_name": "Adam Pellegrino", "grade": "B", "total_score": "70", "no_show": "no",
     "coaching_tip": "Introduce same-day savings.", "what_to_improve": "Anchor price sooner.",
     "why_no_close": "Logistics gap.", "biggest_strength": "Clear value walk.",
     "objections_surfaced": "Contract-review concern."},
    {"rep_name": "Adam Pellegrino", "grade": "A", "total_score": "90", "no_show": "no",
     "coaching_tip": "Lock the deposit.", "what_to_improve": "Ask for the close.",
     "why_no_close": "", "biggest_strength": "Strong rapport.", "objections_surfaced": "Price."},
    {"rep_name": "Bea Ortiz", "grade": "N/A", "total_score": "N/A", "no_show": "no",
     "what_to_improve": "Slow down.", "coaching_tip": "Breathe."},
]


def test_load_rows_filters_and_missing_file(tmp_path):
    import csv as _c
    p = tmp_path / "reps.csv"
    with open(p, "w", encoding="utf-8", newline="") as f:
        w = _c.DictWriter(f, fieldnames=["rep_name", "no_show", "total_score"])
        w.writeheader()
        w.writerow({"rep_name": "Adam Pellegrino", "no_show": "no", "total_score": "70"})
        w.writerow({"rep_name": "Ghost Rep", "no_show": "yes", "total_score": "10"})   # no-show → skipped
        w.writerow({"rep_name": "", "no_show": "no", "total_score": "5"})               # empty name → skipped
    rows = rep_store.load_rows(p)
    assert [r["rep_name"] for r in rows] == ["Adam Pellegrino"]
    assert rep_store.load_rows(tmp_path / "does-not-exist.csv") == []


def test_rep_summaries_group_and_normalize():
    s = {r["slug"]: r for r in rep_store.rep_summaries(_ROWS)}
    adam = s["adam-pellegrino"]
    assert adam["name"] == "Adam Pellegrino"
    assert adam["calls"] == 2
    assert adam["avg_total_score"] == 80.0
    assert adam["grade_normalized"] in {"good", "strong", "elite"}
    # Bea has only junk total_score → avg None, still listed
    assert s["bea-ortiz"]["avg_total_score"] is None


def test_rep_profile_and_drill_plan():
    prof = rep_store.rep_profile(_ROWS, "adam-pellegrino")
    assert prof["name"] == "Adam Pellegrino"
    assert "Anchor price sooner." in prof["what_to_improve"]
    assert rep_store.rep_profile(_ROWS, "nobody") is None
    plan = rep_store.rep_drill_plan(_ROWS, "adam-pellegrino")
    assert plan and "focus" in plan[0] and "coaching_tip" in plan[0]
