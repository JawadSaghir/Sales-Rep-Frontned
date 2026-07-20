"""LiveKit credential plumbing for the frontend -> API -> LiveKit handoff.

The browser never talks to LiveKit directly: `frontend/lib/api.ts` POSTs to
`/api/sessions`, which creates the room and mints the join token. If the API
process has no LiveKit credentials the handoff dies there, and the roleplay page
just sits on "Waiting for the prospect…". These tests pin down the two ways that
used to fail silently.
"""

from __future__ import annotations

from importlib import reload

from fastapi.testclient import TestClient

_LIVEKIT_VARS = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")


def test_load_settings_reads_credentials_from_env_file(tmp_path, monkeypatch):
    """Credentials live in .env.local, not the shell — the API must read it.

    `src/agent.py` calls load_dotenv(); the API did not, so it only worked when
    uvicorn happened to inherit the vars from an already-configured shell.
    """
    for var in _LIVEKIT_VARS:
        monkeypatch.delenv(var, raising=False)
    env_file = tmp_path / ".env.local"
    env_file.write_text(
        "LIVEKIT_URL=wss://example.livekit.cloud\n"
        "LIVEKIT_API_KEY=APIkey123\n"
        "LIVEKIT_API_SECRET=secret456\n",
        encoding="utf-8",
    )

    from api import settings as s

    reload(s)
    loaded = s.load_settings(env_file=env_file)

    assert loaded.livekit_url == "wss://example.livekit.cloud"
    assert loaded.livekit_key == "APIkey123"
    assert loaded.livekit_secret == "secret456"


def test_env_does_not_override_explicitly_set_vars(tmp_path, monkeypatch):
    """A var already exported in the environment wins over the file."""
    monkeypatch.setenv("LIVEKIT_URL", "wss://from-shell.livekit.cloud")
    env_file = tmp_path / ".env.local"
    env_file.write_text("LIVEKIT_URL=wss://from-file.livekit.cloud\n", encoding="utf-8")

    from api import settings as s

    reload(s)
    assert s.load_settings(env_file=env_file).livekit_url == (
        "wss://from-shell.livekit.cloud"
    )


def test_missing_credentials_are_reported_by_name(tmp_path, monkeypatch):
    """Settings can say exactly which vars are missing, for a clear error."""
    for var in _LIVEKIT_VARS:
        monkeypatch.delenv(var, raising=False)
    env_file = tmp_path / ".env.local"
    env_file.write_text("LIVEKIT_URL=wss://example.livekit.cloud\n", encoding="utf-8")

    from api import settings as s

    reload(s)
    missing = s.load_settings(env_file=env_file).missing_livekit_vars()

    assert missing == ("LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")


def test_start_session_names_missing_credentials_instead_of_bare_502(
    tmp_path, monkeypatch
):
    """Unconfigured API must say what's missing, not a generic failure.

    Previously any error became `502 livekit session start failed` with nothing
    logged, so an unconfigured API looked identical to LiveKit being down.
    """
    for var in _LIVEKIT_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("SESSIONS_DB", str(tmp_path / "s.db"))
    monkeypatch.setenv("API_ENV_FILE", str(tmp_path / "absent.env"))

    from api import main as m
    from api import settings as s

    reload(s)
    reload(m)

    r = TestClient(m.app).post(
        "/api/sessions",
        json={
            "rep_slug": "adam-pellegrino",
            "call_type": "closing",
            "persona_slug": "charlie-ritenour-closing",
            "difficulty": "medium",
        },
    )

    assert r.status_code == 503
    error = r.json()["error"]
    assert "LIVEKIT_URL" in error and "LIVEKIT_API_KEY" in error


def test_start_session_logs_the_underlying_livekit_error(tmp_path, monkeypatch, caplog):
    """A real LiveKit failure still 502s, but the cause reaches the log."""
    monkeypatch.setenv("SESSIONS_DB", str(tmp_path / "s.db"))
    monkeypatch.setenv("LIVEKIT_URL", "wss://example.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "APIkey123")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "secret456")

    from api import livekit_session
    from api import main as m
    from api import settings as s

    reload(s)
    reload(m)

    async def _boom(*a, **k):
        raise RuntimeError("connection refused by livekit")

    monkeypatch.setattr(livekit_session, "create_room", _boom)

    with caplog.at_level("ERROR"):
        r = TestClient(m.app).post(
            "/api/sessions",
            json={
                "rep_slug": "adam-pellegrino",
                "call_type": "closing",
                "persona_slug": "charlie-ritenour-closing",
                "difficulty": "medium",
            },
        )

    assert r.status_code == 502
    assert "connection refused by livekit" in caplog.text
