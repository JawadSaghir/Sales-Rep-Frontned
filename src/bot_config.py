"""Compose Hyperbound-style bots from data-derived + authored config layers."""

from __future__ import annotations

from pathlib import Path

from src.personas import PROMPTS_DIR, _load_yaml

LAYER_DIRS: dict[str, str] = {
    "personas": "personas",
    "scenarios": "scenarios",
    "objection_cards": "objection_cards",
    "call_types": "call_types",
    "difficulty": "difficulty",
    "scorecards": "scorecards",
    "bots": "bots",
}

REAL_SCORE_COLUMNS: frozenset[str] = frozenset(
    {
        "objection_handling",
        "close_mechanics",
        "frame_and_control",
        "prospect_read",
        "did_rep_ask_for_close",
        "self_assessment_accuracy",
    }
)


def load_layer(kind: str, slug: str, prompts_dir: Path = PROMPTS_DIR) -> dict:
    """Load one config layer YAML by kind + slug."""
    if kind not in LAYER_DIRS:
        raise KeyError(f"unknown layer kind: {kind!r}")
    return _load_yaml(Path(prompts_dir) / LAYER_DIRS[kind] / f"{slug}.yaml")


def list_layer_slugs(kind: str, prompts_dir: Path = PROMPTS_DIR) -> list[str]:
    """List available slugs (YAML stems) for a layer kind, sorted."""
    if kind not in LAYER_DIRS:
        raise KeyError(f"unknown layer kind: {kind!r}")
    d = Path(prompts_dir) / LAYER_DIRS[kind]
    if not d.is_dir():
        return []
    return sorted(p.stem for p in d.glob("*.yaml"))


def load_scorecard(name: str, prompts_dir: Path = PROMPTS_DIR) -> dict:
    """Load a scorecard configuration by name."""
    return load_layer("scorecards", name, prompts_dir)


def validate_scorecard(sc: dict) -> None:
    """Validate that scorecard weights sum to 1.0 and all keys are real columns.

    Raises ValueError if weights don't sum to ~1.0 (abs diff > 1e-6) or if any
    key is not in REAL_SCORE_COLUMNS.
    """
    criteria = sc.get("criteria", [])
    total = sum(c["weight"] for c in criteria)
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"scorecard weights sum to {total}, expected 1.0")
    for c in criteria:
        if c["key"] not in REAL_SCORE_COLUMNS:
            raise ValueError(f"scorecard key {c['key']!r} is not a real corpus column")
