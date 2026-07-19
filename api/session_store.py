"""Standalone SQLite persistence for roleplay sessions (API-owned)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions(
  session_id TEXT PRIMARY KEY, rep_slug TEXT, bot_slug TEXT, call_type TEXT,
  difficulty TEXT, room TEXT, status TEXT, created_at TEXT, score_json TEXT);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


def create_session(conn: sqlite3.Connection, rec: dict) -> None:
    conn.execute(
        "INSERT INTO sessions(session_id, rep_slug, bot_slug, call_type, difficulty, "
        "room, status, created_at, score_json) VALUES(:session_id,:rep_slug,:bot_slug,"
        ":call_type,:difficulty,:room,:status,:created_at,:score_json)",
        rec,
    )
    conn.commit()


def get_session(conn: sqlite3.Connection, sid: str) -> dict | None:
    row = conn.execute("SELECT * FROM sessions WHERE session_id=?", (sid,)).fetchone()
    return dict(row) if row else None
