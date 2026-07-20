"""LiveKit room metadata + join-token minting for the session handoff."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import TYPE_CHECKING

from api.settings import Settings

if TYPE_CHECKING:
    from context.models import Selection


def build_room_metadata(
    session_id: str, rep_slug: str, bot_slug: str, selection: Selection
) -> str:
    """Serialize the room metadata the agent reads on join.

    The Selection fields are emitted flat because the agent rebuilds its
    Selection from them (context.selection.selection_from_metadata). Omitting
    persona_id there silently falls back to the default persona, so every
    field the agent reads must be present here.
    """
    return json.dumps(
        {
            "session_id": session_id,
            "rep_slug": rep_slug,
            "bot_slug": bot_slug,
            "persona_id": selection.persona_id,
            "scenario_id": selection.scenario_id,
            "call_type": selection.call_type,
            "difficulty": selection.difficulty,
            "scorecard": selection.scorecard,
        }
    )


def mint_token(room: str, identity: str, settings: Settings) -> str:
    from livekit import api as lk

    return (
        lk.AccessToken(settings.livekit_key, settings.livekit_secret)
        .with_identity(identity)
        .with_ttl(timedelta(hours=1))
        .with_grants(lk.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )


async def create_room(room: str, metadata: str, settings: Settings) -> None:
    from livekit import api as lk

    client = lk.LiveKitAPI(
        settings.livekit_url, settings.livekit_key, settings.livekit_secret
    )
    try:
        await client.room.create_room(
            lk.CreateRoomRequest(name=room, metadata=metadata)
        )
    finally:
        await client.aclose()
