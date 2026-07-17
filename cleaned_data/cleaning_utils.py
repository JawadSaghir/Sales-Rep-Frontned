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


FREE_TEXT_FIELDS: tuple[str, ...] = (
    "what_to_improve",
    "why_no_close",
    "red_flags",
    "coaching_tip",
    "one_line_verdict",
    "rudys_note",
    "objections_surfaced",
)

_NO_SHOW_MARKERS = ("no-show", "no show", "did not appear", "did not attend")


def parse_no_show(raw: str) -> bool:
    """True only when the rep genuinely did not show.

    The column mixes clean values ('no'/'false'/'No'/'none') with free-text.
    'No — ...' narratives describe attended-but-problematic calls (not no-shows).
    """
    v = (raw or "").strip().lower()
    if v in {"", "no", "false", "none"}:
        return False
    if v in {"yes", "true"}:
        return True
    if v.startswith("no "):  # "no — prospect joined but ..." = attended
        return False
    if v.startswith("yes"):
        return True
    return any(m in v for m in _NO_SHOW_MARKERS)


def is_real_call(row: dict) -> bool:
    """Keep the row unless it is a genuine no-show or has no usable content."""
    if parse_no_show(row.get("no_show", "")):
        return False
    has_text = any((row.get(f) or "").strip() for f in FREE_TEXT_FIELDS)
    has_score = bool((row.get("total_score") or "").strip()) or bool(
        (row.get("grade") or "").strip()
    )
    return has_text or has_score
