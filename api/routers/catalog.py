"""Catalog endpoints: call-types, buyer personas, difficulties (from context/data)."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import APIRouter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))  # repo root for `src`
from api.schemas import ok
from context.assembler import AssembleError, assemble
from context.models import Selection
from src import bot_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


def _label(slug: str) -> str:
    return slug.replace("_", " ").replace("-", " ").title()


@router.get("/call-types")
def call_types() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("call_types"):
        ct = bot_config.load_layer("call_types", slug)
        out.append(
            {
                "slug": slug,
                "label": _label(slug),
                "locked": False,
                "rep_objective": ct.get("rep_objective", ""),
            }
        )
    return ok(out)


@router.get("/difficulties")
def difficulties() -> dict:
    out = []
    for slug in bot_config.list_layer_slugs("difficulty"):
        d = bot_config.load_layer("difficulty", slug)
        out.append(
            {
                "level": d.get("level", slug),
                "skepticism_baseline": d.get("skepticism_baseline", ""),
            }
        )
    return ok(out)


@router.get("/personas")
def personas() -> dict:
    """List selectable bots, resolved through the context pipeline.

    Each bot is assembled so the payload carries real text (the primary
    objection's trigger) rather than bare layer ids. A bot whose layers don't
    resolve is skipped with a warning instead of failing the whole endpoint.
    """
    out = []
    for slug in bot_config.list_layer_slugs("bots"):
        bot = bot_config.load_layer("bots", slug)
        persona_id = bot.get("persona", "")
        selection = Selection(
            persona_id=persona_id,
            scenario_id=bot.get("scenario", persona_id),
            call_type=bot.get("call_type", ""),
            difficulty=bot.get("difficulty", ""),
            scorecard=bot.get("scorecard", ""),
        )
        try:
            ctx, _ = assemble(selection)
        except AssembleError:
            logger.warning("skipping bot %s: unresolved context layer", slug)
            continue
        # company_id isn't part of the Persona model, so read it from the raw
        # layer to give the UI a business name instead of a blank subtitle.
        persona_raw = bot_config.load_layer("personas", persona_id)
        company = str(persona_raw.get("company_id", "")).replace("-", " ").title()
        primary = ctx.objection_pack.primary
        out.append(
            {
                "slug": slug,
                "character_name": ctx.persona.name,
                "business_name": company,
                "industry": ctx.persona.title,
                "primary_objection": primary.trigger if primary else "",
            }
        )
    return ok(out)
