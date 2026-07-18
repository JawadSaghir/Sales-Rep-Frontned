"""Compose Hyperbound-style bots from data-derived + authored config layers."""

from __future__ import annotations

from pathlib import Path

from src.personas import PROMPTS_DIR, _load_yaml, load_offer, render_prompt

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


def difficulty_framing(difficulty: dict) -> str:
    """Render the difficulty layer into a short natural-language frame."""
    return (
        f"Your baseline posture today is {difficulty['skepticism_baseline']}. "
        f"You soften {difficulty['softening_speed']} when the rep genuinely "
        f"acknowledges you. If the rep ignores or talks over you "
        f"{difficulty['shutdown_threshold']} time(s), you shut the call down. "
        + (
            "Your objections stack: unresolved ones resurface and new ones appear."
            if difficulty.get("objections_stack")
            else "You raise mainly your primary objection and do not pile others on."
        )
    )


def build_bot_prompt(
    bot_slug: str,
    *,
    prompts_dir: Path = PROMPTS_DIR,
    template_name: str = "behavior_template.md",
) -> str:
    """Compose a bot's layers and render the behavior template."""
    bot = load_layer("bots", bot_slug, prompts_dir)
    persona = load_layer("personas", bot["persona"], prompts_dir)
    scenario = load_layer("scenarios", bot["scenario"], prompts_dir)
    objection = load_layer("objection_cards", bot["objection_card"], prompts_dir)
    call_type = load_layer("call_types", bot["call_type"], prompts_dir)
    difficulty = load_layer("difficulty", bot["difficulty"], prompts_dir)

    values: dict = {}
    values.update(load_offer())
    values.update(persona)
    values.update(scenario)
    values.update(objection)
    values["call_type_frame"] = call_type["frame"]
    values["rep_objective"] = call_type["rep_objective"]
    values["difficulty_framing"] = difficulty_framing(difficulty)
    values["character_name_upper"] = str(persona.get("character_name", "")).upper()

    # The template is a shared, non-per-bot asset: always load it from the
    # canonical PROMPTS_DIR, not the (possibly overridden) layer prompts_dir.
    template = (Path(PROMPTS_DIR) / template_name).read_text(encoding="utf-8")
    return render_prompt(template, values)
