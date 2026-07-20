"""Roleplay session endpoints — create (LiveKit handoff) + read."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api import livekit_session, session_store
from api.routers.catalog import bot_config
from api.schemas import ok
from api.settings import load_settings
from context.models import Selection

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class StartSession(BaseModel):
    rep_slug: str
    call_type: str
    persona_slug: str
    difficulty: str


def _uuid() -> str:
    import uuid

    return uuid.uuid4().hex


@router.post("/sessions")
async def start_session(body: StartSession) -> dict:
    if body.call_type not in bot_config.list_layer_slugs("call_types"):
        raise HTTPException(
            status_code=400, detail=f"unknown call_type {body.call_type!r}"
        )
    if body.persona_slug not in bot_config.list_layer_slugs("bots"):
        raise HTTPException(
            status_code=400, detail=f"unknown persona {body.persona_slug!r}"
        )
    if body.difficulty not in bot_config.list_layer_slugs("difficulty"):
        raise HTTPException(
            status_code=400, detail=f"unknown difficulty {body.difficulty!r}"
        )
    settings = load_settings()
    missing = settings.missing_livekit_vars()
    if missing:
        # Misconfiguration, not an upstream outage — name the vars so this is
        # distinguishable from LiveKit actually being down.
        raise HTTPException(
            status_code=503,
            detail=f"LiveKit not configured — set {', '.join(missing)} in .env.local",
        )
    sid = _uuid()
    room = f"roleplay_{sid}"
    # Resolve the chosen bot into the Selection the agent rebuilds on join.
    # call_type and difficulty come from the session (the user picked them) and
    # intentionally override the bot's own defaults.
    bot = bot_config.load_layer("bots", body.persona_slug)
    persona_id = bot.get("persona", "")
    selection = Selection(
        persona_id=persona_id,
        scenario_id=bot.get("scenario", persona_id),
        call_type=body.call_type,
        difficulty=body.difficulty,
        scorecard=bot.get("scorecard", ""),
    )
    metadata = livekit_session.build_room_metadata(
        sid, body.rep_slug, body.persona_slug, selection
    )
    try:
        await livekit_session.create_room(room, metadata, settings)
        token = livekit_session.mint_token(room, body.rep_slug or "rep", settings)
    except Exception as exc:  # surface as 502, no secret leak
        # Log the cause: the client only ever sees the generic message, so
        # without this an upstream failure left no diagnostic anywhere.
        logger.exception("livekit session start failed for room %s", room)
        raise HTTPException(
            status_code=502, detail="livekit session start failed"
        ) from exc
    conn = session_store.connect(settings.sessions_db)
    session_store.create_session(
        conn,
        {
            "session_id": sid,
            "rep_slug": body.rep_slug,
            "bot_slug": body.persona_slug,
            "call_type": body.call_type,
            "difficulty": body.difficulty,
            "room": room,
            "status": "created",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "score_json": None,
        },
    )
    return ok(
        {
            "session_id": sid,
            "room": room,
            "token": token,
            "livekit_url": settings.livekit_url,
        }
    )


@router.get("/sessions/{sid}")
def get_session(sid: str) -> dict:
    conn = session_store.connect(load_settings().sessions_db)
    rec = session_store.get_session(conn, sid)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"no session {sid!r}")
    return ok(
        {
            "session_id": rec["session_id"],
            "status": rec["status"],
            "score": rec["score_json"],
        }
    )
