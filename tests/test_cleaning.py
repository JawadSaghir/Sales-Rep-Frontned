from statistics import mean

import pytest
import yaml

from cleaned_data import db, embeddings
from cleaned_data.cleaning_utils import (
    aggregate_stats,
    canonicalize_rep,
    extract_objection_phrases,
    has_numeric_score,
    is_real_call,
    normalize_grade,
    parse_close_ask,
    parse_no_show,
    pool_weakness_text,
)


def test_normalize_grade_letters_and_labels():
    assert normalize_grade("A")[0] == "elite"
    assert normalize_grade("A-")[0] == "strong"
    assert normalize_grade("B")[0] == "good"
    assert normalize_grade("C+")[0] == "developing"
    assert normalize_grade("D")[0] == "weak"
    assert normalize_grade("F")[0] == "weak"
    assert normalize_grade("Elite")[0] == "elite"
    assert normalize_grade("Needs Improvement")[0] == "needs_improvement"


def test_normalize_grade_unicode_minus_variants():
    assert normalize_grade("A−")[0] == "strong"  # noqa: RUF001 # minus sign
    assert normalize_grade("B–")[0] == "developing"  # noqa: RUF001 # en dash


def test_normalize_grade_junk_is_quarantined():
    band, raw = normalize_grade("D (context-adjusted: technical disconnect)")
    assert band is None
    assert raw == "D (context-adjusted: technical disconnect)"
    assert normalize_grade("N/A")[0] is None
    assert normalize_grade("")[0] is None


def test_parse_no_show_clean_values_are_attended():
    for v in ["no", "false", "No", "none", ""]:
        assert parse_no_show(v) is False


def test_parse_no_show_detects_genuine_no_shows():
    assert parse_no_show("yes") is True
    assert parse_no_show("Technical No-Show") is True
    assert parse_no_show("Yes — Rep did not appear. Prospect was present.") is True
    assert parse_no_show("Third-party no-show (Dr. O did not attend)") is True


def test_parse_no_show_attended_but_problematic_is_not_no_show():
    # "No — ..." narratives describe attended calls that had issues.
    assert parse_no_show("No — prospect joined but had only 5 minutes") is False


def test_is_real_call_keeps_older_rubric_narrative_rows():
    older = {
        "no_show": "no",
        "total_score": "",
        "grade": "",
        "what_to_improve": "Rep accepted the stall without probing.",
    }
    assert is_real_call(older) is True


def test_is_real_call_drops_no_show_and_empty_rows():
    assert (
        is_real_call({"no_show": "Technical No-Show", "what_to_improve": "x"}) is False
    )
    assert is_real_call({"no_show": "no", "total_score": "", "grade": ""}) is False


def test_parse_close_ask():
    assert parse_close_ask("yes") is True
    assert parse_close_ask("Yes — $2,500 down today") is True
    assert parse_close_ask("no") is False
    assert parse_close_ask("No — not applicable") is False
    assert parse_close_ask("unclear") is None
    assert parse_close_ask("Partially — used 1-10 scale") is None
    assert parse_close_ask("") is None


def test_has_numeric_score():
    assert has_numeric_score({"total_score": "47", "grade": ""}) is True
    assert has_numeric_score({"total_score": "", "grade": "B+"}) is True
    assert has_numeric_score({"total_score": "", "grade": ""}) is False
    assert has_numeric_score({"total_score": "", "grade": "N/A"}) is False


def test_canonicalize_rep_collapses_variants():
    a = canonicalize_rep("Mike Zanardelli", "Mike.Z@Example.com")
    b = canonicalize_rep("  MIKE   ZANARDELLI ", "mike.z@example.com")
    assert a[2] == "mike-zanardelli"
    assert a[2] == b[2]  # same slug despite case/whitespace
    assert a[1] == "mike.z@example.com"  # email lowercased


def test_canonicalize_rep_strips_punctuation():
    assert canonicalize_rep("O'Brien-Smith, Jr.", "")[2] == "o-brien-smith-jr"


