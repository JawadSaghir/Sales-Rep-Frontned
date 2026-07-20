"""Shared config-data root + YAML reader for the catalog/session API.

The legacy persona-rendering pipeline (build_prospect_prompt, build_briefing,
offer.yaml, and prospect_template.md {{placeholders}}) was retired when the
runtime moved to the context/ system (see context/renderer.py::render_buyer).
Only the data root and the YAML reader remain here, used by bot_config to back
the catalog and session-validation endpoints.
"""

from pathlib import Path

import yaml

# All config data lives under context/data/ (the legacy prompts/ dir was removed).
PROMPTS_DIR = Path(__file__).parent.parent / "context" / "data"


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
