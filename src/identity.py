"""Resolve a stable trainee id (rep_id) for memory + scorecard keys."""

import json
import re


def _normalize(value: str) -> str:
    return re.sub(r"\s+", "_", value.strip()).lower()


def resolve_rep_id(
    room_metadata: str | None,
    participant_identity: str | None,
    env_rep_id: str | None,
) -> str:
    """Pick the trainee id from the best available source.

    Priority: room metadata JSON {"rep_id": ...} -> participant identity ->
    env REP_ID -> "unknown". Result is lowercased with spaces collapsed to "_".
    """
    if room_metadata:
        try:
            meta = json.loads(room_metadata)
            candidate = meta.get("rep_id")
            if candidate:
                return _normalize(str(candidate))
        except (ValueError, AttributeError):
            pass
    if participant_identity:
        return _normalize(participant_identity)
    if env_rep_id:
        return _normalize(env_rep_id)
    return "unknown"
