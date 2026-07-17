"""SQLite persistence for the rep-trainer data layer (source of truth)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import yaml

from cleaned_data import DB_PATH, PROFILES_DIR
from cleaned_data.cleaning_utils import aggregate_stats

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


def refresh_summary_tables(conn: sqlite3.Connection) -> None:
    """Rebuild rep_weakness_summary and team_weakness_ranking from call_weaknesses."""
    conn.execute("DELETE FROM rep_weakness_summary")
    conn.execute("DELETE FROM team_weakness_ranking")
    conn.execute("""
      INSERT INTO rep_weakness_summary(rep_id, weak_id, frequency, last_seen)
      SELECT c.rep_id, cw.weak_id,
             CAST(COUNT(DISTINCT cw.call_id) AS REAL)
               / (SELECT COUNT(*) FROM calls c2 WHERE c2.rep_id = c.rep_id),
             MAX(c.call_date)
      FROM call_weaknesses cw JOIN calls c ON c.call_id = cw.call_id
      GROUP BY c.rep_id, cw.weak_id""")
    conn.execute("""
      INSERT INTO team_weakness_ranking(weak_id, rep_count, call_count)
      SELECT cw.weak_id, COUNT(DISTINCT c.rep_id), COUNT(DISTINCT cw.call_id)
      FROM call_weaknesses cw JOIN calls c ON c.call_id = cw.call_id
      GROUP BY cw.weak_id""")
    conn.commit()


def get_rep_drill_plan(
    conn: sqlite3.Connection, slug: str, top_n: int = 3
) -> list[dict]:
    """Top-N weaknesses for a rep, ordered by frequency desc."""
    rows = conn.execute(
        """
      SELECT wt.weak_id, wt.label, rws.frequency, wt.coaching_fix
      FROM rep_weakness_summary rws
      JOIN reps r ON r.rep_id = rws.rep_id
      JOIN weakness_types wt ON wt.weak_id = rws.weak_id
      WHERE r.slug = ? ORDER BY rws.frequency DESC LIMIT ?""",
        (slug, top_n),
    )
    return [dict(r) for r in rows]


def _rep_calls(conn: sqlite3.Connection, rep_id: int) -> list[dict]:
    """Fetch a rep's calls in the shape aggregate_stats expects."""
    rows = conn.execute(
        "SELECT total_score, grade_normalized AS grade, close_ask, call_date "
        "FROM calls WHERE rep_id = ?",
        (rep_id,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["total_score"] = "" if d["total_score"] is None else str(d["total_score"])
        d["did_rep_ask_for_close"] = {1: "yes", 0: "no"}.get(d.pop("close_ask"), "")
        out.append(d)
    return out


def build_profile_dict(
    conn: sqlite3.Connection, slug: str, min_scored_calls: int = 8
) -> dict:
    """Assemble the exported rep-profile shape for a single rep."""
    rep = conn.execute(
        "SELECT rep_id, name, email FROM reps WHERE slug=?", (slug,)
    ).fetchone()
    stats = aggregate_stats(_rep_calls(conn, rep["rep_id"]), min_scored_calls)
    weaknesses = [
        {
            "weakness_type": r["label"],
            "frequency": round(r["frequency"], 2),
            "coaching_fix": r["coaching_fix"],
            "evidence": [
                q["evidence_quote"]
                for q in conn.execute(
                    "SELECT DISTINCT cw.evidence_quote FROM call_weaknesses cw "
                    "JOIN calls c ON c.call_id=cw.call_id "
                    "WHERE c.rep_id=? AND cw.weak_id=? "
                    "AND cw.evidence_quote IS NOT NULL "
                    "LIMIT 3",
                    (rep["rep_id"], r["weak_id"]),
                )
            ],
        }
        for r in conn.execute(
            """
          SELECT wt.weak_id, wt.label, rws.frequency, wt.coaching_fix
          FROM rep_weakness_summary rws JOIN weakness_types wt USING(weak_id)
          WHERE rws.rep_id=? ORDER BY rws.frequency DESC""",
            (rep["rep_id"],),
        )
    ]
    strengths = [
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT biggest_strength FROM calls WHERE rep_id=? AND "
            "biggest_strength IS NOT NULL AND biggest_strength != '' LIMIT 3",
            (rep["rep_id"],),
        )
    ]
    coach_notes = [
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT rudys_note FROM calls WHERE rep_id=? AND "
            "rudys_note IS NOT NULL AND rudys_note != '' LIMIT 3",
            (rep["rep_id"],),
        )
    ]
    return {
        "rep_name": rep["name"],
        "rep_email": rep["email"],
        "rep_slug": slug,
        "stats": stats,
        "recurring_weaknesses": weaknesses,
        "strengths": strengths,
        "coach_notes": coach_notes,
    }


def export_profiles(
    conn: sqlite3.Connection,
    out_dir: Path = PROFILES_DIR,
    min_scored_calls: int = 8,
) -> int:
    """Write one <slug>.yaml profile per rep into out_dir; return the count."""
    out_dir.mkdir(parents=True, exist_ok=True)
    slugs = [r[0] for r in conn.execute("SELECT slug FROM reps")]
    for slug in slugs:
        prof = build_profile_dict(conn, slug, min_scored_calls)
        (out_dir / f"{slug}.yaml").write_text(
            yaml.safe_dump(prof, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
    return len(slugs)
