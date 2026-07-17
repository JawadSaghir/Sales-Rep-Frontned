from cleaned_data.cleaning_utils import normalize_grade


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
