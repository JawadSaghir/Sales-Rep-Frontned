"""Build a Selection from LiveKit room metadata, with a console fallback."""

from __future__ import annotations

import json

from context.models import Selection


def _id_list(value: object) -> tuple[str, ...]:
    """Coerce a JSON value into a tuple of id strings; ignore non-list values.

    A bare string (e.g. ``"authority"``) would otherwise ``tuple()`` into
    per-character ids, so only genuine lists/tuples are accepted.
    """
    if isinstance(value, (list, tuple)):
        return tuple(str(x) for x in value)
    return ()


# charlie-ritenour is the only persona with a matching scenario present in
# context/data; the former april-alvarado persona file was removed during the
# persona-gen refactor, leaving this default pointing at a missing layer.
DEFAULT_SELECTION = Selection(
    persona_id="charlie-ritenour",
    scenario_id="charlie-ritenour",
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
        add_objection_ids=_id_list(d.get("add_objection_ids")),
        remove_objection_ids=_id_list(d.get("remove_objection_ids")),
    )
