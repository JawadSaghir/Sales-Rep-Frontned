from cleaned_data.cleaning_utils import normalize_grade, parse_no_show, is_real_call


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
