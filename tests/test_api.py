from fastapi.testclient import TestClient

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
