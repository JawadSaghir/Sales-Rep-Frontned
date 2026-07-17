"""Pure cleaning/aggregation helpers for the rep-trainer data layer.

No I/O here: every function takes plain values and returns plain values so the
whole module is trivially unit-testable.
"""

from __future__ import annotations

_GRADE_MAP: dict[str, str] = {
    # letter grades
    "a+": "elite", "a": "elite", "a-": "strong",
    "b+": "strong", "b": "good", "b-": "developing",
    "c+": "developing", "c": "needs_improvement", "c-": "needs_improvement",
    "d+": "needs_improvement", "d": "weak", "d-": "weak", "f": "weak",
    # qualitative labels
    "elite": "elite", "strong": "strong", "good": "good",
    "developing": "developing", "needs improvement": "needs_improvement",
    "needs work": "needs_improvement", "weak": "weak",
}


def normalize_grade(raw: str) -> tuple[str | None, str]:
    """Map a raw grade to one band, or (None, raw) if it is junk/absent.

    Unicode minus (U+2212) and en/em dashes are folded to ASCII '-'.
    """
    raw = (raw or "").strip()
    key = raw.lower().replace("−", "-").replace("–", "-").replace("—", "-")  # noqa: RUF001
    return (_GRADE_MAP.get(key), raw)
