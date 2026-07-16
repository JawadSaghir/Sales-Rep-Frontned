"""Load YAML personas and render them into the shared prospect system prompt.

A persona is data (prompts/personas/<stem>.yaml); the shared behavior lives in
prompts/prospect_template.md as {{placeholders}}. render_prompt fills every
placeholder and RAISES if any is left unfilled, so a half-built prompt can never
reach the agent.
"""

import re
from pathlib import Path

import yaml

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
TEMPLATE_PATH = PROMPTS_DIR / "prospect_template.md"
PERSONAS_DIR = PROMPTS_DIR / "personas"
OFFER_PATH = PROMPTS_DIR / "offer.yaml"

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def _load_yaml(path: Path) -> dict:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}


def load_persona(stem: str, personas_dir: Path = PERSONAS_DIR) -> dict:
    """Read a persona's YAML data by file stem from prompts/personas/."""
    return _load_yaml(Path(personas_dir) / f"{stem}.yaml")


def load_offer(path: Path = OFFER_PATH) -> dict:
    """Read the shared call context (company_name, offer_description)."""
    return _load_yaml(path)


def _stringify(value: object) -> str:
    if isinstance(value, (list, tuple)):
        return "; ".join(str(v).strip() for v in value)
    return str(value).strip()


def render_prompt(template: str, values: dict) -> str:
    """Fill {{placeholders}} from values. Raise KeyError on any missing key."""

    def repl(match: re.Match) -> str:
        key = match.group(1)
        if key not in values:
            raise KeyError(f"Missing value for placeholder {{{{{key}}}}}")
        return _stringify(values[key])

    return _PLACEHOLDER.sub(repl, template)


def build_values(persona: dict, offer: dict) -> dict:
    """Merge offer + persona and compute derived placeholders."""
    values: dict = {}
    values.update(offer)
    values.update(persona)
    values["character_name_upper"] = str(persona.get("character_name", "")).upper()
    return values


def build_prospect_prompt(
    stem: str,
    *,
    template_path: Path = TEMPLATE_PATH,
    personas_dir: Path = PERSONAS_DIR,
    offer_path: Path = OFFER_PATH,
) -> str:
    """Render the full prospect system prompt for a persona stem."""
    template = Path(template_path).read_text(encoding="utf-8")
    values = build_values(load_persona(stem, personas_dir), load_offer(offer_path))
    return render_prompt(template, values)
