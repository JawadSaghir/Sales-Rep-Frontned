"""LiveKit room metadata + join-token minting for the session handoff."""

from __future__ import annotations

import json
from datetime import timedelta

from api.settings import Settings


def build_room_metadata(
    session_id: str, rep_slug: str, bot_slug: str, difficulty: str
) -> str:
    return json.dumps(
        {
            "session_id": session_id,
            "rep_slug": rep_slug,
            "bot_slug": bot_slug,
            "difficulty": difficulty,
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
