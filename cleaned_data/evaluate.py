"""Profile-quality rubric so export quality is measurable, not vibes."""

from __future__ import annotations


def evaluate_profiles(profiles: list[dict]) -> dict:
    weaknesses = [w for p in profiles for w in p.get("recurring_weaknesses", [])]
    n_w = len(weaknesses) or 1
    n_p = len(profiles) or 1
    ge2_evidence = sum(1 for w in weaknesses if len(w.get("evidence", [])) >= 2)
    has_fix = sum(1 for w in weaknesses if (w.get("coaching_fix") or "").strip())
    classified = sum(1 for p in profiles if p.get("recurring_weaknesses"))
    return {
        "n_profiles": len(profiles),
        "evidence_coverage": round(ge2_evidence / n_w, 2),
        "coaching_fix_completeness": round(has_fix / n_w, 2),
        "classification_coverage": round(classified / n_p, 2),
    }
