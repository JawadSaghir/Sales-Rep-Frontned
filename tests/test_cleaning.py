from cleaned_data.cleaning_utils import (
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
        is_real_call({"no_show": "Technical No-Show", "what_to_improve": "x"})
        is False
    )
    assert (
        is_real_call({"no_show": "no", "total_score": "", "grade": ""}) is False
    )


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
    text = ("1. Budget/price too high for this year. 2) Wants to talk to advisors "
            "first. 3) Decision feels rushed.")
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
    row = {"what_to_improve": "Probe stalls.", "why_no_close": "Accepted stall.",
           "red_flags": ""}
    assert pool_weakness_text(row) == "Probe stalls. | Accepted stall."
