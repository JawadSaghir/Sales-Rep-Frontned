"""Read Sale-Rep-Profile.csv (row-per-call) and aggregate per rep_name. Pure over row lists."""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path
from statistics import mean

_EMPTY = {"", "none", "unknown", "n/a", "[]"}
GRADE_BANDS = ["weak", "needs_improvement", "developing", "good", "strong", "elite"]
_GRADE_MAP = {
    "a+": "elite", "a": "elite", "a-": "strong", "b+": "strong", "b": "good",
    "b-": "developing", "c+": "developing", "c": "needs_improvement",
    "c-": "needs_improvement", "d+": "needs_improvement", "d": "weak", "d-": "weak",
    "f": "weak", "elite": "elite", "strong": "strong", "good": "good",
    "developing": "developing", "needs improvement": "needs_improvement",
    "needs work": "needs_improvement", "weak": "weak",
}
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def clean(v: str) -> str:
    v = (v or "").strip()
    return "" if v.lower() in _EMPTY else v


def slugify(name: str) -> str:
    return _SLUG_RE.sub("-", (name or "").lower()).strip("-")


def safe_float(v: str) -> float | None:
    try:
        return float(clean(v))
    except (TypeError, ValueError):
        return None


def normalize_grade(raw: str) -> str | None:
    key = clean(raw).lower().replace("−", "-").replace("–", "-").replace("—", "-")  # noqa: RUF001
    return _GRADE_MAP.get(key)


def load_rows(csv_path: str | Path) -> list[dict]:
    p = Path(csv_path)
    if not p.is_file():
        return []
    csv.field_size_limit(10**9)
    with open(p, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f)
                if clean(r.get("rep_name")) and clean(r.get("no_show")).lower()
                not in {"yes", "true"}]


def _by_rep(rows: list[dict], slug: str) -> list[dict]:
    return [r for r in rows if slugify(r.get("rep_name", "")) == slug]


def rep_summaries(rows: list[dict]) -> list[dict]:
    reps: dict[str, list[dict]] = {}
    for r in rows:
        reps.setdefault(slugify(r.get("rep_name", "")), []).append(r)
    out = []
    for slug, rs in sorted(reps.items()):
        scores = [safe_float(r.get("total_score")) for r in rs]
        scores = [s for s in scores if s is not None]
        bands = [b for b in (normalize_grade(r.get("grade", "")) for r in rs) if b]
        counts = Counter(bands)
        out.append({
            "slug": slug,
            "name": rs[0].get("rep_name", "").strip(),
            "calls": len(rs),
            "avg_total_score": round(mean(scores), 1) if scores else None,
            "grade_normalized": (
                max(counts, key=lambda b: (counts[b], GRADE_BANDS.index(b)))
                if bands else None
            ),
        })
    return out


def _snippets(rs: list[dict], field: str, limit: int = 5) -> list[str]:
    seen, out = set(), []
    for r in rs:
        v = clean(r.get(field))
        if v and v not in seen:
            seen.add(v)
            out.append(v)
        if len(out) >= limit:
            break
    return out


def rep_profile(rows: list[dict], slug: str) -> dict | None:
    rs = _by_rep(rows, slug)
    if not rs:
        return None
    summary = next(s for s in rep_summaries(rs) if s["slug"] == slug)
    return {
        **summary,
        "what_to_improve": _snippets(rs, "what_to_improve"),
        "coaching_tip": _snippets(rs, "coaching_tip"),
        "why_no_close": _snippets(rs, "why_no_close"),
        "biggest_strength": _snippets(rs, "biggest_strength"),
        "objections_surfaced": _snippets(rs, "objections_surfaced"),
    }


def rep_drill_plan(rows: list[dict], slug: str) -> list[dict]:
    rs = _by_rep(rows, slug)
    plan = []
    for r in rs:
        focus = clean(r.get("what_to_improve"))
        if focus:
            plan.append({"focus": focus, "evidence": clean(r.get("why_no_close")),
                         "coaching_tip": clean(r.get("coaching_tip"))})
        if len(plan) >= 3:
            break
    return plan
