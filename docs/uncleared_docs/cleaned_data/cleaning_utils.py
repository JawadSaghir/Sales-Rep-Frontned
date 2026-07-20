"""Pure cleaning/aggregation helpers for the rep-trainer data layer.

No I/O here: every function takes plain values and returns plain values so the
whole module is trivially unit-testable.
"""

from __future__ import annotations

import re
from collections import Counter
from statistics import mean

from cleaned_data import GRADE_BANDS

_GRADE_MAP: dict[str, str] = {
    # letter grades
    "a+": "elite",
    "a": "elite",
    "a-": "strong",
    "b+": "strong",
    "b": "good",
    "b-": "developing",
    "c+": "developing",
    "c": "needs_improvement",
    "c-": "needs_improvement",
    "d+": "needs_improvement",
    "d": "weak",
    "d-": "weak",
    "f": "weak",
    # qualitative labels
    "elite": "elite",
    "strong": "strong",
    "good": "good",
    "developing": "developing",
    "needs improvement": "needs_improvement",
    "needs work": "needs_improvement",
    "weak": "weak",
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


def parse_close_ask(raw: str) -> bool | None:
    """yes*→True, no*→False, unclear/partial/blank→None."""
    v = (raw or "").strip().lower()
    if v.startswith("yes"):
        return True
    if v.startswith("no"):
        return False
    return None


def _safe_float(value: object) -> float | None:
    """Parse a numeric string; return None if absent or non-numeric."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def has_numeric_score(row: dict) -> bool:
    """True when the row carries a usable numeric grade (newer rubric)."""
    if (row.get("total_score") or "").strip():
        return True
    return normalize_grade(row.get("grade", ""))[0] is not None


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def canonicalize_rep(name: str, email: str) -> tuple[str, str, str]:
    """Return (canonical_name, email_lower, slug); variants collapse to one slug."""
    canonical_name = " ".join((name or "").split())
    email_lower = (email or "").strip().lower()
    slug = _SLUG_RE.sub("-", canonical_name.lower()).strip("-")
    return (canonical_name, email_lower, slug)


_NUM_MARKER_RE = re.compile(r"\s*\d+[.)]\s*")


def extract_objection_phrases(text: str) -> list[str]:
    """Split a numbered-list narrative into individual phrases."""
    text = (text or "").strip()
    if not text:
        return []
    parts = _NUM_MARKER_RE.split(text)
    return [p.strip() for p in parts if len(p.strip()) >= 4]


def pool_weakness_text(row: dict) -> str:
    """Concatenate the weakness free-text fields into one blob for clustering."""
    fields = ("what_to_improve", "why_no_close", "red_flags")
    return " | ".join(
        (row.get(f) or "").strip() for f in fields if (row.get(f) or "").strip()
    )


def _trend(scored: list[dict]) -> str:
    """Compare mean total_score of the older vs newer half, by call_date."""
    dated = [
        (c["call_date"], score)
        for c in scored
        if (c.get("call_date") or "").strip()
        and (score := _safe_float(c.get("total_score"))) is not None
    ]
    if len(dated) < 4:
        return "unknown"
    dated.sort(key=lambda d: d[0])
    half = len(dated) // 2
    first = mean(score for _, score in dated[:half])
    second = mean(score for _, score in dated[half:])
    if second - first > 2:
        return "improving"
    if first - second > 2:
        return "declining"
    return "flat"


def aggregate_stats(calls: list[dict], min_scored_calls: int = 8) -> dict:
    """Deterministic per-rep numeric rollup with thin-data suppression."""
    scored = [c for c in calls if has_numeric_score(c)]
    with_score = [c for c in scored if (c.get("total_score") or "").strip()]
    numeric_scores = [
        s
        for s in (_safe_float(c.get("total_score")) for c in with_score)
        if s is not None
    ]
    bands = [b for b in (normalize_grade(c.get("grade", ""))[0] for c in scored) if b]
    asks = [parse_close_ask(c.get("did_rep_ask_for_close", "")) for c in calls]
    clean_asks = [a for a in asks if a is not None]

    confidence = "high" if len(scored) >= min_scored_calls else "thin"
    modal_band = (
        max(Counter(bands), key=lambda b: (Counter(bands)[b], GRADE_BANDS.index(b)))
        if bands
        else None
    )
    avg = (
        round(mean(numeric_scores), 1)
        if numeric_scores and confidence == "high"
        else None
    )
    return {
        "calls_with_narrative": len(calls),
        "calls_with_numeric_score": len(scored),
        "avg_total_score": avg,
        "grade_normalized": modal_band,
        "grade_trend": _trend(with_score) if confidence == "high" else "unknown",
        "close_ask_rate": (
            round(sum(clean_asks) / len(clean_asks), 2) if clean_asks else None
        ),
        "data_confidence": confidence,
    }