def test_extract_objection_phrases_splits_numbered_lists():
    text = (
        "1. Budget/price too high for this year. 2) Wants to talk to advisors "
        "first. 3) Decision feels rushed."
    )
    phrases = extract_objection_phrases(text)
    assert len(phrases) == 3
    assert phrases[0].startswith("Budget/price")
    assert "advisors" in phrases[1]


def test_extract_objection_phrases_handles_empty_and_unnumbered():
    assert extract_objection_phrases("") == []
    assert extract_objection_phrases("Single objection, no numbering.") == [
        "Single objection, no numbering."
    ]


def test_pool_weakness_text_joins_fields():
    row = {
        "what_to_improve": "Probe stalls.",
        "why_no_close": "Accepted stall.",
        "red_flags": "",
    }
    assert pool_weakness_text(row) == "Probe stalls. | Accepted stall."


def _call(score, grade, ask, date):
    return {
        "total_score": score,
        "grade": grade,
        "did_rep_ask_for_close": ask,
        "call_date": date,
    }


def test_aggregate_stats_high_confidence():
    calls = [
        _call(
            str(40 + i),
            "B",
            "yes" if i % 2 else "no",
            f"2026-0{1 + i // 5}-0{1 + i % 5}T10:00:00.000Z",
        )
        for i in range(10)
    ]
    s = aggregate_stats(calls, min_scored_calls=8)
    assert s["calls_with_numeric_score"] == 10
    assert s["data_confidence"] == "high"
    assert s["grade_normalized"] == "good"
    assert 0.0 <= s["close_ask_rate"] <= 1.0
    assert s["avg_total_score"] is not None


def test_aggregate_stats_thin_suppresses_numbers():
    calls = [_call("50", "B", "yes", "2026-01-01T10:00:00.000Z")] * 3
    s = aggregate_stats(calls, min_scored_calls=8)
    assert s["data_confidence"] == "thin"
    assert s["avg_total_score"] is None
    assert s["calls_with_narrative"] == 3


def test_aggregate_stats_counts_narrative_only_rows():
    calls = [
        _call("", "", "", "2026-01-01T10:00:00.000Z"),
        _call("60", "A", "yes", "2026-02-01T10:00:00.000Z"),
    ]
    s = aggregate_stats(calls, min_scored_calls=1)
    assert s["calls_with_narrative"] == 2
    assert s["calls_with_numeric_score"] == 1


def test_aggregate_stats_ignores_non_numeric_total_score():
    # 8 calls with genuinely numeric total_score, plus 1 row that passes
    # has_numeric_score only because of a valid `grade` while `total_score`
    # is junk ("N/A"). That junk row must not blow up averaging/trend.
    valid_calls = [
        _call(
            str(40 + i),
            "B",
            "yes" if i % 2 else "no",
            f"2026-01-0{i + 1}T10:00:00.000Z",
        )
        for i in range(8)
    ]
    junk_call = _call("N/A", "B", "yes", "2026-01-09T10:00:00.000Z")
    calls = [*valid_calls, junk_call]

    s = aggregate_stats(calls, min_scored_calls=8)

    assert s["data_confidence"] == "high"
    assert s["calls_with_numeric_score"] == 9
    assert s["avg_total_score"] is not None
    expected_avg = round(mean(40 + i for i in range(8)), 1)
    assert s["avg_total_score"] == expected_avg


