from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
