"""SQLite persistence for the rep-trainer data layer (source of truth)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from cleaned_data import DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS reps(
  rep_id INTEGER PRIMARY KEY, name TEXT, email TEXT, slug TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS calls(
  call_id INTEGER PRIMARY KEY, rep_id INTEGER REFERENCES reps(rep_id),
  client_name TEXT, call_date TEXT, show_name TEXT, meeting_id TEXT,
  total_score REAL, grade_normalized TEXT, grade_raw TEXT,
  close_ask INTEGER, has_numeric_score INTEGER,
  intended_outcome TEXT, deal_outcome_context TEXT, flagged_followup TEXT,
  one_line_verdict TEXT, biggest_strength TEXT, what_went_well TEXT,
  what_made_close_work TEXT, what_to_improve TEXT, why_no_close TEXT,
  red_flags TEXT, coaching_tip TEXT, rep_improvement TEXT, rudys_note TEXT,
  objections_surfaced TEXT);
CREATE TABLE IF NOT EXISTS objection_types(
  obj_id INTEGER PRIMARY KEY, label TEXT, definition TEXT, aliases TEXT);
CREATE TABLE IF NOT EXISTS weakness_types(
  weak_id INTEGER PRIMARY KEY, label TEXT, definition TEXT, coaching_fix TEXT);
CREATE TABLE IF NOT EXISTS call_objections(
  call_id INTEGER REFERENCES calls(call_id),
  obj_id INTEGER REFERENCES objection_types(obj_id), handled TEXT, quote TEXT);
CREATE TABLE IF NOT EXISTS call_weaknesses(
  call_id INTEGER REFERENCES calls(call_id),
  weak_id INTEGER REFERENCES weakness_types(weak_id), evidence_quote TEXT);
CREATE TABLE IF NOT EXISTS export_meta(
  export_id INTEGER PRIMARY KEY, generated_at TEXT, taxonomy_version TEXT,
  model_used TEXT, git_sha TEXT, row_counts_json TEXT);
CREATE TABLE IF NOT EXISTS personas(persona_id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS persona_objections(
  persona_id INTEGER REFERENCES personas(persona_id),
  obj_id INTEGER REFERENCES objection_types(obj_id));
CREATE TABLE IF NOT EXISTS rep_weakness_summary(
  rep_id INTEGER, weak_id INTEGER, frequency REAL, last_seen TEXT);
CREATE TABLE IF NOT EXISTS team_weakness_ranking(
  weak_id INTEGER, rep_count INTEGER, call_count INTEGER);
CREATE TABLE IF NOT EXISTS rep_persona_match_scores(
  rep_id INTEGER, persona_id INTEGER, score REAL);
CREATE INDEX IF NOT EXISTS ix_reps_slug ON reps(slug);
CREATE INDEX IF NOT EXISTS ix_rws_rep ON rep_weakness_summary(rep_id);
"""

_CALL_COLUMNS = [
    "client_name",
    "call_date",
    "show_name",
    "meeting_id",
    "total_score",
    "grade_normalized",
    "grade_raw",
    "close_ask",
    "has_numeric_score",
    "intended_outcome",
    "deal_outcome_context",
    "flagged_followup",
    "one_line_verdict",
    "biggest_strength",
    "what_went_well",
    "what_made_close_work",
    "what_to_improve",
    "why_no_close",
    "red_flags",
    "coaching_tip",
    "rep_improvement",
    "rudys_note",
    "objections_surfaced",
]


def connect(path: str | Path = DB_PATH) -> sqlite3.Connection:
    """Open SQLite connection with row_factory and foreign keys enabled."""
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    """Create all tables and indexes from _SCHEMA."""
    conn.executescript(_SCHEMA)
    conn.commit()


def upsert_rep(conn: sqlite3.Connection, name: str, email: str, slug: str) -> int:
    """Idempotent rep upsert on slug; returns rep_id."""
    conn.execute(
        "INSERT INTO reps(name, email, slug) VALUES(?,?,?) "
        "ON CONFLICT(slug) DO UPDATE SET name=excluded.name, email=excluded.email",
        (name, email, slug),
    )
    conn.commit()
    return conn.execute("SELECT rep_id FROM reps WHERE slug=?", (slug,)).fetchone()[0]


def insert_call(conn: sqlite3.Connection, rep_id: int, fields: dict) -> int:
    """Insert a call; returns call_id."""
    cols = ["rep_id", *_CALL_COLUMNS]
    vals = [rep_id] + [fields.get(c) for c in _CALL_COLUMNS]
    placeholders = ",".join("?" * len(cols))
    cur = conn.execute(
        f"INSERT INTO calls({','.join(cols)}) VALUES({placeholders})", vals
    )
    conn.commit()
    return cur.lastrowid
