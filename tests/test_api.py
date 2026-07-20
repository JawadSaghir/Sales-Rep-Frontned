import csv as _csv
from importlib import reload

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
    assert any(p["slug"] == "charlie-ritenour-closing" for p in personas)
    diffs = {d["level"] for d in client.get("/api/difficulties").json()["data"]}
    assert {"easy", "medium", "hard"} <= diffs


def test_persona_payload_is_human_readable():
    personas = client.get("/api/personas").json()["data"]
    charlie = next(p for p in personas if p["slug"] == "charlie-ritenour-closing")
    assert charlie["character_name"] == "Charlie Ritenour"
    # primary_objection must be the objection's human text, not the bare id "price"
    assert charlie["primary_objection"] not in ("", "price")
    assert " " in charlie["primary_objection"]
    # business_name should be populated so the UI subtitle isn't a stray " · "
    assert charlie["business_name"].strip()


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


def _write_rep_csv(path):
    cols = ["rep_name", "grade", "total_score", "no_show", "what_to_improve",
            "coaching_tip", "why_no_close", "biggest_strength", "objections_surfaced"]
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerow({"rep_name": "Adam Pellegrino", "grade": "B", "total_score": "70",
                    "no_show": "no", "what_to_improve": "Anchor price sooner.",
                    "coaching_tip": "Same-day savings.", "why_no_close": "Logistics.",
                    "biggest_strength": "Value walk.", "objections_surfaced": "Contract."})


def test_reps_endpoints(tmp_path, monkeypatch):
    csv_path = tmp_path / "rep.csv"
    _write_rep_csv(csv_path)
    monkeypatch.setenv("REP_CSV", str(csv_path))
    from api import main as m
    from api import settings as s

    reload(s)
    reload(m)
    c = TestClient(m.app)
    reps = c.get("/api/reps").json()["data"]
    assert any(r["slug"] == "adam-pellegrino" for r in reps)
    assert c.get("/api/reps/adam-pellegrino").json()["data"]["name"] == "Adam Pellegrino"
    assert c.get("/api/reps/nobody").status_code == 404
    assert c.get("/api/reps/adam-pellegrino/drill-plan").json()["data"][0]["focus"]


def test_team_ranking():
    from api import objection_store

    rows = [
        {"objection_type": "Legal/Contract"},
        {"objection_type": "Price"},
        {"objection_type": "Price"},
        {"objection_type": ""},
    ]
    ranking = objection_store.team_ranking(rows)
    assert ranking[0] == {"objection_type": "Price", "count": 2}
    assert all(r["objection_type"] for r in ranking)  # blanks dropped


def test_build_room_metadata_is_json():
    import json

    from api import livekit_session
    from context.models import Selection

    sel = Selection(
        persona_id="charlie-ritenour",
        scenario_id="charlie-ritenour",
        call_type="closing",
        difficulty="medium",
        scorecard="closing_v1",
    )
    md = livekit_session.build_room_metadata(
        "s1", "adam-pellegrino", "charlie-ritenour-closing", sel
    )
    assert json.loads(md) == {
        "session_id": "s1",
        "rep_slug": "adam-pellegrino",
        "bot_slug": "charlie-ritenour-closing",
        "persona_id": "charlie-ritenour",
        "scenario_id": "charlie-ritenour",
        "call_type": "closing",
        "difficulty": "medium",
        "scorecard": "closing_v1",
    }


def test_session_metadata_drives_agent_selection(tmp_path, monkeypatch):
    """The bot the user picked must reach the agent via room metadata.

    Without persona_id in the metadata the agent silently falls back to
    DEFAULT_SELECTION, so every call would role-play the default persona.
    """
    monkeypatch.setenv("SESSIONS_DB", str(tmp_path / "s2.db"))
    from importlib import reload

    from api import livekit_session
    from api import main as m
    from api import settings as s

    reload(s)
    reload(m)
    monkeypatch.setattr(livekit_session, "mint_token", lambda *a, **k: "tok")
    captured = {}

    async def _fake_create_room(*a, **k):
        captured["metadata"] = a[1] if len(a) > 1 else k.get("metadata")

    monkeypatch.setattr(livekit_session, "create_room", _fake_create_room)
    c = TestClient(m.app)
    r = c.post(
        "/api/sessions",
        json={
            "rep_slug": "adam-pellegrino",
            "call_type": "closing",
            "persona_slug": "charlie-ritenour-closing",
            "difficulty": "hard",
        },
    )
    assert r.status_code == 200

    from context.selection import DEFAULT_SELECTION, selection_from_metadata

    sel = selection_from_metadata(captured["metadata"], fallback=DEFAULT_SELECTION)
    assert sel.persona_id == "charlie-ritenour"
    assert sel.scenario_id == "charlie-ritenour"
    assert sel.call_type == "closing"
    assert sel.scorecard == "closing_v1"
    # session-chosen difficulty must win over the bot's own default ("medium")
    assert sel.difficulty == "hard"


def test_post_session_happy_and_validation(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSIONS_DB", str(tmp_path / "s.db"))
    from importlib import reload

    from api import livekit_session
    from api import main as m
    from api import settings as s

    reload(s)
    reload(m)
    monkeypatch.setattr(livekit_session, "mint_token", lambda *a, **k: "tok_123")

    async def _fake_create_room(*a, **k):
        return None

    monkeypatch.setattr(livekit_session, "create_room", _fake_create_room)
    c = TestClient(m.app)
    good = c.post(
        "/api/sessions",
        json={
            "rep_slug": "adam-pellegrino",
            "call_type": "closing",
            "persona_slug": "charlie-ritenour-closing",
            "difficulty": "medium",
        },
    )
    assert good.status_code == 200
    sid = good.json()["data"]["session_id"]
    assert good.json()["data"]["token"] == "tok_123"
    assert c.get(f"/api/sessions/{sid}").json()["data"]["status"] == "created"
    bad = c.post(
        "/api/sessions",
        json={
            "rep_slug": "x",
            "call_type": "nope",
            "persona_slug": "charlie-ritenour-closing",
            "difficulty": "medium",
        },
    )
    assert bad.status_code == 400
    assert c.get("/api/sessions/nonexistent").status_code == 404
