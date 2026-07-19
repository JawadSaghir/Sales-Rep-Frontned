"""Build a Selection from LiveKit room metadata, with a console fallback."""

from __future__ import annotations

import json

from context.models import Selection

DEFAULT_SELECTION = Selection(
    persona_id="april-alvarado",
    scenario_id="april-alvarado",
    call_type="closing",
    difficulty="medium",
    scorecard="closing_v1",
)


def selection_from_metadata(metadata: str | None, *, fallback: Selection) -> Selection:
    """Parse LiveKit room metadata JSON into a Selection; fall back if absent/invalid."""
    if not metadata:
        return fallback
    try:
        d = json.loads(metadata)
    except (ValueError, TypeError):
        return fallback
    if not isinstance(d, dict) or "persona_id" not in d:
        return fallback
    return Selection(
        persona_id=str(d["persona_id"]),
        scenario_id=str(d.get("scenario_id", d["persona_id"])),
        call_type=str(d.get("call_type", fallback.call_type)),
        difficulty=str(d.get("difficulty", fallback.difficulty)),
        scorecard=str(d.get("scorecard", fallback.scorecard)),
        add_objection_ids=tuple(d.get("add_objection_ids", ())),
        remove_objection_ids=tuple(d.get("remove_objection_ids", ())),
    )
