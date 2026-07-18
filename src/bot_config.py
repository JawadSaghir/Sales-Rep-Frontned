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


def load_layer(kind: str, slug: str, prompts_dir: Path = PROMPTS_DIR) -> dict:
    """Load one config layer YAML by kind + slug."""
    if kind not in LAYER_DIRS:
        raise KeyError(f"unknown layer kind: {kind!r}")
    return _load_yaml(Path(prompts_dir) / LAYER_DIRS[kind] / f"{slug}.yaml")