def test_schema_and_load_roundtrip():
    conn = db.connect(":memory:")
    db.create_schema(conn)
    rid = db.upsert_rep(conn, "Mike Zanardelli", "mike.z@x.com", "mike-zanardelli")
    rid2 = db.upsert_rep(conn, "Mike Zanardelli", "mike.z@x.com", "mike-zanardelli")
    assert rid == rid2  # idempotent on slug
    cid = db.insert_call(
        conn,
        rid,
        {
            "total_score": 47,
            "grade_normalized": "developing",
            "grade_raw": "Developing",
            "close_ask": 1,
            "has_numeric_score": 1,
            "what_to_improve": "Probe stalls.",
            "objections_surfaced": "1. Price. 2. Timing.",
        },
    )
    assert isinstance(cid, int)
    row = conn.execute(
        "SELECT rep_id, total_score FROM calls WHERE call_id=?", (cid,)
    ).fetchone()
    assert row["rep_id"] == rid
    assert row["total_score"] == 47
    tables = {
        r["name"]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert {
        "reps",
        "calls",
        "objection_types",
        "weakness_types",
        "call_objections",
        "call_weaknesses",
        "export_meta",
        "personas",
        "persona_objections",
        "rep_weakness_summary",
        "team_weakness_ranking",
        "rep_persona_match_scores",
    } <= tables


def _seed_two_weaknesses(conn):
    db.create_schema(conn)
    rid = db.upsert_rep(conn, "Mike Zanardelli", "m@x.com", "mike-zanardelli")
    conn.execute(
        "INSERT INTO weakness_types(weak_id,label,definition,coaching_fix)"
        " VALUES(1,'accepts-stalls','desc','Probe the stall.')"
    )
    for i in range(9):
        cid = db.insert_call(
            conn,
            rid,
            {
                "total_score": 45 + i,
                "grade_normalized": "developing",
                "grade_raw": "Developing",
                "close_ask": i % 2,
                "has_numeric_score": 1,
                "call_date": f"2026-01-0{i + 1}T10:00:00.000Z",
                "biggest_strength": "Clean walkthrough.",
                "rudys_note": "Behavioral gap.",
                "what_to_improve": "Probe stalls.",
            },
        )
        conn.execute(
            "INSERT INTO call_weaknesses(call_id,weak_id,evidence_quote)"
            " VALUES(?,1,'stall accepted')",
            (cid,),
        )
    conn.commit()
    return rid


def test_summary_and_drill_plan():
    conn = db.connect(":memory:")
    _seed_two_weaknesses(conn)
    db.refresh_summary_tables(conn)
    plan = db.get_rep_drill_plan(conn, "mike-zanardelli", top_n=3)
    assert plan and plan[0]["label"] == "accepts-stalls"
    assert plan[0]["coaching_fix"] == "Probe the stall."


def test_build_profile_dict_shape():
    conn = db.connect(":memory:")
    _seed_two_weaknesses(conn)
    db.refresh_summary_tables(conn)
    prof = db.build_profile_dict(conn, "mike-zanardelli")
    assert prof["rep_slug"] == "mike-zanardelli"
    assert prof["stats"]["data_confidence"] == "high"
    assert prof["recurring_weaknesses"][0]["weakness_type"] == "accepts-stalls"
    assert "strengths" in prof and "coach_notes" in prof
    # round-trips as YAML
    assert yaml.safe_load(yaml.safe_dump(prof))["rep_slug"] == "mike-zanardelli"


def test_export_profiles_writes_yaml(tmp_path):
    conn = db.connect(":memory:")
    _seed_two_weaknesses(conn)
    db.refresh_summary_tables(conn)
    n = db.export_profiles(conn, out_dir=tmp_path)
    assert n == 1
    f = tmp_path / "mike-zanardelli.yaml"
    assert f.exists()
    data = yaml.safe_load(f.read_text(encoding="utf-8"))
    assert data["rep_slug"] == "mike-zanardelli"
    assert data["recurring_weaknesses"][0]["weakness_type"] == "accepts-stalls"


def test_build_profile_dict_unknown_slug_raises():
    conn = db.connect(":memory:")
    db.create_schema(conn)
    with pytest.raises(ValueError):
        db.build_profile_dict(conn, "does-not-exist")


def test_cluster_vectors_separates_two_blobs():
    import numpy as np

    rng = np.random.default_rng(0)
    a = rng.normal(0, 0.02, size=(15, 8)) + 0.0
    b = rng.normal(0, 0.02, size=(15, 8)) + 5.0
    vectors = np.vstack([a, b]).tolist()
    labels = embeddings.cluster_vectors(vectors, min_cluster_size=5)
    non_noise = {label for label in labels if label != -1}
    assert len(non_noise) >= 2


def test_group_by_cluster_drops_noise():
    grouped = embeddings.group_by_cluster(["x", "y", "z"], [0, 0, -1])
    assert grouped == {0: ["x", "y"]}
